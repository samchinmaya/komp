//! The compressor: raw log text in → short, meaningful summary out.
//!
//! The pipeline, one function per step:
//!
//! 1. `parse`: split the text into records (timestamp, level, message, stack-trace
//!    lines). Understands plain text, JSON, logfmt, klog, syslog, nginx/Apache access
//!    logs, and Docker, containerd, `kubectl --prefix` and Compose wrappers.
//! 2. `hoist`: anything every line shares (a `[pod/api-…]` tag, `env=prod`) moves into
//!    the header once instead of repeating per line.
//! 3. mine: Drain (`drain.rs`) finds which messages share a template.
//! 4. group: each template's differing tokens become slots, and the group remembers
//!    every slot value, the count and the time range.
//! 5. render: one line per group, such as `10:00:01–10:00:07 INFO GET /health 200 1–3ms ×4`,
//!    with a real sample under important lines whose values were summarised.
//!
//! This module knows nothing about MCP, the clipboard or files: text in, text out.

use crate::drain::{DEFAULT_SIMILARITY, Drain, tokenize};
use regex::Regex;
use serde_json::{Map, Value};
use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

/// Longest message kept from one log line.
const MAX_LINE_CHARS: usize = 2_000;
/// Longest stack-trace line kept.
const MAX_TRACE_CHARS: usize = 500;
/// All rendered entries together stay under this size, about 7,500 tokens.
const MAX_ENTRY_CHARS: usize = 30_000;

/// Knobs for the output size.
pub struct Options {
    /// At most this many output lines (groups). Errors and warnings are kept first.
    pub max_entries: usize,
    /// At most this many stack-trace lines shown under one entry.
    pub max_trace_lines: usize,
    /// Return the input unchanged when the summary wouldn't be smaller (tiny inputs).
    pub passthrough_small: bool,
}

impl Default for Options {
    fn default() -> Self {
        Options { max_entries: 80, max_trace_lines: 12, passthrough_small: true }
    }
}

/// The result of compressing: the text for Claude plus before/after sizes.
pub struct Summary {
    pub text: String,
    pub input_lines: usize,
    pub input_chars: usize,
}

impl Summary {
    pub fn output_lines(&self) -> usize {
        self.text.lines().count()
    }

    /// One line of before → after stats. Tokens are estimated at ~4 characters each.
    pub fn stats_line(&self) -> String {
        format!(
            "[komp] {} → {} lines, ~{} → ~{} tokens (estimate)",
            self.input_lines,
            self.output_lines(),
            estimate_tokens(self.input_chars),
            estimate_tokens(self.text.chars().count()),
        )
    }
}

fn estimate_tokens(chars: usize) -> usize {
    chars.div_ceil(4)
}

/// Compress raw log text. This is the only public entry point of the module.
pub fn compress(input: &str, opts: &Options) -> Summary {
    let input_lines = input.lines().filter(|l| !l.trim().is_empty()).count();
    let input_chars = input.chars().count();

    let mut records = parse(input);
    if records.is_empty() {
        return Summary { text: "[komp] no log lines found".into(), input_lines, input_chars };
    }

    let shared = hoist(&mut records);

    // If every record is from the same day, show the date once in the header
    // and only HH:MM:SS on each line.
    let dates: HashSet<&str> = records.iter().filter_map(|r| r.date.as_deref()).collect();
    let multi_day = dates.len() > 1;
    let stamp = |r: &Record| -> Option<String> {
        let time = r.time.as_ref()?;
        Some(match (&r.date, multi_day) {
            (Some(date), true) => format!("{date} {time}"),
            _ => time.clone(),
        })
    };
    let full_stamp = |r: &Record| -> Option<String> {
        let time = r.time.as_ref()?;
        Some(match &r.date {
            Some(date) => format!("{date} {time}"),
            None => time.clone(),
        })
    };
    let span_start = records.iter().find_map(full_stamp);
    let span_end = records.iter().rev().find_map(full_stamp);

    // ---- 3. mine templates ----
    let mut miners: HashMap<MinerKey, Drain> = HashMap::new();
    let mut families: Vec<Family> = Vec::new();
    let mut family_of: HashMap<(MinerKey, usize), usize> = HashMap::new();
    let mut level_counts: HashMap<Level, usize> = HashMap::new();

    for (position, record) in records.iter().enumerate() {
        *level_counts.entry(record.level).or_default() += 1;
        let parsed = tokenize(&record.message);
        let key = (record.level, record.important, parsed.compact);
        let similarity = if record.important { IMPORTANT_SIMILARITY } else { DEFAULT_SIMILARITY };
        // The stricter match for errors must not split them over IDs like `c1` and `c2`.
        let masked: Vec<&str> = parsed
            .tokens
            .iter()
            .map(|t| {
                if record.important && t.masked.bytes().any(|b| b.is_ascii_digit()) {
                    "<VAR>"
                } else {
                    t.masked.as_str()
                }
            })
            .collect();
        let template_id = miners.entry(key).or_insert_with(|| Drain::new(similarity)).add(&masked);
        let family = *family_of.entry((key, template_id)).or_insert_with(|| {
            families.push(Family { level: record.level, compact: parsed.compact, members: Vec::new() });
            families.len() - 1
        });
        let ranges = parsed.tokens.into_iter().map(|t| t.range).collect();
        families[family].members.push((position, ranges));
    }
    let template_count = families.len();

    // ---- 4. group ----
    let mut records: Vec<Option<Record>> = records.into_iter().map(Some).collect();
    let mut groups: Vec<Group> = Vec::with_capacity(families.len());
    for family in families {
        let (template, values) = {
            let rows: Vec<Vec<&str>> = family
                .members
                .iter()
                .map(|(position, ranges)| {
                    let message = &records[*position].as_ref().expect("each record has one family").message;
                    ranges.iter().map(|range| &message[range.clone()]).collect()
                })
                .collect();
            slot_template(&rows, if family.compact { "" } else { " " })
        };
        let slot_count = values.first().map_or(0, Vec::len);
        let mut group = Group::new(family.level, template, slot_count);
        for ((position, _), member_values) in family.members.into_iter().zip(values) {
            let record = records[position].take().expect("each record has one family");
            let when = stamp(&record);
            group.add(record, member_values, when, position);
        }
        groups.push(group);
    }

    // "status={200|503}" hides *when* the 503s happened. If a value is bunched up
    // in one stretch of the log, give each value its own line and time range.
    let mut groups: Vec<Group> = groups.into_iter().flat_map(Group::split_by_clustered_value).collect();
    groups.sort_by_key(|g| g.first_position);

    // ---- budget: keep errors/warnings first, then the most frequent lines ----
    let mut ranked: Vec<usize> = (0..groups.len()).collect();
    ranked.sort_by_key(|&i| {
        let g = &groups[i];
        (std::cmp::Reverse(g.important), std::cmp::Reverse(g.level), std::cmp::Reverse(g.count), i)
    });
    let mut rendered: Vec<Option<String>> = vec![None; groups.len()];
    let (mut kept, mut used) = (0, 0);
    for i in ranked {
        if kept == opts.max_entries || used >= MAX_ENTRY_CHARS {
            break;
        }
        let entry = groups[i].render(opts.max_trace_lines);
        let size = entry.chars().count();
        if used + size <= MAX_ENTRY_CHARS {
            rendered[i] = Some(entry);
            kept += 1;
            used += size;
        }
    }

    // ---- 5. render ----
    let mut out = String::new();

    let plural = |n: usize, one: &str, many: &str| format!("{n} {}", if n == 1 { one } else { many });
    let mut header = format!(
        "[komp] {} → {}, {}",
        plural(input_lines, "line", "lines"),
        plural(template_count, "template", "templates"),
        plural(kept, "entry", "entries")
    );
    match (&span_start, &span_end) {
        (Some(a), Some(b)) if a != b && !multi_day => {
            // same day: "2026-11-18 10:00:01–10:00:07"
            let end_time = b.rsplit(' ').next().unwrap_or(b);
            header.push_str(&format!(" · {a}–{end_time}"));
        }
        (Some(a), Some(b)) if a != b => header.push_str(&format!(" · {a} → {b}")),
        (Some(a), _) => header.push_str(&format!(" · {a}")),
        _ => {}
    }
    if !shared.is_empty() {
        header.push_str(&format!(" · {}", shared.join(" ")));
    }
    out.push_str(&header);
    out.push('\n');

    let levels: Vec<String> = [Level::Fatal, Level::Error, Level::Warn, Level::Info, Level::Debug, Level::Trace]
        .iter()
        .filter_map(|l| level_counts.get(l).map(|n| format!("{} {n}", l.label())))
        .collect();
    if !levels.is_empty() {
        out.push_str(&format!("levels: {}\n", levels.join(" · ")));
    }

    for entry in rendered.iter().flatten() {
        out.push_str(entry);
    }

    // Say what was dropped, so Claude knows the summary is partial.
    let dropped: Vec<&Group> = groups.iter().zip(&rendered).filter(|(_, r)| r.is_none()).map(|(g, _)| g).collect();
    if !dropped.is_empty() {
        let lines: usize = dropped.iter().map(|g| g.count).sum();
        let kind = if dropped.iter().any(|g| g.important) { "lower-priority" } else { "rarer low-severity" };
        out.push_str(&format!("… {} {kind} patterns omitted ({lines} lines)\n", dropped.len()));
    }

    // Tiny or already-unique input: the header would make it bigger, so return it unchanged.
    let original = input.trim();
    if opts.passthrough_small && out.trim_end().chars().count() >= original.chars().count() {
        return Summary { text: original.to_string(), input_lines, input_chars };
    }
    Summary { text: out.trim_end().to_string(), input_lines, input_chars }
}

// ───────────────────────────── 1. parse ─────────────────────────────

/// Log severity. The order matters: later = more severe (used for ranking).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Level {
    Trace,
    Debug,
    Unknown,
    Info,
    Warn,
    Error,
    Fatal,
}

impl Level {
    fn from_word(word: &str) -> Level {
        match word.to_ascii_lowercase().as_str() {
            "trace" => Level::Trace,
            "debug" | "dbg" => Level::Debug,
            "info" | "inf" | "notice" | "i" => Level::Info,
            "warn" | "warning" | "wrn" | "w" => Level::Warn,
            "error" | "err" | "eror" | "severe" | "e" => Level::Error,
            "fatal" | "crit" | "critical" | "panic" | "alert" | "emerg" | "f" => Level::Fatal,
            _ => Level::Unknown,
        }
    }

    /// pino (Node.js) logs levels as numbers.
    fn from_number(n: u64) -> Level {
        match n {
            10 => Level::Trace,
            20 => Level::Debug,
            30 => Level::Info,
            40 => Level::Warn,
            50 => Level::Error,
            60 => Level::Fatal,
            _ => Level::Unknown,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Level::Trace => "TRACE",
            Level::Debug => "DEBUG",
            Level::Unknown => "",
            Level::Info => "INFO",
            Level::Warn => "WARN",
            Level::Error => "ERROR",
            Level::Fatal => "FATAL",
        }
    }
}

/// One log event: a line, plus any stack-trace lines that belong to it.
#[derive(Debug)]
struct Record {
    date: Option<String>,
    time: Option<String>,
    level: Level,
    message: String,
    /// Continuation lines (stack traces, indented details).
    extra: Vec<String>,
    /// WARN or worse, or the text looks like a failure. Important records keep more detail.
    important: bool,
    /// An exception line was already merged into this record's message.
    has_cause: bool,
}

/// Compile a regex once, the first time it's used.
macro_rules! lazy_regex {
    ($name:ident, $pattern:expr) => {
        static $name: LazyLock<Regex> = LazyLock::new(|| Regex::new($pattern).unwrap());
    };
}

lazy_regex!(ANSI_COLOR, r"\x1b\[[0-9;?]*[A-Za-z]");
// 2026-11-18T10:00:01.123Z / 2026-11-18 10:00:01,123 / 2026/11/18 10:00:01 (nginx), optional [ ]
lazy_regex!(ISO_TS, r"^\[?(\d{4}[-/]\d{2}[-/]\d{2})[T ](\d{2}:\d{2}:\d{2})(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?\]? ?");
// klog (kubelet, apiserver, controllers): I1118 10:00:01.123456    2345 kubelet.go:2123] msg
lazy_regex!(KLOG, r"^([IWEF])(\d{2})(\d{2}) (\d{2}:\d{2}:\d{2})\.\d+\s+\d+ (\S+:\d+)\] ?");
// syslog: Nov 18 10:00:01 host app[123]: msg
lazy_regex!(SYSLOG, r"^([A-Z][a-z]{2} [ \d]\d) (\d{2}:\d{2}:\d{2}) ?");
// INFO msg / [error] msg / WARN: msg  at the start of the message
lazy_regex!(
    LEVEL_PREFIX,
    r"(?i)^[\[(]?(trace|debug|dbg|info|inf|notice|warning|warn|wrn|error|err|eror|fatal|critical|crit|panic|severe)[\])]?:?(?:\s+|$)"
);
// [api] ERROR msg  (a tag, then an upper-case level)
lazy_regex!(
    TAG_THEN_LEVEL,
    r"^(\[[^\]]*\]\s+)[\[(]?(TRACE|DEBUG|INFO|NOTICE|WARNING|WARN|ERROR|FATAL|CRITICAL|PANIC)[\])]?:?(?:\s+|$)"
);
// logfmt: level=error  /  time="2026-11-18T10:00:01Z"
lazy_regex!(LOGFMT_LEVEL, r#"(?i)(?:^|\s)(?:level|lvl|severity)="?([a-z]+)"?"#);
lazy_regex!(LOGFMT_TIME, r#"(?:^|\s)(?:time|ts|timestamp)="?(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})[^\s"]*"?"#);
// Lines that continue the previous record: indented, Java "at …", "Caused by:", "... 12 more"
lazy_regex!(CONTINUATION, r"^(?:\s+\S|at |Caused by:|\.\.\. \d+ (?:more|common frames omitted))");
// An exception on its own line: "java.lang.NullPointerException: …", "ValueError: …"
lazy_regex!(EXCEPTION_HEAD, r"^(?:[\w$]+\.)*[\w$]*(?:Error|Exception|Throwable)\b");
// Python prints this before every stack trace; it carries no information.
lazy_regex!(TRACEBACK, r"^Traceback \(most recent call last\):");
// Spring Boot: "1 --- [nio-8080-exec-3] c.shop.Orders : msg" (pid, thread, optional app name)
lazy_regex!(SPRING_PREFIX, r"^\d+ --- (?:\[[^\]]*\]\s*)+");
// Container wrappers: `kubectl logs --prefix` and Docker Compose name the source first.
lazy_regex!(SOURCE_PREFIX, r"^(?:\[(pod/[^\]\s]+)\]|([A-Za-z0-9][\w.-]*)\s+\|)\s(.*)$");
// containerd/CRI-O node logs: 2026-11-18T10:00:01.1Z stdout F message
lazy_regex!(
    CRI_LINE,
    r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})) (?:stdout|stderr) [FP] (.*)$"
);
// nginx/Apache common and combined access logs.
lazy_regex!(
    ACCESS_LOG,
    r#"^(\S+) \S+ \S+ \[(\d{2})/([A-Z][a-z]{2})/(\d{4}):(\d{2}:\d{2}:\d{2}) [+-]\d{4}\] "([^"]*)" (\d{3}) (\d+|-)"#
);
// Text that smells like trouble even without a level.
lazy_regex!(
    LOOKS_BAD,
    r"(?i:\b(?:errors?|exception|fatal|panic|failed|failure|refused|timeout|timed out|deadline exceeded|denied|unauthorized|forbidden|oomkilled|out of memory|crashloopbackoff|back-off|unhealthy|evicted)\b)|\w(?:Error|Exception)\b"
);

/// Keep the start of very long text and say how much was cut.
fn clip(text: String, max: usize) -> String {
    match text.char_indices().nth(max) {
        Some((cut, _)) => {
            let hidden = text[cut..].chars().count();
            format!("{}… [{hidden} more characters]", &text[..cut])
        }
        None => text,
    }
}

/// A log line with its container wrapper removed.
struct Unwrapped<'a> {
    source: Option<String>,
    outer_time: Option<(String, String)>,
    line: Cow<'a, str>,
}

impl Unwrapped<'_> {
    /// Put back what the wrapper knew: the source tag and, if needed, its timestamp.
    fn finish(&self, mut record: Record) -> Record {
        if record.time.is_none() {
            if let Some((date, time)) = &self.outer_time {
                record.date = Some(date.clone());
                record.time = Some(time.clone());
            }
        }
        if let Some(source) = &self.source {
            record.message = format!("{source} {}", record.message);
        }
        record
    }
}

fn timestamp_parts(text: &str) -> Option<(String, String)> {
    let c = ISO_TS.captures(text)?;
    Some((c[1].replace('/', "-"), c[2].to_string()))
}

fn unwrap_line(line: &str) -> Unwrapped<'_> {
    let (source, body) = match SOURCE_PREFIX.captures(line) {
        Some(c) => {
            let body = c.get(3).map_or("", |m| m.as_str());
            match (c.get(1), c.get(2)) {
                (Some(pod), _) => (Some(format!("[{}]", pod.as_str())), body),
                (_, Some(name)) if Level::from_word(name.as_str()) == Level::Unknown => {
                    (Some(format!("[{}]", name.as_str())), body)
                }
                _ => (None, line),
            }
        }
        None => (None, line),
    };

    if let Some(c) = CRI_LINE.captures(body) {
        let text = c.get(2).map_or("", |m| m.as_str());
        return Unwrapped { source, outer_time: timestamp_parts(&c[1]), line: Cow::Borrowed(text) };
    }
    if body.trim_start().starts_with('{') && body.contains("\"log\"") {
        if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(body.trim_start()) {
            if let (Some(Value::String(text)), true) = (map.get("log"), map.contains_key("stream")) {
                let outer_time = map.get("time").and_then(Value::as_str).and_then(timestamp_parts);
                return Unwrapped { source, outer_time, line: Cow::Owned(text.trim_end().to_string()) };
            }
        }
    }
    Unwrapped { source, outer_time: None, line: Cow::Borrowed(body) }
}

/// An nginx or Apache access line. The HTTP status gives it a severity.
fn parse_access(line: &str) -> Option<Record> {
    let c = ACCESS_LOG.captures(line)?;
    let month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        .iter()
        .position(|m| *m == &c[3])?
        + 1;
    let status: u16 = c[7].parse().ok()?;
    let level = match status {
        500.. => Level::Error,
        400.. => Level::Warn,
        _ => Level::Info,
    };
    let mut request = c[6].split_whitespace();
    let target = match (request.next(), request.next()) {
        (Some(method), Some(path)) => format!("{method} {path}"),
        _ => format!("request={:?}", &c[6]),
    };
    let message = clip(format!("{target} status={status} bytes={} client={}", &c[8], &c[1]), MAX_LINE_CHARS);
    Some(Record {
        date: Some(format!("{}-{month:02}-{}", &c[4], &c[2])),
        time: Some(c[5].to_string()),
        level,
        message,
        extra: Vec::new(),
        important: level >= Level::Warn,
        has_cause: false,
    })
}

fn parse(input: &str) -> Vec<Record> {
    let mut records: Vec<Record> = Vec::new();

    for raw in input.lines() {
        let clean = ANSI_COLOR.replace_all(raw, "");
        let wrapped = unwrap_line(clean.trim_end());
        let inner = ANSI_COLOR.replace_all(&wrapped.line, "");
        let line = inner.trim_end();
        if line.trim().is_empty() {
            continue;
        }

        if let Some(record) = parse_json(line.trim_start()).or_else(|| parse_access(line)) {
            records.push(wrapped.finish(record));
            continue;
        }

        let (mut date, mut time, mut level, rest) = split_timestamp(line);

        // A stack-trace line belongs to the record before it.
        if let Some(prev) = records.last_mut() {
            let looks_new = LEVEL_PREFIX.is_match(rest.trim_start());
            if CONTINUATION.is_match(&rest) && !looks_new {
                prev.extra.push(clip(rest.trim().to_string(), MAX_TRACE_CHARS));
                continue;
            }
            if time.is_none() && TRACEBACK.is_match(&rest) {
                continue;
            }
            // An exception line right after an error is that error's cause, so it joins
            // the same record: "ERROR request failed → java.lang.NullPointerException: …".
            // It becomes part of the message, so different exceptions stay in different groups.
            let cause = rest.trim();
            if time.is_none() && !prev.has_cause && prev.level >= Level::Warn && EXCEPTION_HEAD.is_match(cause) {
                let cause = clip(cause.split_whitespace().collect::<Vec<_>>().join(" "), MAX_LINE_CHARS);
                prev.message = format!("{} → {cause}", prev.message);
                prev.has_cause = true;
                continue;
            }
        }

        let mut message = rest.trim().to_string();

        if level == Level::Unknown {
            if let Some(c) = LEVEL_PREFIX.captures(&message) {
                let end = c.get(0).unwrap().end();
                level = Level::from_word(&c[1]);
                message = message[end..].to_string();
            } else if let Some(c) = TAG_THEN_LEVEL.captures(&message) {
                let end = c.get(0).unwrap().end();
                level = Level::from_word(&c[2]);
                message = format!("{}{}", &c[1], &message[end..]);
            } else if let Some(c) = LOGFMT_LEVEL.captures(&message) {
                let m = c.get(0).unwrap();
                level = Level::from_word(&c[1]);
                message = format!("{} {}", &message[..m.start()], &message[m.end()..]);
            }
        }

        // Spring Boot's process id and thread name rarely help debugging; drop them.
        if let Some(m) = SPRING_PREFIX.find(&message) {
            message = message[m.end()..].to_string();
        }

        // logfmt time="…" is always removed from the message (it would make every line unique).
        if let Some(c) = LOGFMT_TIME.captures(&message) {
            let m = c.get(0).unwrap();
            if time.is_none() {
                date = Some(c[1].to_string());
                time = Some(c[2].to_string());
            }
            message = format!("{} {}", &message[..m.start()], &message[m.end()..]);
        }

        let message = message.split_whitespace().collect::<Vec<_>>().join(" ");
        let important = level >= Level::Warn || LOOKS_BAD.is_match(&message);
        let message = clip(message, MAX_LINE_CHARS);
        let record = Record { date, time, level, message, extra: Vec::new(), important, has_cause: false };
        records.push(wrapped.finish(record));
    }

    records
}

/// Peel a timestamp off the front of a line. Returns (date, time, level, rest).
/// The level is only known here for klog lines (I/W/E/F prefix).
fn split_timestamp(line: &str) -> (Option<String>, Option<String>, Level, String) {
    if let Some(c) = ISO_TS.captures(line) {
        let rest = line[c.get(0).unwrap().end()..].to_string();
        return (Some(c[1].replace('/', "-")), Some(c[2].to_string()), Level::Unknown, rest);
    }
    if let Some(c) = KLOG.captures(line) {
        let rest = format!("{} {}", &c[5], &line[c.get(0).unwrap().end()..]);
        let date = format!("{}-{}", &c[2], &c[3]);
        return (Some(date), Some(c[4].to_string()), Level::from_word(&c[1]), rest);
    }
    if let Some(c) = SYSLOG.captures(line) {
        let rest = line[c.get(0).unwrap().end()..].to_string();
        let date = c[1].split_whitespace().collect::<Vec<_>>().join(" ");
        return (Some(date), Some(c[2].to_string()), Level::Unknown, rest);
    }
    (None, None, Level::Unknown, line.to_string())
}

/// A JSON log line, e.g. `{"level":"error","ts":"…","msg":"…","user":42}`.
fn parse_json(line: &str) -> Option<Record> {
    if !line.starts_with('{') {
        return None;
    }
    let Value::Object(mut map) = serde_json::from_str(line).ok()? else {
        return None;
    };

    let ts = take(&mut map, &["time", "ts", "timestamp", "@timestamp", "t"]);
    let lvl = take(&mut map, &["level", "lvl", "severity", "levelname", "l"]);
    let msg = take(&mut map, &["msg", "message", "m"]);
    for noise in ["pid", "v"] {
        map.remove(noise);
    }

    let (date, time) = match &ts {
        Some(Value::String(s)) => match ISO_TS.captures(s) {
            Some(c) => (Some(c[1].replace('/', "-")), Some(c[2].to_string())),
            None => (None, None),
        },
        Some(Value::Number(n)) => match n.as_f64() {
            // epoch milliseconds or seconds
            Some(x) if x > 1e12 => split_epoch((x / 1000.0) as i64),
            Some(x) if x > 1e9 => split_epoch(x as i64),
            _ => (None, None),
        },
        _ => (None, None),
    };

    let level = match &lvl {
        Some(Value::String(s)) => Level::from_word(s),
        Some(Value::Number(n)) => n.as_u64().map(Level::from_number).unwrap_or(Level::Unknown),
        _ => Level::Unknown,
    };

    // A stack trace inside err.stack / error.stack becomes continuation lines.
    let mut extra = Vec::new();
    for key in ["err", "error"] {
        if let Some(Value::Object(err)) = map.get_mut(key) {
            if let Some(Value::String(stack)) = err.remove("stack") {
                extra.extend(stack.lines().skip(1).map(|l| clip(l.trim().to_string(), MAX_TRACE_CHARS)));
            }
        }
    }

    let mut parts: Vec<String> = Vec::new();
    match msg {
        Some(Value::String(m)) => parts.push(m),
        Some(other) => parts.push(other.to_string()),
        None => {}
    }
    for (key, value) in &map {
        parts.push(match value {
            Value::String(s) if !s.contains(' ') => format!("{key}={s}"),
            Value::String(s) => format!("{key}={s:?}"),
            other => format!("{key}={other}"),
        });
    }

    let message = parts.join(" ");
    let important = level >= Level::Warn || LOOKS_BAD.is_match(&message);
    let message = clip(message, MAX_LINE_CHARS);
    Some(Record { date, time, level, message, extra, important, has_cause: false })
}

/// Remove and return the first of `keys` present in the JSON object.
fn take(map: &mut Map<String, Value>, keys: &[&str]) -> Option<Value> {
    keys.iter().find_map(|k| map.remove(*k))
}

/// Unix seconds → ("YYYY-MM-DD", "HH:MM:SS") in UTC.
fn split_epoch(secs: i64) -> (Option<String>, Option<String>) {
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    // Howard Hinnant's days → civil date algorithm.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
    (
        Some(format!("{year:04}-{month:02}-{day:02}")),
        Some(format!("{:02}:{:02}:{:02}", sod / 3600, sod % 3600 / 60, sod % 60)),
    )
}

// ───────────────────────────── 2. hoist ─────────────────────────────

/// Move what every record shares into the header and strip it from the messages:
/// a leading tag like `[pod/api-7d9f]`, and `key=value` pairs like `env=prod`.
fn hoist(records: &mut [Record]) -> Vec<String> {
    if records.len() < 2 {
        return Vec::new();
    }
    let mut shared: Vec<String> = Vec::new();

    // A leading tag shared by all records.
    if let Some(first) = records[0].message.split_whitespace().next().map(str::to_string) {
        let is_tag = first.starts_with('[') || first.contains('/');
        if is_tag && records.iter().all(|r| r.message.split_whitespace().next() == Some(first.as_str())) {
            shared.push(first);
        }
    }

    // key=value tokens present in every record.
    let mut common: Vec<String> = records[0]
        .message
        .split_whitespace()
        .filter(|t| t.contains('=') && !t.starts_with('='))
        .map(str::to_string)
        .collect();
    common.retain(|tok| records.iter().all(|r| r.message.split_whitespace().any(|t| t == tok)));
    shared.extend(common);

    if !shared.is_empty() {
        for r in records.iter_mut() {
            r.message =
                r.message.split_whitespace().filter(|t| !shared.iter().any(|s| s == t)).collect::<Vec<_>>().join(" ");
        }
    }
    shared
}

// ─────────────────────────── 3. templates ───────────────────────────

/// Marks a slot inside a template. Removed from log text before it is used.
const SLOT: char = '\u{1}';

/// Errors must not blur together: two failures that merely start alike stay separate.
const IMPORTANT_SIMILARITY: f64 = 0.7;

/// Severity, importance and tokenizer each get their own Drain tree.
type MinerKey = (Level, bool, bool);

/// The records Drain placed in one template, with each record's token positions.
struct Family {
    level: Level,
    compact: bool,
    members: Vec<(usize, Vec<std::ops::Range<usize>>)>,
}

/// Turn a family's tokens into komp's template and the slot values of each row.
/// `status=200` and `status=503` become `status=␁` with values `200` and `503`.
fn slot_template(rows: &[Vec<&str>], separator: &str) -> (String, Vec<Vec<String>>) {
    let mut template = String::new();
    let mut values = vec![Vec::new(); rows.len()];
    let width = rows.first().map_or(0, Vec::len);

    for column in 0..width {
        if column > 0 {
            template.push_str(separator);
        }
        let first = rows[0][column];
        if rows.iter().all(|row| row[column] == first) {
            template.extend(first.chars().filter(|c| *c != SLOT));
            continue;
        }
        let (prefix, suffix) = shared_edges(rows, column);
        template.extend(first[..prefix].chars().filter(|c| *c != SLOT));
        template.push(SLOT);
        template.extend(first[first.len() - suffix..].chars().filter(|c| *c != SLOT));
        for (row, row_values) in rows.iter().zip(&mut values) {
            let token = row[column];
            row_values.push(token[prefix..token.len() - suffix].to_string());
        }
    }
    (template, values)
}

/// Bytes at each end of a column that every token shares and that can stay literal.
/// Edges stop at punctuation, so `8ms` and `9ms` keep their unit in the value and a
/// number is never cut at its decimal point.
fn shared_edges(rows: &[Vec<&str>], column: usize) -> (usize, usize) {
    let first = rows[0][column];
    let mut prefix = first;
    let mut suffix = first;
    let mut shortest = first.len();
    for row in rows {
        let token = row[column];
        shortest = shortest.min(token.len());
        let same: usize =
            prefix.chars().zip(token.chars()).take_while(|(a, b)| a == b).map(|(a, _)| a.len_utf8()).sum();
        prefix = &prefix[..same];
        let same: usize =
            suffix.chars().rev().zip(token.chars().rev()).take_while(|(a, b)| a == b).map(|(a, _)| a.len_utf8()).sum();
        suffix = &suffix[suffix.len() - same..];
    }

    let mut prefix_len = prefix
        .rfind(|c: char| !c.is_alphanumeric())
        .map_or(0, |i| i + prefix[i..].chars().next().map_or(0, char::len_utf8));
    let kept = &prefix[..prefix_len];
    let mut before_separator = kept.chars().rev().skip(1);
    if kept.ends_with(['.', ':', ',']) && before_separator.next().is_some_and(|c| c.is_ascii_digit()) {
        prefix_len = kept.trim_end_matches(|c: char| c.is_ascii_digit() || matches!(c, '.' | ':' | ',')).len();
    }

    let mut suffix_len = suffix.find(|c: char| !c.is_alphanumeric()).map_or(0, |i| suffix.len() - i);
    let tail = &suffix[suffix.len() - suffix_len..];
    let mut tail_chars = tail.chars();
    if matches!(tail_chars.next(), Some('.' | ',')) && tail_chars.next().is_some_and(|c| c.is_ascii_digit()) {
        suffix_len = 0;
    }

    if prefix_len + suffix_len >= shortest { (0, 0) } else { (prefix_len, suffix_len) }
}

// ───────────────────────────── 4. group ─────────────────────────────

/// All the values one slot took across a group.
#[derive(Default)]
struct Slot {
    /// Distinct values in order of first appearance (up to `MAX_TRACKED`).
    distinct: Vec<String>,
    /// True once there were more distinct values than we track.
    untracked: bool,
    /// min/max if every value was a number with the same unit ("2ms", "3ms").
    range: Option<(f64, f64, String)>,
    non_numeric: bool,
}

const MAX_TRACKED: usize = 32;
const MAX_SAMPLE_CHARS: usize = 220;

lazy_regex!(NUMBER_WITH_UNIT, r"^(\d+(?:\.\d+)?)([a-zA-Zµ]*)$");

impl Slot {
    /// Durations and sizes ("2ms", "4Mi"): a min–max range describes them better than splitting.
    fn has_unit(&self) -> bool {
        !self.non_numeric && matches!(&self.range, Some((_, _, unit)) if !unit.is_empty())
    }

    fn add(&mut self, value: &str) {
        if !self.distinct.iter().any(|d| d == value) {
            if self.distinct.len() < MAX_TRACKED {
                self.distinct.push(value.to_string());
            } else {
                self.untracked = true;
            }
        }
        if self.non_numeric {
            return;
        }
        let parsed = NUMBER_WITH_UNIT.captures(value).and_then(|c| Some((c[1].parse::<f64>().ok()?, c[2].to_string())));
        match (parsed, &mut self.range) {
            (Some((n, unit)), None) => self.range = Some((n, n, unit)),
            (Some((n, unit)), Some((min, max, u))) if *u == unit => {
                *min = min.min(n);
                *max = max.max(n);
            }
            _ => self.non_numeric = true,
        }
    }

    /// Summarise the values. `limit` = how many distinct values to list before abbreviating.
    /// For unimportant lines, a pile of random IDs is replaced by a count and one example.
    fn render(&self, limit: usize, important: bool) -> String {
        if self.distinct.len() == 1 && !self.untracked {
            return self.distinct[0].clone();
        }
        let more = if self.untracked { "+" } else { "" };
        if let (false, Some((min, max, unit))) = (self.non_numeric, &self.range) {
            // Durations, sizes: a range says it all. "1–3ms"
            if !unit.is_empty() {
                return format!("{}–{}{unit}", fmt_num(*min), fmt_num(*max));
            }
            // Many plain numbers (IDs, ports…): range + how many.
            if self.distinct.len() > limit || self.untracked {
                return format!("{{{}–{}, {}{more} values}}", fmt_num(*min), fmt_num(*max), self.distinct.len());
            }
        }
        if self.distinct.len() <= limit && !self.untracked {
            return format!("{{{}}}", self.distinct.join("|"));
        }
        if !important {
            return format!("{{{}{more} distinct, e.g. {}}}", self.distinct.len(), shorten(&self.distinct[0], 16));
        }
        let hidden = self.distinct.len() - limit;
        format!("{{{}|+{hidden}{more} more}}", self.distinct[..limit].join("|"))
    }
}

fn fmt_num(x: f64) -> String {
    if x.fract() == 0.0 && x.abs() < 1e15 { format!("{}", x as i64) } else { format!("{x}") }
}

/// First `max` characters plus "…" if longer.
fn shorten(s: &str, max: usize) -> String {
    match s.char_indices().nth(max) {
        Some((cut, _)) => format!("{}…", &s[..cut]),
        None => s.to_string(),
    }
}

// Stack frames from the runtime or frameworks rather than the app itself.
lazy_regex!(
    FRAMEWORK_FRAME,
    r"^at (?:async )?(?:java\.|javax\.|jdk\.|jakarta\.|sun\.|com\.sun\.|kotlin\.|kotlinx\.|scala\.|org\.springframework\.|org\.apache\.|org\.hibernate\.|io\.netty\.|reactor\.|io\.grpc\.|.*\((?:node:internal|internal/)|.*node_modules/)"
);

/// Collapse runs of 2+ framework frames into one line; keep app frames and "Caused by:".
fn fold_trace(lines: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    let mut run: Vec<&String> = Vec::new();
    let flush = |run: &mut Vec<&String>, out: &mut Vec<String>| {
        match run.len() {
            0 => {}
            1 => out.push(run[0].clone()),
            n => out.push(format!("… {n} framework frames")),
        }
        run.clear();
    };
    for line in lines {
        if FRAMEWORK_FRAME.is_match(line) {
            run.push(line);
        } else {
            flush(&mut run, &mut out);
            out.push(line.clone());
        }
    }
    flush(&mut run, &mut out);
    out
}

/// One record's place in a group: its slot values, timestamp and line position.
struct Member {
    values: Vec<String>,
    when: Option<String>,
    position: usize,
}

/// Records that share a level and a template.
struct Group {
    level: Level,
    important: bool,
    template: String,
    slots: Vec<Slot>,
    count: usize,
    first_seen: Option<String>,
    last_seen: Option<String>,
    /// Stack trace from the first occurrence (repeats are identical or nearly so).
    extra: Vec<String>,
    members: Vec<Member>,
    /// Position (record number) of the first member, used to keep output in log order.
    first_position: usize,
}

impl Group {
    fn new(level: Level, template: String, slot_count: usize) -> Group {
        Group {
            level,
            important: false,
            template,
            slots: (0..slot_count).map(|_| Slot::default()).collect(),
            count: 0,
            first_seen: None,
            last_seen: None,
            extra: Vec::new(),
            members: Vec::new(),
            first_position: 0,
        }
    }

    fn add(&mut self, record: Record, values: Vec<String>, when: Option<String>, position: usize) {
        self.important |= record.important;
        if self.extra.is_empty() && !record.extra.is_empty() {
            self.extra = record.extra;
        }
        self.add_member(Member { values, when, position });
    }

    fn add_member(&mut self, member: Member) {
        if self.count == 0 {
            self.first_position = member.position;
        }
        self.count += 1;
        for (slot, value) in self.slots.iter_mut().zip(&member.values) {
            slot.add(value);
        }
        if member.when.is_some() {
            if self.first_seen.is_none() {
                self.first_seen = member.when.clone();
            }
            self.last_seen = member.when.clone();
        }
        self.members.push(member);
    }

    /// An empty group with the same level, template, importance and stack trace.
    fn empty_like(&self) -> Group {
        let mut g = Group::new(self.level, self.template.clone(), self.slots.len());
        g.important = self.important;
        g.extra = self.extra.clone();
        g
    }

    /// Split this group by the first slot that has 2–4 distinct values where one
    /// value (seen at least 3 times) is bunched into at most half of the group's
    /// stretch of the log. Example: `status=200` all along, `status=503` only
    /// during an outage → two lines, each with its own time range.
    fn split_by_clustered_value(self) -> Vec<Group> {
        let (Some(first), Some(last)) = (self.members.first(), self.members.last()) else {
            return vec![self];
        };
        let span = last.position - first.position;
        if self.count < 6 || span == 0 {
            return vec![self];
        }

        let chosen = (0..self.slots.len()).find(|&i| {
            let slot = &self.slots[i];
            let d = slot.distinct.len();
            if slot.untracked || !(2..=4).contains(&d) || slot.has_unit() {
                return false;
            }
            slot.distinct.iter().any(|value| {
                let positions: Vec<usize> =
                    self.members.iter().filter(|m| &m.values[i] == value).map(|m| m.position).collect();
                match (positions.first(), positions.last()) {
                    (Some(start), Some(end)) => positions.len() >= 3 && (end - start) * 2 <= span,
                    _ => false,
                }
            })
        });
        let Some(i) = chosen else {
            return vec![self];
        };

        let values = self.slots[i].distinct.clone();
        let mut parts: Vec<Group> = values.iter().map(|_| self.empty_like()).collect();
        for member in self.members {
            let k = values.iter().position(|v| *v == member.values[i]).unwrap_or(0);
            parts[k].add_member(member);
        }
        parts
    }

    /// A real message for important lines where the summary cannot show which values
    /// occurred together: several slots vary, or a slot's values were abbreviated.
    fn sample(&self, limit: usize) -> Option<String> {
        if !self.important || self.count < 2 {
            return None;
        }
        let varying = self.slots.iter().filter(|s| s.distinct.len() > 1 || s.untracked).count();
        let abbreviated = self.slots.iter().any(|s| s.distinct.len() > limit || s.untracked);
        if varying < 2 && !abbreviated {
            return None;
        }
        let member = self.members.first()?;
        let mut sample = String::new();
        for (i, part) in self.template.split(SLOT).enumerate() {
            if i > 0 {
                sample.push_str(member.values.get(i - 1)?);
            }
            sample.push_str(part);
        }
        Some(shorten(&sample, MAX_SAMPLE_CHARS))
    }

    fn render(&self, max_trace_lines: usize) -> String {
        // Errors and warnings list more distinct values before abbreviating.
        let limit = if self.important { 6 } else { 3 };
        let mut message = String::new();
        for (i, part) in self.template.split(SLOT).enumerate() {
            if i > 0 {
                message.push_str(&self.slots[i - 1].render(limit, self.important));
            }
            message.push_str(part);
        }
        // A little extra room keeps the note on a line that `clip` already cut.
        let message = shorten(&message, MAX_LINE_CHARS + 40);

        let mut line = String::new();
        match (&self.first_seen, &self.last_seen) {
            (Some(a), Some(b)) if a != b => line.push_str(&format!("{a}–{b} ")),
            (Some(a), _) => line.push_str(&format!("{a} ")),
            _ => {}
        }
        let label = match self.level {
            Level::Unknown if self.important => "!",
            other => other.label(),
        };
        if !label.is_empty() {
            line.push_str(&format!("{label:<5} "));
        }
        line.push_str(&message);
        if self.count > 1 {
            line.push_str(&format!(" ×{}", self.count));
        }
        line.push('\n');

        if let Some(sample) = self.sample(limit) {
            line.push_str(&format!("    e.g. {sample}\n"));
        }

        let trace = fold_trace(&self.extra);
        for frame in trace.iter().take(max_trace_lines) {
            line.push_str(&format!("    {frame}\n"));
        }
        if trace.len() > max_trace_lines {
            line.push_str(&format!("    … +{} more lines\n", trace.len() - max_trace_lines));
        }
        line
    }
}

// ───────────────────────────── tests ─────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Tests use tiny inputs on purpose, so turn off the "return small input unchanged" rule.
    fn run(input: &str) -> String {
        compress(input, &Options { passthrough_small: false, ..Options::default() }).text
    }

    #[test]
    fn merges_repeats_and_keeps_error_values() {
        let input = "\
2026-11-18T10:00:01.123Z INFO  [pod/api-7d9f-x2k4] GET /health 200 2ms
2026-11-18T10:00:02.456Z INFO  [pod/api-7d9f-x2k4] GET /health 200 1ms
2026-11-18T10:00:03.789Z INFO  [pod/api-7d9f-x2k4] GET /health 200 3ms
2026-11-18T10:00:04.012Z ERROR [pod/api-7d9f-x2k4] db connection refused: 10.0.3.17:5432
2026-11-18T10:00:05.334Z ERROR [pod/api-7d9f-x2k4] db connection refused: 10.0.3.17:5432
2026-11-18T10:00:06.901Z WARN  [pod/api-7d9f-x2k4] retrying in 4s (attempt 3/5)
2026-11-18T10:00:07.220Z INFO  [pod/api-7d9f-x2k4] GET /health 200 2ms";
        let out = run(input);
        assert!(out.contains("2026-11-18 10:00:01–10:00:07"), "{out}");
        assert!(out.contains("[pod/api-7d9f-x2k4]"), "source hoisted into header: {out}");
        assert!(out.contains("INFO  GET /health 200 1–3ms ×4"), "{out}");
        assert!(out.contains("ERROR db connection refused: 10.0.3.17:5432 ×2"), "{out}");
        assert!(out.contains("WARN  retrying in 4s (attempt 3/5)"), "{out}");
        assert_eq!(out.matches("[pod/api-7d9f-x2k4]").count(), 1, "tag appears once: {out}");
    }

    #[test]
    fn json_lines_with_numeric_levels() {
        let input = r#"{"level":30,"time":1795000000000,"pid":1,"msg":"request done","status":200,"ms":12}
{"level":30,"time":1795000001000,"pid":1,"msg":"request done","status":200,"ms":40}
{"level":50,"time":1795000002000,"pid":1,"msg":"charge failed","err":{"message":"card declined","stack":"Error: card declined\n    at charge (pay.js:10:5)"}}"#;
        let out = run(input);
        assert!(out.contains("INFO  request done ms={12|40} status=200 ×2"), "{out}");
        assert!(out.contains("ERROR charge failed"), "{out}");
        assert!(out.contains("card declined"), "{out}");
        assert!(out.contains("    at charge (pay.js:10:5)"), "stack folded under the error: {out}");
        assert!(!out.contains("pid="), "noise field dropped: {out}");
    }

    #[test]
    fn stack_traces_attach_to_their_record_and_print_once() {
        let mut input = String::new();
        for _ in 0..3 {
            input.push_str("2026-11-18 10:00:01.000 ERROR 1 --- [main] c.e.App : request failed\n");
            input.push_str("java.lang.IllegalStateException: no customer\n");
            input.push_str("\tat com.example.Orders.load(Orders.java:42)\n");
            input.push_str("\tat com.example.Api.get(Api.java:7)\n");
        }
        let out = run(&input);
        assert_eq!(out.matches("Orders.java:42").count(), 1, "{out}");
        assert!(
            out.contains("ERROR c.e.App : request failed → java.lang.IllegalStateException: no customer ×3"),
            "exception merged into its ERROR line: {out}"
        );
    }

    #[test]
    fn spring_boot_pid_and_thread_are_dropped() {
        let input = "\
2026-11-18 10:00:01.000  INFO 1 --- [nio-8080-exec-1] c.shop.Orders  : order 1 placed
2026-11-18 10:00:02.000  INFO 1 --- [nio-8080-exec-7] c.shop.Orders  : order 2 placed";
        let out = run(input);
        assert!(out.contains("INFO  c.shop.Orders : order {1|2} placed ×2"), "{out}");
        assert!(!out.contains("---"), "{out}");
    }

    #[test]
    fn value_bunched_in_time_gets_its_own_line() {
        let mut input = String::new();
        for i in 0..60 {
            let status = if (20..40).contains(&i) && i % 2 == 0 { 503 } else { 200 };
            input.push_str(&format!("2026-11-18T10:{:02}:00Z INFO GET /orders status={status}\n", i));
        }
        let out = run(&input);
        assert!(out.contains("10:00:00–10:59:00 INFO  GET /orders status=200 ×50"), "{out}");
        assert!(out.contains("10:20:00–10:38:00 INFO  GET /orders status=503 ×10"), "{out}");
    }

    #[test]
    fn values_spread_evenly_stay_merged() {
        let mut input = String::new();
        for i in 0..60 {
            let region = ["eu1", "us2"][i % 2];
            input.push_str(&format!("2026-11-18T10:{:02}:00Z INFO GET /orders region={region}\n", i));
        }
        let out = run(&input);
        assert!(out.contains("INFO  GET /orders region={eu1|us2} ×60"), "{out}");
    }

    #[test]
    fn different_exceptions_stay_separate() {
        let input = "\
2026-11-18 10:00:01 ERROR request failed
java.lang.NullPointerException: customer is null
\tat com.example.A.run(A.java:1)
2026-11-18 10:00:02 ERROR request failed
java.util.concurrent.TimeoutException: inventory took 30s
\tat com.example.B.run(B.java:2)";
        let out = run(input);
        assert!(out.contains("request failed → java.lang.NullPointerException: customer is null"), "{out}");
        assert!(out.contains("request failed → java.util.concurrent.TimeoutException: inventory took 30s"), "{out}");
    }

    #[test]
    fn python_traceback() {
        let input = "\
2026-11-18 10:00:01,123 ERROR worker crashed
Traceback (most recent call last):
  File \"/app/worker.py\", line 42, in handle
    total = order[\"amount\"] / qty
ZeroDivisionError: division by zero";
        let out = run(input);
        assert!(out.contains("ERROR worker crashed → ZeroDivisionError: division by zero"), "{out}");
        assert!(out.contains("File \"/app/worker.py\", line 42, in handle"), "{out}");
        assert!(!out.contains("Traceback"), "boilerplate dropped: {out}");
    }

    #[test]
    fn klog_lines() {
        let input = "\
I1118 10:00:01.123456    2345 kubelet.go:2123] \"SyncLoop ADD\" pod=\"default/api\"
E1118 10:00:05.000000    2345 pod_workers.go:1298] \"Error syncing pod\" err=\"CrashLoopBackOff\"";
        let out = run(input);
        assert!(out.contains("INFO  kubelet.go:2123 \"SyncLoop ADD\""), "{out}");
        assert!(out.contains("ERROR pod_workers.go:1298 \"Error syncing pod\" err=\"CrashLoopBackOff\""), "{out}");
    }

    #[test]
    fn drain_merges_words_that_vary_in_ordinary_lines() {
        let input = "\
INFO user alice logged in
INFO user bob logged in
INFO user carol logged in";
        let out = run(input);
        assert!(out.contains("1 template, 1 entry"), "{out}");
        assert!(out.contains("INFO  user {alice|bob|carol} logged in ×3"), "{out}");
    }

    #[test]
    fn compact_punctuation_heavy_lines_get_slots() {
        let input = r#"["checkout",200,"ok"]
["checkout",503,"ok"]
["checkout",200,"ok"]"#;
        let out = run(input);
        assert!(out.contains(r#"["checkout",{200|503},"ok"] ×3"#), "{out}");
    }

    #[test]
    fn important_lines_with_abbreviated_values_keep_a_real_sample() {
        let mut input = String::new();
        for i in 0..10 {
            input.push_str(&format!("ERROR payment {i}a failed for customer c{i}\n"));
        }
        let out = run(&input);
        assert!(out.contains("    e.g. payment 0a failed for customer c0"), "{out}");
    }

    #[test]
    fn decimal_values_are_not_cut_at_the_point() {
        let input = "INFO took 1.25ms\nINFO took 1.75ms";
        assert!(run(input).contains("INFO  took 1.25–1.75ms ×2"), "{input}");
    }

    #[test]
    fn budget_keeps_errors_first() {
        let mut input = String::new();
        for i in 0..50 {
            input.push_str(&format!(
                "INFO unique-event-{} happened\n",
                "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".chars().nth(i).unwrap()
            ));
        }
        input.push_str("ERROR disk full on /var/lib/data\n");
        let out = compress(&input, &Options { max_entries: 10, ..Default::default() }).text;
        assert!(out.contains("ERROR disk full"), "{out}");
        assert!(out.contains("patterns omitted"), "{out}");
    }

    #[test]
    fn one_huge_line_is_cut_and_later_errors_survive() {
        let input = format!("2026-11-18T10:00:00Z INFO {}\n2026-11-18T10:00:01Z ERROR after it\n", "x".repeat(500_000));
        let summary = compress(&input, &Options::default());
        assert!(summary.text.chars().count() < MAX_LINE_CHARS + 500, "{}", summary.text.len());
        assert!(summary.text.contains("more characters]"));
        assert!(summary.text.contains("ERROR after it"));
    }

    #[test]
    fn total_output_stays_small_and_errors_win() {
        let mut input = String::new();
        for i in 0..80 {
            let words: String = (0..250).map(|n| format!("w{i}x{n}y ")).collect();
            input.push_str(&format!("INFO event{i} {words}\n"));
        }
        input.push_str("ERROR the disk is full\n");
        let out = compress(&input, &Options::default()).text;
        assert!(out.chars().count() < MAX_ENTRY_CHARS + 1_000, "{}", out.len());
        assert!(out.contains("ERROR the disk is full"));
        assert!(out.contains("patterns omitted"));
    }

    #[test]
    fn docker_json_logs_are_unwrapped() {
        let input = r#"{"log":"2026-11-18T10:00:01Z ERROR db down host=a\n","stream":"stderr","time":"2026-11-18T10:00:09Z"}
{"log":"worker started\n","stream":"stdout","time":"2026-11-18T10:00:10Z"}"#;
        let out = run(input);
        assert!(out.contains("levels: ERROR 1"), "{out}");
        assert!(out.contains("10:00:01 ERROR db down host=a"), "{out}");
        assert!(out.contains("10:00:10 worker started"), "{out}");
        assert!(!out.contains("stream="), "{out}");
    }

    #[test]
    fn containerd_logs_are_unwrapped() {
        let out = run("2026-11-18T10:00:01.5Z stderr F ERROR boom\n2026-11-18T10:00:02.5Z stdout F INFO fine");
        assert!(out.contains("10:00:01 ERROR boom"), "{out}");
        assert!(out.contains("10:00:02 INFO  fine"), "{out}");
    }

    #[test]
    fn kubectl_prefix_keeps_the_source_and_finds_the_level() {
        let input = "\
[pod/api-1/app] 2026-11-18T10:00:01Z ERROR db timeout
[pod/api-2/app] 2026-11-18T10:00:02Z ERROR db timeout";
        let out = run(input);
        assert!(out.contains("levels: ERROR 2"), "{out}");
        assert!(out.contains("10:00:01–10:00:02 ERROR [pod/api-{1|2}/app] db timeout ×2"), "{out}");
    }

    #[test]
    fn compose_prefix_is_a_source_but_a_level_is_not() {
        let out = run("api-1  | 2026-11-18T10:00:01Z WARN slow\nINFO | started");
        assert!(out.contains("WARN  [api-1] slow"), "{out}");
        assert!(!out.contains("[INFO]"), "{out}");
    }

    #[test]
    fn access_logs_get_time_and_severity_from_status() {
        let mut input = String::new();
        for (minute, status) in [(1, 200), (2, 200), (3, 404), (4, 502)] {
            input.push_str(&format!(
                "10.0.0.1 - - [18/Nov/2026:10:{minute:02}:00 +0000] \"GET /orders HTTP/1.1\" {status} 12 \"-\" \"curl/8\"\n"
            ));
        }
        let out = run(&input);
        assert!(out.contains("levels: ERROR 1 · WARN 1 · INFO 2"), "{out}");
        assert!(out.contains("10:04:00 ERROR GET /orders status=502"), "{out}");
        assert!(out.contains("10:03:00 WARN  GET /orders status=404"), "{out}");
        assert!(out.contains("2026-11-18"), "{out}");
    }

    #[test]
    fn small_input_is_returned_unchanged() {
        let run = |s: &str| compress(s, &Options::default()).text;
        assert_eq!(run("комп"), "комп");
        assert_eq!(run("  just one line of text  \n"), "just one line of text");
    }

    #[test]
    fn empty_input() {
        assert_eq!(run("\n\n"), "[komp] no log lines found");
    }
}
