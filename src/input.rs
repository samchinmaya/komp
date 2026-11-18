//! Where logs come from. Each function returns the raw text, or an error
//! message written for a human (it is shown to Claude, who relays it).

use regex::Regex;
use std::process::Command;
use std::sync::LazyLock;

/// The text the engineer copied (Cmd+C).
pub fn clipboard() -> Result<String, String> {
    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("could not open the clipboard: {e}"))?;
    clipboard
        .get_text()
        .map_err(|_| "the clipboard has no text in it (was a screenshot or file copied instead of log text?)".to_string())
}

/// A log file on disk. Invalid UTF-8 bytes are replaced instead of failing.
pub fn file(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("could not read {path}: {e}"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Everything from standard input (`cat app.log | komp -`).
pub fn stdin() -> Result<String, String> {
    use std::io::Read;
    let mut text = String::new();
    std::io::stdin()
        .read_to_string(&mut text)
        .map_err(|e| format!("could not read stdin: {e}"))?;
    Ok(text)
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
static K8S_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,252}$").unwrap());
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
    fn rejects_flag_injection() {
        let args = KubectlLogs { target: "--kubeconfig=/tmp/evil".into(), ..Default::default() };
        assert!(kubectl_logs(&args).unwrap_err().starts_with("invalid pod"));
        let args = KubectlLogs { target: "api".into(), since: Some("1d; rm".into()), ..Default::default() };
        assert!(kubectl_logs(&args).unwrap_err().starts_with("invalid since"));
    }
}
