//! The `komp` command.

use komp::{compress, guard, input, mcp};

const HELP: &str = "\
komp — compress DevOps/Kubernetes logs into a short summary for Claude

USAGE:
    komp              compress the logs on your clipboard
    komp <file>       compress a log file
    komp -            compress standard input   (kubectl logs api | komp -)
    komp serve        run as an MCP server on stdio (Claude Code starts this)
    komp hook         stop chat messages with pasted logs (Claude Code hook)
    komp --help       show this help
    komp --version    show the version

Secrets and personal data are removed first, on this machine. Clipboard text
that does not look like logs is refused.

The summary goes to stdout; the before/after size goes to stderr.";

fn main() {
    let arg = std::env::args().nth(1);

    let raw = match arg.as_deref() {
        Some("-h" | "--help") => {
            println!("{HELP}");
            return;
        }
        Some("-V" | "--version") => {
            println!("komp {}", env!("CARGO_PKG_VERSION"));
            return;
        }
        Some("serve") => {
            if let Err(e) = mcp::serve() {
                eprintln!("komp: {e}");
                std::process::exit(1);
            }
            return;
        }
        Some("hook") => {
            // A hook problem must never get in the way of an ordinary message.
            if let Some(block) = input::stdin().ok().and_then(|event| guard::prompt_hook(&event)) {
                println!("{block}");
            }
            return;
        }
        Some("-") => input::stdin(),
        Some(option) if option.starts_with('-') => {
            eprintln!("komp: unknown option {option}. Run komp --help to see the options.");
            std::process::exit(2);
        }
        Some(path) => input::file(path),
        None => input::clipboard(),
    };

    // Only the clipboard can hold something the user did not mean to share.
    let require_logs = arg.is_none();
    match raw.and_then(|text| guard::check(&text, require_logs)) {
        Ok(checked) => {
            let summary = compress::compress(&checked.text, &compress::Options::default());
            println!("{}", guard::redact(&summary.text).text);
            eprintln!("{}", summary.stats_line());
            eprintln!("{}", checked.report.line());
        }
        Err(message) => {
            eprintln!("komp: {message}");
            std::process::exit(1);
        }
    }
}
