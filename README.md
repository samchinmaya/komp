<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/logo-dark.svg">
    <img src="brand/logo-light.svg" width="220" alt="комп">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/samchinmaya/komp/actions/workflows/ci.yml"><img src="https://github.com/samchinmaya/komp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/samchinmaya/komp/releases/latest"><img src="https://img.shields.io/github/v/release/samchinmaya/komp" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

# комп (komp)

Compress DevOps and Kubernetes logs into a short, meaningful summary, so Claude
spends a few hundred tokens reading them instead of tens of thousands.

```
2,001 lines of Go service logs   ~76,000 tokens  →  11 lines   ~310 tokens
1,350 lines of Spring Boot logs  ~41,000 tokens  →   8 lines   ~200 tokens
1,200 lines of Node JSON logs    ~60,000 tokens  →  10 lines   ~310 tokens
  700 lines of kubelet logs      ~39,000 tokens  →   7 lines   ~320 tokens
```

## Install

**macOS and Linux**, one line:

```bash
curl -fsSL https://raw.githubusercontent.com/samchinmaya/komp/master/install.sh | sh
```

It downloads the right binary for your machine from the
[latest release](https://github.com/samchinmaya/komp/releases/latest), checks
its SHA-256 checksum and puts `komp` in `~/.local/bin`.

**Windows**: download `komp-x86_64-pc-windows-msvc.zip` from the
[latest release](https://github.com/samchinmaya/komp/releases/latest) and put
`komp.exe` somewhere on your `PATH`.

**From source** (needs [Rust](https://rustup.rs)):

```bash
cargo install --git https://github.com/samchinmaya/komp
```

Then connect it to Claude Code:

```bash
claude mcp add --scope user komp -- komp serve
```

Copy some logs and ask Claude *"what's wrong in the logs I copied?"*.

> If macOS says the binary "cannot be opened" (only happens when you download
> the release file with a browser instead of the install script), run
> `xattr -d com.apple.quarantine ~/.local/bin/komp`.

## The idea

Pasting logs into Claude costs the full token price *before* any tool can help:
Claude reads everything you send. So комп never takes logs through the chat.
The engineer copies the logs, types "check the logs I copied", and Claude calls
комп, which reads the clipboard **itself**, on the laptop, and hands Claude only
the summary.

```
 engineer copies logs (Cmd+C)
          │
          ▼
┌──────────────────┐  JSON-RPC over stdin  ┌───────────────────────────┐
│  Claude Code     │ ────────────────────▶ │  komp serve               │
│  (MCP client)    │ ◀──────────────────── │   src/mcp.rs   protocol   │
└──────────────────┘     stdout            │   src/input.rs where logs │
                                           │                come from  │
                                           │   src/compress.rs  the    │
                                           │                compressor │
                                           └───────────────────────────┘
```

## What the output looks like

Input (7 lines):

```
2026-11-18T10:00:01.123Z INFO  [pod/api-7d9f-x2k4] GET /health 200 2ms
2026-11-18T10:00:02.456Z INFO  [pod/api-7d9f-x2k4] GET /health 200 1ms
2026-11-18T10:00:03.789Z INFO  [pod/api-7d9f-x2k4] GET /health 200 3ms
2026-11-18T10:00:04.012Z ERROR [pod/api-7d9f-x2k4] db connection refused: 10.0.3.17:5432
2026-11-18T10:00:05.334Z ERROR [pod/api-7d9f-x2k4] db connection refused: 10.0.3.17:5432
2026-11-18T10:00:06.901Z WARN  [pod/api-7d9f-x2k4] retrying in 4s (attempt 3/5)
2026-11-18T10:00:07.220Z INFO  [pod/api-7d9f-x2k4] GET /health 200 2ms
```

Output:

```
[komp] 7 lines → 3 entries · 2026-11-18 10:00:01–10:00:07 · [pod/api-7d9f-x2k4]
levels: ERROR 2 · WARN 1 · INFO 4
10:00:01–10:00:07 INFO  GET /health 200 1–3ms ×4
10:00:04–10:00:05 ERROR db connection refused: 10.0.3.17:5432 ×2
10:00:06 WARN  retrying in 4s (attempt 3/5)
```

## How the compressor works

`src/compress.rs` is a pipeline of five steps. It knows nothing about MCP or
the clipboard: text in, text out.

| step | what it does | example |
|---|---|---|
| **1. parse** | split into records: timestamp, level, message, stack-trace lines. Understands plain text, JSON (incl. pino), logfmt, klog, syslog | `2026-…Z ERROR db refused` → time `10:00:04`, level `ERROR`, message `db refused` |
| **2. hoist** | what *every* line shares moves into the header once | `[pod/api-7d9f-x2k4]`, `service=orders` |
| **3. templatize** | variable parts become slots | `GET /health 200 2ms` → `GET /health ␁ ␁` + values `200`, `2ms` |
| **4. group** | same level + same template → one group with count, time range, all slot values | 4 health checks → 1 group |
| **5. render** | one line per group; slot values summarised | `200` (one value), `1–3ms` (range), `{200\|503}` (few values), `{32+ distinct, e.g. 7432…}` (many IDs) |

Rules that keep the meaning:

- **Errors and warnings keep more detail**: up to 6 distinct values are listed, and their stack traces are kept.
- **Order survives**: every entry has its first–last time, so you can still see that the errors started at 10:04.
- **Bursts get their own line**: if a value only shows up during one stretch (`status=503` only during a database outage), it is split out with its own time range instead of hiding inside `status={200|503}`. Values spread evenly over the log stay merged.
- **Known boilerplate is dropped**: Spring Boot's process id and thread name (`1 --- [nio-8080-exec-3]`).
- **Exceptions join their error**: `ERROR request failed` followed by `java.lang.NullPointerException: …` (or a Python `ZeroDivisionError: …`) becomes one entry, `ERROR request failed → java.lang.NullPointerException: …`. Different exceptions stay separate entries.
- **Stack traces print once** per group, with runs of framework frames (Spring, Tomcat, `node_modules`…) folded into `… 12 framework frames`.
- **Nothing silently disappears**: if there are more than 80 patterns, the rarest low-severity ones are dropped and the output says how many lines were omitted.

## Use it

From the terminal:

```bash
komp                       # compress the clipboard
komp app.log               # compress a file
kubectl logs api | komp -  # compress stdin
```

For a whole team: commit this as `.mcp.json` in your repo and everyone who
opens it in Claude Code (with komp installed) gets the tools automatically:

```json
{ "mcpServers": { "komp": { "command": "komp", "args": ["serve"] } } }
```

### MCP tools

| tool | arguments | reads logs from |
|---|---|---|
| `compress_clipboard` | `max_entries?` | the clipboard |
| `compress_file` | `path`, `max_entries?` | a file |
| `compress_kubectl_logs` | `pod`, `namespace?`, `container?`, `since?`, `tail?`, `previous?`, `max_entries?` | `kubectl logs --timestamps` (current kube context) |

## Project layout

```
src/
  main.rs      the `komp` command: picks an input, prints the summary
  lib.rs       declares the three modules below
  compress.rs  the compressor (+ unit tests at the bottom)
  input.rs     clipboard, file, stdin, kubectl
  mcp.rs       the MCP server: JSON-RPC over stdio (+ protocol tests)
tests/
  fixtures/    realistic logs: Go/logfmt, Node/JSON, Java/Spring, kubelet/klog
  fixtures.rs  checks each is ≥95% smaller and still contains the key facts
brand/         logo, favicons, app icons
```

## Brand

The logo is just the name, **комп**, drawn as plain rounded strokes (no font
needed). The favicon and app icons use its first letter, **к**.
Colours: ink `#0F1419`, paper `#E8ECF1`.

| file | use |
|---|---|
| `logo-light.svg` / `logo-dark.svg` | the name, for light / dark backgrounds |
| `logo-vertical-light.svg` / `-dark.svg` | the name rotated, for narrow spaces |
| `icon.svg` | the к icon, source for the PNGs |
| `favicon.svg`, `favicon.ico`, `favicon-{16,32,48}.png` | browser tab icons |
| `apple-touch-icon.png`, `icon-{192,512}.png`, `site.webmanifest` | phone home screen / PWA |

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
```

## Develop

```bash
cargo test                 # unit tests + fixture tests
cargo build --release      # build target/release/komp
cargo install --path .     # install your local build as `komp`
```

Releases: push a tag like `v0.2.0`. The Release workflow builds macOS
(Apple Silicon + Intel), Linux (x86_64 + arm64, static musl) and Windows
binaries and attaches them to the GitHub release that `install.sh` reads.

## License

MIT
