//! Where logs come from. Each function returns the raw text, or an error
//! message written for a human (it is shown to Claude, who relays it).

use regex::Regex;
use std::process::Command;
use std::sync::LazyLock;

/// The text the engineer copied (Cmd+C).
pub fn clipboard() -> Result<String, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| format!("could not open the clipboard: {e}"))?;
    clipboard.get_text().map_err(|_| {
        "the clipboard has no text in it (was a screenshot or file copied instead of log text?)".to_string()
    })
}

/// A log file on disk.
pub fn file(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("could not read {path}: {e}"))?;
    decode(&bytes, path)
}

/// Everything from standard input (`cat app.log | komp -`).
pub fn stdin() -> Result<String, String> {
    use std::io::Read;
    let mut bytes = Vec::new();
    std::io::stdin().read_to_end(&mut bytes).map_err(|e| format!("could not read stdin: {e}"))?;
    decode(&bytes, "standard input")
}

/// Turn bytes into log text. A few invalid bytes are replaced, but compressed or
/// binary data is refused without quoting any of it.
pub fn decode(bytes: &[u8], name: &str) -> Result<String, String> {
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        return Ok(utf16(rest, u16::from_le_bytes));
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        return Ok(utf16(rest, u16::from_be_bytes));
    }
    if bytes.starts_with(&[0x1F, 0x8B]) {
        return Err(format!(
            "{name} is gzip-compressed, so komp did not read it. Decompress it first: gzip -dc app.log.gz | komp -"
        ));
    }
    if looks_binary(bytes) {
        return Err(format!("{name} looks like a binary file, so komp did not read it."));
    }
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    Ok(String::from_utf8_lossy(bytes).into_owned())
}

fn utf16(bytes: &[u8], unit: fn([u8; 2]) -> u16) -> String {
    let units: Vec<u16> = bytes.chunks_exact(2).map(|pair| unit([pair[0], pair[1]])).collect();
    String::from_utf16_lossy(&units)
}

/// Judge from the start of the data: a NUL byte, or more than 5% unreadable characters.
fn looks_binary(bytes: &[u8]) -> bool {
    let sample = &bytes[..bytes.len().min(64 * 1024)];
    if sample.contains(&0) {
        return true;
    }
    let text = String::from_utf8_lossy(sample);
    let total = text.chars().count();
    let unreadable = text
        .chars()
        .filter(|&c| c == '\u{FFFD}' || (c.is_control() && !matches!(c, '\t' | '\n' | '\r' | '\x0C' | '\x1B')))
        .count();
    unreadable * 20 > total
}

/// Arguments for `kubectl logs`.
#[derive(Debug, Default)]
pub struct KubectlLogs {
    /// Pod name, or `type/name` such as `deploy/api`.
    pub target: String,
    pub namespace: Option<String>,
    pub container: Option<String>,
    /// e.g. "10m", "1h"
    pub since: Option<String>,
    pub tail: Option<u64>,
    /// Logs of the previous (crashed) container instance.
    pub previous: bool,
}

// Names must look like Kubernetes names. This also stops values such as
// "--kubeconfig=/etc/…" from being smuggled in as extra kubectl flags.
static K8S_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,252}$").unwrap());
static DURATION: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\d+[smh]$").unwrap());

/// Run `kubectl logs …` and return its output. No shell is involved:
/// each argument is passed to kubectl as-is.
pub fn kubectl_logs(args: &KubectlLogs) -> Result<String, String> {
    check(&K8S_NAME, "pod", Some(&args.target))?;
    check(&K8S_NAME, "namespace", args.namespace.as_deref())?;
    check(&K8S_NAME, "container", args.container.as_deref())?;
    check(&DURATION, "since", args.since.as_deref())?;

    let mut cmd = Command::new("kubectl");
    cmd.arg("logs").arg(&args.target).arg("--timestamps");
    if let Some(ns) = &args.namespace {
        cmd.arg("--namespace").arg(ns);
    }
    if let Some(container) = &args.container {
        cmd.arg("--container").arg(container);
    }
    if let Some(since) = &args.since {
        cmd.arg(format!("--since={since}"));
    }
    cmd.arg(format!("--tail={}", args.tail.unwrap_or(5000).min(100_000)));
    if args.previous {
        cmd.arg("--previous");
    }

    let output = cmd.output().map_err(|e| format!("could not run kubectl: {e}"))?;
    if !output.status.success() {
        // kubectl's own errors are repetitive klog lines too, so compress them.
        let stderr = String::from_utf8_lossy(&output.stderr);
        let checked = crate::guard::redact(&stderr);
        let summary = crate::compress::compress(&checked.text, &Default::default());
        return Err(format!("kubectl logs failed:\n{}", crate::guard::redact(&summary.text).text));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn check(pattern: &Regex, what: &str, value: Option<&str>) -> Result<(), String> {
    match value {
        Some(v) if !pattern.is_match(v) => Err(format!("invalid {what}: {v:?}")),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_compressed_and_binary_data() {
        let gzip = decode(&[0x1F, 0x8B, 8, 0, 1, 2, 3], "app.log.gz").unwrap_err();
        assert!(gzip.contains("gzip-compressed"));
        let binary = decode(&[1, 2, 0, 4, 5], "core").unwrap_err();
        assert!(binary.contains("binary file"));
    }

    #[test]
    fn keeps_text_with_a_few_bad_bytes_and_reads_utf16() {
        let mut log = b"2026-11-18 INFO caf".to_vec();
        log.push(0xE9);
        log.extend_from_slice(" opened with enough ordinary text around it\n".as_bytes());
        assert!(decode(&log, "app.log").unwrap().contains("INFO caf"));

        let utf16: Vec<u8> =
            [0xFF, 0xFE].into_iter().chain("INFO ok".encode_utf16().flat_map(u16::to_le_bytes)).collect();
        assert_eq!(decode(&utf16, "win.log").unwrap(), "INFO ok");
        assert_eq!(decode(b"\xEF\xBB\xBFINFO ok", "bom.log").unwrap(), "INFO ok");
    }

    #[test]
    fn rejects_flag_injection() {
        let args = KubectlLogs { target: "--kubeconfig=/tmp/evil".into(), ..Default::default() };
        assert!(kubectl_logs(&args).unwrap_err().starts_with("invalid pod"));
        let args = KubectlLogs { target: "api".into(), since: Some("1d; rm".into()), ..Default::default() };
        assert!(kubectl_logs(&args).unwrap_err().starts_with("invalid since"));
    }
}
