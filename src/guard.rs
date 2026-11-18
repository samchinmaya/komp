//! The privacy check. Every log passes through here on this machine *before*
//! it is compressed, so nothing unchecked can reach Claude.
//!
//! It does two things:
//! 1. refuses text that does not look like logs (a copied password, a `.env`
//!    file, an SSH key), without echoing any of it;
//! 2. replaces secrets and personal data with `[redacted:…]` markers.
//!
//! This is pattern matching, so it lowers the risk but cannot promise to
//! recognise every secret. Private IP addresses are kept on purpose: they are
//! often the clue in an outage and do not identify a person.

use regex::{Captures, Regex};
use std::sync::LazyLock;

const SECRET: &str = "[redacted:secret]";

macro_rules! pattern {
    ($name:ident, $re:expr) => {
        static $name: LazyLock<Regex> = LazyLock::new(|| Regex::new($re).unwrap());
    };
}

pattern!(PRIVATE_KEY, r"(?s)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|\z)");
pattern!(URL_CREDENTIALS, r"(?i)\b([a-z][a-z0-9+.-]*://)[^\s/:@]+:[^\s/@]+@");
pattern!(AUTH_HEADER, r#"(?i)((?:proxy-)?authorization\\?["']?\s*[:=]\s*\\?["']?)(?:[a-z]+\s+)?[^\s"'\\,;]+"#);
pattern!(COOKIE, r#"(?i)\b((?:set-)?cookie\\?["']?\s*[:=]\s*\\?["']?)[^\r\n"\\]+"#);
pattern!(BEARER, r"(?i)\bbearer\s+[a-z0-9._~+/=-]{8,}");
pattern!(JWT, r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}");
pattern!(
    PROVIDER_TOKEN,
    r"\b(?:(?:AKIA|ASIA)[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|[sr]k_(?:live|test)_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|npm_[A-Za-z0-9]{20,})\b"
);
pattern!(
    KEY_VALUE,
    r#"(?i)((?:\\?["'])?[a-z0-9_.-]*(password|passwd|passphrase|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|session[_-]?id|credential|auth[_-]?key)[a-z0-9_.-]*(?:\\?["'])?\s*[:=]\s*)(\\?"[^"]*"|'[^']*'|[^\s,;&})\]]+)"#
);
pattern!(CARD, r"\b(?:4\d{3}|5[1-5]\d{2}|2[2-7]\d{2}|6011|65\d{2}|3[47]\d{2})(?:[ -]?\d){9,15}\b");
pattern!(SSN, r"\b\d{3}-\d{2}-\d{4}\b");
pattern!(EMAIL, r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b");
pattern!(IPV4, r"\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b");
pattern!(IPV6, r"\b[23][0-9a-fA-F]{3}(?::[0-9a-fA-F]{0,4}){2,7}\b");
pattern!(PHONE, r#"(?m)(^|[\s"'=:(])\+\d{10,15}\b"#);

pattern!(LOG_TIME, r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|\b\d{2}:\d{2}:\d{2}\b");
pattern!(LOG_LEVEL, r"(?i)^\s*\[?(?:trace|debug|info|notice|warn|warning|error|critical|fatal|panic)\]?[\s:]");
pattern!(LOG_KLOG, r"^[IWEF]\d{4} \d{2}:");
pattern!(LOG_FIELD, r"(?i)\b(?:level|lvl|msg|message|time|ts|severity)=");
pattern!(LOG_JSON, r#"(?i)^\s*\{.*"(?:level|lvl|msg|message|time|timestamp|ts|severity)"\s*:"#);
pattern!(
    LOG_TRACE,
    r#"^\s+at\s+\S+|^Traceback |^\s*File ".+", line \d+|^panic:|^goroutine \d+|^Caused by:|\b[A-Za-z.]*Exception\b"#
);

/// What the check removed. Counts only: the values themselves are never kept.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Report {
    pub secrets: usize,
    pub personal: usize,
}

impl Report {
    /// One line that tells Claude and the user the check ran.
    pub fn line(&self) -> String {
        if self.secrets + self.personal == 0 {
            return "[komp] privacy check: passed, nothing needed removing".to_string();
        }
        format!(
            "[komp] privacy check: removed {} secret(s) and {} personal detail(s)",
            self.secrets, self.personal
        )
    }
}

/// Text that has been through the check.
#[derive(Debug)]
pub struct Checked {
    pub text: String,
    pub report: Report,
}

/// The one way into the compressor. With `require_logs`, anything that does
/// not look like logs is refused, and the refusal never quotes the input.
pub fn check(raw: &str, require_logs: bool) -> Result<Checked, String> {
    if require_logs && !looks_like_logs(raw) {
        return Err(
            "komp did not use this text because it does not look like logs, so none of it was shared. \
             Copy log output and try again."
                .to_string(),
        );
    }
    Ok(redact(raw))
}

/// Does a chat message contain pasted logs? Three log lines are enough, and so
/// is one log line carrying a secret or personal data. A short question that
/// quotes a single error stays allowed.
pub fn contains_pasted_logs(prompt: &str) -> bool {
    let log_lines = prompt.lines().filter(|line| is_log_line(line)).count();
    let report = redact(prompt).report;
    log_lines >= 3 || (log_lines >= 1 && report.secrets + report.personal > 0)
}

/// The `UserPromptSubmit` hook: given Claude Code's JSON, return the JSON that
/// blocks the message, or `None` to let it through. Never echoes the message.
pub fn prompt_hook(input: &str) -> Option<serde_json::Value> {
    let event: serde_json::Value = serde_json::from_str(input).ok()?;
    contains_pasted_logs(event["prompt"].as_str()?).then(|| {
        serde_json::json!({
            "decision": "block",
            "reason": "komp stopped this message because it contains pasted logs, so it was not sent to Claude. \
                       Copy the logs, then ask Claude to check the logs you copied."
        })
    })
}

/// Do at least a fifth of the non-empty lines carry a sign of being a log?
pub fn looks_like_logs(text: &str) -> bool {
    let (mut lines, mut signals) = (0usize, 0usize);
    for line in text.lines().filter(|l| !l.trim().is_empty()) {
        lines += 1;
        if is_log_line(line) {
            signals += 1;
        }
    }
    signals > 0 && signals * 5 >= lines
}

fn is_log_line(line: &str) -> bool {
    [&*LOG_TIME, &*LOG_LEVEL, &*LOG_KLOG, &*LOG_FIELD, &*LOG_JSON, &*LOG_TRACE]
        .iter()
        .any(|p| p.is_match(line))
}

/// Replace secrets and personal data with markers.
pub fn redact(text: &str) -> Checked {
    let mut report = Report::default();
    let mut out = text.to_string();

    // Secrets. Whole structures go first, so later patterns see only markers.
    out = replace(&PRIVATE_KEY, &out, &mut report.secrets, |_| Some(SECRET.to_string()));
    out = replace(&URL_CREDENTIALS, &out, &mut report.secrets, |c| Some(format!("{}{SECRET}@", &c[1])));
    out = replace(&AUTH_HEADER, &out, &mut report.secrets, |c| Some(format!("{}{SECRET}", &c[1])));
    out = replace(&COOKIE, &out, &mut report.secrets, |c| Some(format!("{}{SECRET}", &c[1])));
    out = replace(&JWT, &out, &mut report.secrets, |_| Some(SECRET.to_string()));
    out = replace(&PROVIDER_TOKEN, &out, &mut report.secrets, |_| Some(SECRET.to_string()));
    out = replace(&BEARER, &out, &mut report.secrets, |_| Some(format!("Bearer {SECRET}")));
    out = replace(&KEY_VALUE, &out, &mut report.secrets, |c| {
        let value = &c[3];
        if is_harmless(&c[2], value) {
            return None;
        }
        let masked = match value.chars().next() {
            Some('\\') => format!("\\\"{SECRET}\\\""),
            Some('"') => format!("\"{SECRET}\""),
            Some('\'') => format!("'{SECRET}'"),
            _ => SECRET.to_string(),
        };
        Some(format!("{}{masked}", &c[1]))
    });

    // Personal data.
    out = replace(&CARD, &out, &mut report.personal, |c| luhn(&c[0]).then(|| "[redacted:card]".to_string()));
    out = replace(&SSN, &out, &mut report.personal, |_| Some("[redacted:id-number]".to_string()));
    out = replace(&EMAIL, &out, &mut report.personal, |_| Some("[redacted:email]".to_string()));
    out = replace(&IPV4, &out, &mut report.personal, |c| is_public_ipv4(c).then(|| "[redacted:ip]".to_string()));
    out = replace(&IPV6, &out, &mut report.personal, |_| Some("[redacted:ip]".to_string()));
    out = replace(&PHONE, &out, &mut report.personal, |c| Some(format!("{}[redacted:phone]", &c[1])));

    Checked { text: out, report }
}

/// Run one pattern. `None` from `mask` leaves that match untouched.
fn replace(
    pattern: &Regex,
    text: &str,
    count: &mut usize,
    mask: impl Fn(&Captures) -> Option<String>,
) -> String {
    pattern
        .replace_all(text, |c: &Captures| match mask(c) {
            // Already masked (the finished summary is checked again): not a new find.
            Some(masked) if masked != c[0] => {
                *count += 1;
                masked
            }
            _ => c[0].to_string(),
        })
        .into_owned()
}

/// Values such as `token=expired` or `max_tokens=100` describe, not reveal.
fn is_harmless(key: &str, value: &str) -> bool {
    let bare = value.trim_matches(|c| c == '"' || c == '\'' || c == '\\');
    let lower = bare.to_ascii_lowercase();
    bare.is_empty()
        || bare.starts_with("[redacted")
        || bare.chars().all(|c| c == '*')
        || matches!(
            lower.as_str(),
            "true" | "false" | "null" | "nil" | "none" | "empty" | "missing" | "invalid" | "expired" | "required"
        )
        || (key.eq_ignore_ascii_case("token") && bare.chars().all(|c| c.is_ascii_digit()))
        || (key.eq_ignore_ascii_case("pwd") && bare.starts_with('/'))
}

fn is_public_ipv4(c: &Captures) -> bool {
    let octet = |i: usize| c[i].parse::<u16>().unwrap_or(999);
    let (a, b, cc, d) = (octet(1), octet(2), octet(3), octet(4));
    if [a, b, cc, d].iter().any(|&n| n > 255) {
        return false;
    }
    !(a == 0
        || a == 10
        || a == 127
        || a >= 224
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 168))
}

/// The checksum real card numbers satisfy; it avoids masking ordinary long IDs.
fn luhn(candidate: &str) -> bool {
    let digits: Vec<u32> = candidate.chars().filter_map(|c| c.to_digit(10)).collect();
    if !(13..=19).contains(&digits.len()) {
        return false;
    }
    let sum: u32 = digits
        .iter()
        .rev()
        .enumerate()
        .map(|(i, &d)| match (i % 2 == 1, d * 2) {
            (true, doubled) if doubled > 9 => doubled - 9,
            (true, doubled) => doubled,
            (false, _) => d,
        })
        .sum();
    sum % 10 == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clean(text: &str) -> String {
        redact(text).text
    }

    #[test]
    fn refuses_text_that_is_not_logs_without_quoting_it() {
        for text in [
            "hunter2",
            "DATABASE_PASSWORD=hunter2\nAPI_KEY=abc123",
            "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk\n-----END OPENSSH PRIVATE KEY-----",
            "Dear Sam, here is my home address and phone number.",
        ] {
            let message = check(text, true).unwrap_err();
            assert!(message.contains("does not look like logs"));
            assert!(!message.contains("hunter2") && !message.contains("b3Blbn"));
        }
    }

    #[test]
    fn accepts_common_log_shapes() {
        for text in [
            "2026-11-18T10:00:00Z connection refused",
            "ERROR query failed",
            "time=now level=info msg=ok",
            r#"{"level":30,"time":1794996000757,"msg":"ok"}"#,
            "E1118 10:00:00.790000 2345 pod_workers.go:1] sync failed",
            "java.lang.NullPointerException: boom\n    at a.b.C.d(C.java:1)",
        ] {
            assert!(check(text, true).is_ok(), "{text}");
        }
    }

    #[test]
    fn removes_secrets_in_every_common_shape() {
        for (input, secret) in [
            ("Authorization: Bearer abc.def.ghijkl", "abc.def"),
            ("authorization=Basic dXNlcjpwYXNz", "dXNlcjpwYXNz"),
            ("password=hunter2 user=sam", "hunter2"),
            (r#"{"apiKey":"s3cr3t-value","level":"info"}"#, "s3cr3t-value"),
            (r#"{"line":"{\"password\":\"hunter2\"}"}"#, "hunter2"),
            ("GET /cb?access_token=abc123&ok=1", "abc123"),
            ("postgres://app:hunter2@db.internal:5432/orders", "hunter2"),
            ("key AKIAIOSFODNN7EXAMPLE used", "AKIAIOSFODNN7EXAMPLE"),
            ("ghp_abcdefghijklmnopqrstuvwxyz012345", "ghp_abc"),
            ("sk-ant-api03-abcdefghijklmnopqrstuvwx", "sk-ant"),
            ("jwt eyJhbGciOiJI.eyJzdWIiOiIx.abcDEF123", "eyJhbG"),
            ("Cookie: sid=abc; theme=dark", "sid=abc"),
            ("-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----", "AAAA"),
        ] {
            let result = redact(input);
            assert!(!result.text.contains(secret), "{input} -> {}", result.text);
            assert!(result.report.secrets > 0, "{input}");
        }
    }

    #[test]
    fn json_lines_stay_valid_after_redaction() {
        let out = clean(r#"{"level":"info","password":"hunter2","msg":"ok"}"#);
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed["password"], SECRET);
        assert_eq!(parsed["msg"], "ok");
    }

    #[test]
    fn removes_personal_data() {
        let result = redact("user a.b+c@example.com from 8.8.8.8 card 4111 1111 1111 1111 ssn 123-45-6789 tel +919876543210");
        for leaked in ["example.com", "8.8.8.8", "4111", "123-45-6789", "+919876543210"] {
            assert!(!result.text.contains(leaked), "{}", result.text);
        }
        assert_eq!(result.report.personal, 5);
    }

    fn hook(prompt: &str) -> Option<serde_json::Value> {
        prompt_hook(&serde_json::json!({ "prompt": prompt }).to_string())
    }

    #[test]
    fn hook_blocks_pasted_logs_without_quoting_them() {
        let pasted = "what is wrong here?\n\
            2026-11-18T10:00:00Z INFO start\n\
            2026-11-18T10:00:01Z ERROR failed secretvalue\n\
            2026-11-18T10:00:02Z INFO stop";
        let reply = hook(pasted).unwrap();
        assert_eq!(reply["decision"], "block");
        assert!(!reply.to_string().contains("secretvalue"));
        assert!(hook("2026-11-18T10:00:00Z ERROR login failed password=hunter2").is_some());
    }

    #[test]
    fn hook_allows_normal_messages() {
        for prompt in [
            "check the logs I copied",
            "why would I see ERROR: connection refused from postgres?",
            "2026-11-18T10:00:00Z ERROR connection refused, what does this mean?",
            "email me at a@example.com about the login page",
            "fn main() {\n    println!(\"hello\");\n}\n",
        ] {
            assert!(hook(prompt).is_none(), "{prompt}");
        }
        assert!(prompt_hook("not json").is_none());
        assert!(prompt_hook("{}").is_none());
    }

    #[test]
    fn checking_twice_changes_nothing_and_counts_nothing_new() {
        let first = redact("Authorization: Bearer abcdefghijkl url=postgres://app:pw@db/orders password=x a@b.co");
        let second = redact(&first.text);
        assert_eq!(second.text, first.text);
        assert_eq!(second.report, Report::default());
    }

    #[test]
    fn keeps_what_debugging_needs() {
        for text in [
            "dial tcp 10.0.3.17:5432: connect: connection refused",
            "from 192.168.1.4 and 127.0.0.1",
            "token=expired max_tokens=100 tokens=312",
            "2026-11-18T10:00:00.313000000Z time=1794996000757",
            "order 4111111111111112 is not a valid card",
        ] {
            let result = redact(text);
            assert_eq!(result.text, text);
            assert_eq!(result.report, Report::default());
        }
    }
}
