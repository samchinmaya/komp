//! The compressor: raw log text in → short, meaningful summary out.
//!
//! The pipeline, one function per step:
//!
//! 1. `parse`      split the text into records (timestamp, level, message,
//!                 stack-trace lines). Understands plain text, JSON, logfmt,
//!                 klog (Kubernetes components) and syslog lines.
//! 2. `hoist`      anything every line shares (a `[pod/api-…]` tag, `env=prod`)
//!                 moves into the header once instead of repeating per line.
//! 3. `templatize` the variable parts of a message become slots:
//!                 `GET /health 200 2ms` → `GET /health ␁ ␁`, values `["200","2ms"]`.
//! 4. group        records with the same level + template merge into one group
//!                 that remembers every slot value, the count and the time range.
//! 5. render       one line per group: `10:00:01–10:00:07 INFO GET /health 200 1–3ms ×4`.
//!
//! This module knows nothing about MCP, the clipboard or files: text in, text out.

use regex::Regex;
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

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

    // ---- 4. group ----
    let mut groups: Vec<Group> = Vec::new();
    let mut index: HashMap<(Level, String), usize> = HashMap::new();
    let mut level_counts: HashMap<Level, usize> = HashMap::new();

    for record in records {
        *level_counts.entry(record.level).or_default() += 1;
        let (template, values) = templatize(&record.message);
        let slot_count = values.len();
        let gi = *index.entry((record.level, template.clone())).or_insert_with(|| {
            groups.push(Group::new(record.level, template, slot_count));
            groups.len() - 1
        });
        let when = stamp(&record);
        groups[gi].add(record, values, when);
    }

    // ---- budget: keep errors/warnings first, then the most frequent lines ----
    let mut keep = vec![true; groups.len()];
    if groups.len() > opts.max_entries {
        let mut ranked: Vec<usize> = (0..groups.len()).collect();
        ranked.sort_by_key(|&i| {
            let g = &groups[i];
            (std::cmp::Reverse(g.important), std::cmp::Reverse(g.level), std::cmp::Reverse(g.count), i)
        });
        keep = vec![false; groups.len()];
        for &i in ranked.iter().take(opts.max_entries) {
            keep[i] = true;
        }
    }

    // ---- 5. render ----
    let kept = keep.iter().filter(|k| **k).count();
    let mut out = String::new();

    let plural = |n: usize, one: &str, many: &str| format!("{n} {}", if n == 1 { one } else { many });
    let mut header = format!(
        "[komp] {} → {}",
        plural(input_lines, "line", "lines"),
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

    for (g, _) in groups.iter().zip(&keep).filter(|(_, k)| **k) {
        out.push_str(&g.render(opts.max_trace_lines));
    }

    // Say what was dropped, so Claude knows the summary is partial.
    let dropped: Vec<&Group> = groups.iter().zip(&keep).filter(|(_, k)| !**k).map(|(g, _)| g).collect();
    if !dropped.is_empty() {
        let lines: usize = dropped.iter().map(|g| g.count).sum();
        out.push_str(&format!(
            "… {} rarer low-severity patterns omitted ({lines} lines)\n",
            dropped.len()
        ));
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
lazy_regex!(LEVEL_PREFIX, r"(?i)^[\[(]?(trace|debug|dbg|info|inf|notice|warning|warn|wrn|error|err|eror|fatal|critical|crit|panic|severe)[\])]?:?(?:\s+|$)");
// [api] ERROR msg  (a tag, then an upper-case level)
lazy_regex!(TAG_THEN_LEVEL, r"^(\[[^\]]*\]\s+)[\[(]?(TRACE|DEBUG|INFO|NOTICE|WARNING|WARN|ERROR|FATAL|CRITICAL|PANIC)[\])]?:?(?:\s+|$)");
// logfmt: level=error  /  time="2026-11-18T10:00:01Z"
lazy_regex!(LOGFMT_LEVEL, r#"(?i)(?:^|\s)(?:level|lvl|severity)="?([a-z]+)"?"#);
lazy_regex!(LOGFMT_TIME, r#"(?:^|\s)(?:time|ts|timestamp)="?(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})[^\s"]*"?"#);
// Lines that continue the previous record: indented, Java "at …", "Caused by:", "... 12 more"
lazy_regex!(CONTINUATION, r"^(?:\s+\S|at |Caused by:|\.\.\. \d+ (?:more|common frames omitted))");
// An exception on its own line: "java.lang.NullPointerException: …", "ValueError: …"
lazy_regex!(EXCEPTION_HEAD, r"^(?:[\w$]+\.)*[\w$]*(?:Error|Exception|Throwable)\b");
// Python prints this before every stack trace; it carries no information.
lazy_regex!(TRACEBACK, r"^Traceback \(most recent call last\):");
// Text that smells like trouble even without a level.
lazy_regex!(LOOKS_BAD, r"(?i:\b(?:errors?|exception|fatal|panic|failed|failure|refused|timeout|timed out|deadline exceeded|denied|unauthorized|forbidden|oomkilled|out of memory|crashloopbackoff|back-off|unhealthy|evicted)\b)|\w(?:Error|Exception)\b");

fn parse(input: &str) -> Vec<Record> {
    let mut records: Vec<Record> = Vec::new();

    for raw in input.lines() {
        let clean = ANSI_COLOR.replace_all(raw, "");
        let line = clean.trim_end();
        if line.trim().is_empty() {
            continue;
        }

        if let Some(record) = parse_json(line.trim_start()) {
            records.push(record);
            continue;
        }

        let (mut date, mut time, mut level, rest) = split_timestamp(line);

        // A stack-trace line belongs to the record before it.
        if let Some(prev) = records.last_mut() {
            let looks_new = LEVEL_PREFIX.is_match(rest.trim_start());
            if CONTINUATION.is_match(&rest) && !looks_new {
                prev.extra.push(rest.trim().to_string());
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
                let cause = cause.split_whitespace().collect::<Vec<_>>().join(" ");
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
        records.push(Record { date, time, level, message, extra: Vec::new(), important, has_cause: false });
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
                extra.extend(stack.lines().skip(1).map(|l| l.trim().to_string()));
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
            r.message = r
                .message
                .split_whitespace()
                .filter(|t| !shared.iter().any(|s| s == t))
                .collect::<Vec<_>>()
                .join(" ");
        }
    }
    shared
}

// ─────────────────────────── 3. templatize ───────────────────────────

/// Marks a slot inside a template. A control character that never appears in logs.
const SLOT: char = '\u{1}';

// The variable parts of a message. Order matters: the first alternative that matches wins.
lazy_regex!(
    VARIABLE,
    r#"(?x)
      (?:\b(?i:[a-z_]*id)=)(?P<idval>[^\s,;"}]+)
    | (?P<ts>\d{4}-\d{2}-\d{2}[T\ ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)
    | (?P<uuid>\b[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\b)
    | (?P<ip>\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?\b)
    | (?P<pod>\b[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{8,10}-[a-z0-9]{5}\b)
    | (?P<clock>\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b)
    | (?P<num>\b\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|KiB|MiB|GiB|Ki|Mi|Gi|KB|MB|GB|kB|B)?\b)
    | (?P<id>\b\w*\d\w*\b)
    "#
);

/// `"GET /users/42 200 3ms"` → (`"GET /users/␁ ␁ ␁"`, `["42", "200", "3ms"]`)
///
/// The first alternative makes the value of any `…id=` key a slot (`reqId=caabfb`).
/// The last one, `id`, catches any word containing a digit (`d33c81`, `x2k4`).
/// Over-matching is harmless: a slot that only ever has one value is printed as that value.
fn templatize(message: &str) -> (String, Vec<String>) {
    let mut template = String::with_capacity(message.len());
    let mut values = Vec::new();
    let mut last = 0;
    for caps in VARIABLE.captures_iter(message) {
        // For `key=value` matches only the value is the slot; otherwise the whole match.
        let m = caps.name("idval").unwrap_or_else(|| caps.get(0).unwrap());
        template.push_str(&message[last..m.start()]);
        template.push(SLOT);
        values.push(m.as_str().to_string());
        last = m.end();
    }
    template.push_str(&message[last..]);
    (template, values)
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

lazy_regex!(NUMBER_WITH_UNIT, r"^(\d+(?:\.\d+)?)([a-zA-Zµ]*)$");

impl Slot {
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
        let parsed = NUMBER_WITH_UNIT
            .captures(value)
            .and_then(|c| Some((c[1].parse::<f64>().ok()?, c[2].to_string())));
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
        }
    }

    fn add(&mut self, record: Record, values: Vec<String>, when: Option<String>) {
        self.count += 1;
        self.important |= record.important;
        for (slot, value) in self.slots.iter_mut().zip(&values) {
            slot.add(value);
        }
        if self.extra.is_empty() && !record.extra.is_empty() {
            self.extra = record.extra;
        }
        if when.is_some() {
            if self.first_seen.is_none() {
                self.first_seen = when.clone();
            }
            self.last_seen = when;
        }
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
            out.contains("ERROR 1 --- [main] c.e.App : request failed → java.lang.IllegalStateException: no customer ×3"),
            "exception merged into its ERROR line: {out}"
        );
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
    fn budget_keeps_errors_first() {
        let mut input = String::new();
        for i in 0..50 {
            input.push_str(&format!("INFO unique-event-{} happened\n", "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".chars().nth(i).unwrap()));
        }
        input.push_str("ERROR disk full on /var/lib/data\n");
        let out = compress(&input, &Options { max_entries: 10, ..Default::default() }).text;
        assert!(out.contains("ERROR disk full"), "{out}");
        assert!(out.contains("patterns omitted"), "{out}");
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
