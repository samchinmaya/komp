//! The `komp` command.

use komp::{compress, input, mcp};

const HELP: &str = "\
komp — compress DevOps/Kubernetes logs into a short summary for Claude

USAGE:
    komp              compress the logs on your clipboard
    komp <file>       compress a log file
    komp -            compress standard input   (kubectl logs api | komp -)
    komp serve        run as an MCP server on stdio (Claude Code starts this)
    komp --help       show this help

The summary goes to stdout; the before/after size goes to stderr.";

fn main() {
    let arg = std::env::args().nth(1);

    let raw = match arg.as_deref() {
        Some("-h" | "--help") => {
            println!("{HELP}");
            return;
        }
        Some("serve") => {
            if let Err(e) = mcp::serve() {
                eprintln!("komp: {e}");
                std::process::exit(1);
            }
            return;
        }
        Some("-") => input::stdin(),
        Some(path) => input::file(path),
        None => input::clipboard(),
    };

    match raw {
        Ok(text) => {
            let summary = compress::compress(&text, &compress::Options::default());
            println!("{}", summary.text);
            eprintln!("{}", summary.stats_line());
        }
        Err(message) => {
            eprintln!("komp: {message}");
            std::process::exit(1);
        }
    }
}
