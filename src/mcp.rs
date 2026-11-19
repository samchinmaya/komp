//! The MCP server: lets Claude call комп as a tool.
//!
//! MCP over stdio is simple: Claude Code starts `komp serve` as a child
//! process and they exchange JSON-RPC 2.0 messages, one JSON object per line.
//!
//!   Claude → komp (stdin):   {"jsonrpc":"2.0","id":1,"method":"tools/list"}
//!   komp → Claude (stdout):  {"jsonrpc":"2.0","id":1,"result":{"tools":[…]}}
//!
//! Requests have an `id` and need exactly one reply with the same `id`.
//! Notifications have no `id` and must not be answered.
//!
//! Because stdout *is* the protocol, nothing else may be printed there:
//! all logging goes to stderr (`eprintln!`).

use crate::compress::{Options, compress};
use crate::{guard, input};
use serde_json::{Value, json};
use std::io::{self, BufRead, Write};

/// Used only if the client doesn't say which version it speaks.
const DEFAULT_PROTOCOL_VERSION: &str = "2025-06-18";

/// Read requests from stdin and answer on stdout until stdin closes.
pub fn serve() -> io::Result<()> {
    eprintln!("komp {} MCP server ready on stdio", env!("CARGO_PKG_VERSION"));
    let mut stdout = io::stdout().lock();
    for line in io::stdin().lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(message) => handle(&message),
            Err(e) => Some(error(Value::Null, -32700, &format!("parse error: {e}"))),
        };
        if let Some(reply) = reply {
            writeln!(stdout, "{reply}")?;
            stdout.flush()?;
        }
    }
    Ok(())
}

/// Handle one incoming message. `None` = nothing to send back.
pub fn handle(message: &Value) -> Option<Value> {
    let method = message.get("method")?.as_str()?;
    // No id → a notification (e.g. "notifications/initialized"): never reply.
    let id = message.get("id")?.clone();
    let params = message.get("params").cloned().unwrap_or(Value::Null);

    let result = match method {
        "initialize" => json!({
            "protocolVersion": params["protocolVersion"].as_str().unwrap_or(DEFAULT_PROTOCOL_VERSION),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "komp", "version": env!("CARGO_PKG_VERSION") },
            "instructions": "komp is a local log summariser the user installed for themselves; it \
                runs on this machine and sends nothing anywhere. When the user says they copied logs, \
                call compress_clipboard instead of running pbpaste or asking them to paste: raw logs \
                cost the full token price, the summary costs a few hundred tokens. Before anything is \
                returned, komp refuses text that is not logs and removes secrets and personal data. \
                Call its tools only for logs the user asked you to look at.",
        }),
        "ping" => json!({}),
        "tools/list" => json!({ "tools": tool_definitions() }),
        "tools/call" => call_tool(&params),
        other => return Some(error(id, -32601, &format!("method not found: {other}"))),
    };
    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
}

fn error(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// What Claude sees in `tools/list`: names, descriptions and JSON Schemas of the arguments.
fn tool_definitions() -> Value {
    let max_entries = json!({
        "type": "integer", "minimum": 5, "maximum": 500,
        "description": "Maximum number of output lines (default 80). Errors and warnings are kept first."
    });
    json!([
        {
            "name": "compress_clipboard",
            "description": "Read and summarise the logs the user copied to their clipboard \
                (Kubernetes, Docker, app logs; plain text, JSON, logfmt, klog). Runs entirely on this \
                machine: a local program the user installed, nothing is sent anywhere. Returns one line \
                per distinct message with ×counts, time ranges and value ranges; errors and warnings \
                keep their values and stack traces. A local privacy check runs first: text that is not \
                logs is refused, and secrets and personal data are removed. Use this whenever the user \
                says they copied logs, and only then. Prefer it over reading the clipboard with shell \
                commands (pbpaste, xclip) or asking the user to paste: those skip the privacy check and \
                put thousands of raw log lines into the conversation.",
            "inputSchema": {
                "type": "object",
                "properties": { "max_entries": max_entries },
                "additionalProperties": false
            }
        },
        {
            "name": "compress_file",
            "description": "Compress a log file on the user's machine (same output and privacy check as \
                compress_clipboard). Files that are not logs are refused.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Path to the log file" },
                    "max_entries": max_entries
                },
                "required": ["path"],
                "additionalProperties": false
            }
        },
        {
            "name": "compress_kubectl_logs",
            "description": "Run `kubectl logs --timestamps` for a pod with the user's current kube \
                context and return the compressed result, after the same privacy check.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "pod": { "type": "string", "description": "Pod name, or type/name such as deploy/api" },
                    "namespace": { "type": "string" },
                    "container": { "type": "string" },
                    "since": { "type": "string", "description": "Only logs newer than this, e.g. 10m or 2h" },
                    "tail": { "type": "integer", "minimum": 1, "description": "Last N lines (default 5000)" },
                    "previous": { "type": "boolean", "description": "Logs of the previous, crashed container" },
                    "max_entries": max_entries
                },
                "required": ["pod"],
                "additionalProperties": false
            }
        }
    ])
}

/// Run a tool. Failures are returned as tool results with `isError: true`
/// (not JSON-RPC errors) so Claude can read the message and react to it.
fn call_tool(params: &Value) -> Value {
    let name = params["name"].as_str().unwrap_or("");
    let args = &params["arguments"];
    let text = |key: &str| args[key].as_str().map(str::to_string);

    let raw = match name {
        "compress_clipboard" => input::clipboard(),
        "compress_file" => match text("path") {
            Some(path) => input::file(&path),
            None => Err("missing required argument: path".to_string()),
        },
        "compress_kubectl_logs" => match text("pod") {
            Some(target) => input::kubectl_logs(&input::KubectlLogs {
                target,
                namespace: text("namespace"),
                container: text("container"),
                since: text("since"),
                tail: args["tail"].as_u64(),
                previous: args["previous"].as_bool().unwrap_or(false),
            }),
            None => Err("missing required argument: pod".to_string()),
        },
        other => Err(format!("unknown tool: {other}")),
    };

    match raw {
        Ok(logs) if logs.trim().is_empty() => tool_result("No log text found: the input was empty.", true),
        Ok(logs) => {
            // kubectl output is logs by definition; a clipboard or a path might be anything.
            let require_logs = name != "compress_kubectl_logs";
            match guard::check(&logs, require_logs) {
                Ok(checked) => summarise(&checked, args),
                Err(message) => tool_result(&message, true),
            }
        }
        Err(message) => tool_result(&message, true),
    }
}

/// Only checked text gets here, and the finished summary is checked once more.
fn summarise(checked: &guard::Checked, args: &Value) -> Value {
    let max_entries = args["max_entries"].as_u64().map_or(80, |n| n.clamp(5, 500) as usize);
    let summary = compress(&checked.text, &Options { max_entries, ..Options::default() });
    let output = guard::redact(&summary.text);
    let privacy = guard::Report {
        secrets: checked.report.secrets + output.report.secrets,
        personal: checked.report.personal + output.report.personal,
    };
    eprintln!("{}", summary.stats_line());
    eprintln!("{}", privacy.line());
    tool_result(&format!("{}\n{}\n{}", output.text, summary.stats_line(), privacy.line()), false)
}

fn tool_result(text: &str, is_error: bool) -> Value {
    json!({ "content": [{ "type": "text", "text": text }], "isError": is_error })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_echoes_protocol_version() {
        let reply = handle(&json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": { "protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": { "name": "t", "version": "0" } }
        }))
        .unwrap();
        assert_eq!(reply["id"], 1);
        assert_eq!(reply["result"]["protocolVersion"], "2025-03-26");
        assert_eq!(reply["result"]["serverInfo"]["name"], "komp");
    }

    #[test]
    fn notifications_get_no_reply() {
        assert!(handle(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })).is_none());
    }

    #[test]
    fn lists_three_tools() {
        let reply = handle(&json!({ "jsonrpc": "2.0", "id": "a", "method": "tools/list" })).unwrap();
        let names: Vec<&str> =
            reply["result"]["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert_eq!(names, ["compress_clipboard", "compress_file", "compress_kubectl_logs"]);
    }

    #[test]
    fn unknown_method_is_an_error() {
        let reply = handle(&json!({ "jsonrpc": "2.0", "id": 7, "method": "nope" })).unwrap();
        assert_eq!(reply["error"]["code"], -32601);
    }

    fn call_on_file(name: &str, contents: &str) -> Value {
        let path = std::env::temp_dir().join(format!("komp-{}-{name}", std::process::id()));
        std::fs::write(&path, contents).unwrap();
        let reply = handle(&json!({
            "jsonrpc": "2.0", "id": 3, "method": "tools/call",
            "params": { "name": "compress_file", "arguments": { "path": path } }
        }))
        .unwrap();
        std::fs::remove_file(&path).unwrap();
        reply["result"].clone()
    }

    #[test]
    fn secrets_never_reach_the_tool_result() {
        let result = call_on_file(
            "secrets.log",
            "2026-11-18T10:00:00Z ERROR login failed password=hunter2 user=a@example.com\n",
        );
        let text = result["content"][0]["text"].as_str().unwrap();
        assert_eq!(result["isError"], false);
        assert!(!text.contains("hunter2") && !text.contains("a@example.com"), "{text}");
        assert!(text.contains("removed 1 secret(s) and 1 personal detail(s)"), "{text}");
    }

    #[test]
    fn files_that_are_not_logs_are_refused_without_being_quoted() {
        let result = call_on_file("dotenv", "DATABASE_PASSWORD=hunter2\nAPI_KEY=abc123\n");
        let text = result["content"][0]["text"].as_str().unwrap();
        assert_eq!(result["isError"], true);
        assert!(text.contains("does not look like logs") && !text.contains("hunter2"), "{text}");
    }

    #[test]
    fn tool_errors_are_reported_to_claude() {
        let reply = handle(&json!({
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": { "name": "compress_file", "arguments": { "path": "/definitely/not/here.log" } }
        }))
        .unwrap();
        assert_eq!(reply["result"]["isError"], true);
        assert!(reply["result"]["content"][0]["text"].as_str().unwrap().contains("could not read"));
    }
}
