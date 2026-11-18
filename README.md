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

**Website:** https://samchinmaya.github.io/komp

Compress DevOps and Kubernetes logs into a short, meaningful summary, so Claude
spends a few hundred tokens reading them instead of tens of thousands.

```
2,001 lines of Go service logs   ~76,000 tokens  →  12 lines   ~340 tokens
1,350 lines of Spring Boot logs  ~41,000 tokens  →   9 lines   ~220 tokens
1,200 lines of Node JSON logs    ~60,000 tokens  →  10 lines   ~300 tokens
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
                                           │   src/guard.rs privacy   │
                                           │                check      │
                                           │   src/compress.rs  the    │
                                           │                compressor │
                                           └───────────────────────────┘
```

### Privacy check

Before anything is returned to Claude, комп checks the text on your machine:

1. **Is it logs?** Clipboard text or a file that does not look like logs is refused,
   and none of it is shared. A copied password, a `.env` file or an SSH key stops here.
2. **Remove sensitive values.** API keys, tokens, passwords, cookies, private keys,
   credentials in URLs, emails, card numbers, phone numbers and public IP addresses
   become markers such as `[redacted:secret]`. Private IPs stay, because they are often
   the clue in an outage.
3. **Compress, then check the summary again.** The result ends with a line saying what
   was removed.

This is pattern matching, so it greatly reduces the risk but cannot recognise every
secret.

Text pasted straight into the chat does not go through комп. To stop pasted logs when you
press Enter, add `komp hook` as a Claude Code `UserPromptSubmit` hook in
`~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "komp hook", "timeout": 5 }] }
    ]
  }
}
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
[komp] 7 lines → 3 templates, 3 entries · 2026-11-18 10:00:01–10:00:07 · [pod/api-7d9f-x2k4]
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
| **3. mine** | [Drain](https://github.com/logpai/Drain3)-style template mining in `src/drain.rs`: whitespace tokens, masks for IDs, IPs, hex and numbers, a fixed-depth tree and a similarity check. Compact punctuation-heavy lines are split by character class | `user alice logged in`, `user bob logged in` → one template |
| **4. group** | tokens that differ inside a template become slots, with count, time range and all slot values | `status=200`, `status=503` → `status=␁` |
| **5. render** | template and entry counts, one line per group, slot summaries, and a real sample when an important line's values were abbreviated | `200` (one value), `1–3ms` (range), `{200\|503}` (few values), `{32+ distinct, e.g. 7432…}` (many IDs) |

Ordinary lines use Drain3's default similarity threshold of 0.4. Warnings and errors use
0.7, so different failures that merely start the same way stay separate.

Rules that keep the meaning:

- **Errors and warnings keep more detail**: up to 6 distinct values are listed, and their stack traces are kept.
- **Order survives**: every entry has its first–last time, so you can still see that the errors started at 10:04.
- **Bursts get their own line**: if a value only shows up during one stretch (`status=503` only during a database outage), it is split out with its own time range instead of hiding inside `status={200|503}`. Values spread evenly over the log stay merged.
- **Known boilerplate is dropped**: Spring Boot's process id and thread name (`1 --- [nio-8080-exec-3]`).
- **Exceptions join their error**: `ERROR request failed` followed by `java.lang.NullPointerException: …` (or a Python `ZeroDivisionError: …`) becomes one entry, `ERROR request failed → java.lang.NullPointerException: …`. Different exceptions stay separate entries.
- **Stack traces print once** per group, with runs of framework frames (Spring, Tomcat, `node_modules`…) folded into `… 12 framework frames`.
- **Nothing silently disappears**: if there are more than 80 patterns, the rarest low-severity ones are dropped and the output says how many lines were omitted.

## Benchmarks

Measured with `scripts/benchmark.py` and `scripts/compare.py` on an Apple M5 Mac with 16 GB of
memory while other apps were running. Each time and memory figure is a median. Results will
differ on other machines.

| test log | lines | time | peak memory | tokens before → after |
|---|---:|---:|---:|---:|
| Go | 2,001 | 27 ms | 15.8 MB | ~75,958 → ~344 |
| Spring Boot | 1,350 | 20 ms | 15.7 MB | ~41,216 → ~220 |
| Node.js | 1,200 | 21 ms | 14.0 MB | ~59,552 → ~295 |
| kubelet | 700 | 20 ms | 14.9 MB | ~39,180 → ~318 |

Repeating the Go log to 100,050 lines (14.5 MB) took 632 ms and 131.5 MB of peak memory, 0.80%
of system memory.

Across all four logs, against common shell shortcuts:

| method | tokens | facts kept |
|---|---:|---:|
| the whole log | ~215,906 | 14 of 14 |
| `sort \| uniq -c` | ~212,899 | 14 of 14 |
| `grep` for errors and warnings | ~35,083 | 9 of 14 |
| `tail -n 100` | ~17,259 | 10 of 14 |
| комп | ~1,177 | 14 of 14 |

Tokens are estimated at about 4 characters each. The facts come from komp's own tests, and komp
was built against these logs, so expect smaller gaps on other logs.

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
  lib.rs       declares the modules below
  compress.rs  the compressor (+ unit tests at the bottom)
  drain.rs     Drain template mining, tokenizing and masks
  input.rs     clipboard, file, stdin, kubectl
  mcp.rs       the MCP server: JSON-RPC over stdio (+ protocol tests)
tests/
  fixtures/    realistic logs: Go/logfmt, Node/JSON, Java/Spring, kubelet/klog
  fixtures.rs  checks each is ≥95% smaller and still contains the key facts
brand/         logo, favicons, app icons
web/           the website (Next.js + Tailwind), a Turborepo workspace deployed to GitHub Pages
scripts/       benchmarks, comparison and demo data, plus image generators for the site
.claude/       the maintenance skill for working on this repository
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

npm ci                     # install the website workspace
npm run dev                # run the website through Turborepo
npm run lint               # lint the website
npm run build              # build the website
```

Releases: push a tag like `v0.2.0`. The Release workflow builds macOS
(Apple Silicon + Intel), Linux (x86_64 + arm64, static musl) and Windows
binaries and attaches them to the GitHub release that `install.sh` reads.

## License

MIT
