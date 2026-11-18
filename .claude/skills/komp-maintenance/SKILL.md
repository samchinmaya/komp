---
name: komp-maintenance
description: Use when changing the komp compressor, MCP server, benchmarks, website data or release process in this repository. Covers the checks to run and the generated files to refresh.
---

# Maintaining komp

komp has a Rust crate at the repository root and a Next.js site in the `web` npm workspace.

## After changing Rust code

```bash
cargo test --locked
cargo build --release
```

If compressor output or speed changed, refresh everything generated from the binary:

```bash
python3 scripts/build_site_demo.py
python3 scripts/compare.py
python3 scripts/benchmark.py
```

Then update any numbers written by hand in `README.md` and `web/src/data/site.ts`.
`scripts/benchmark.py` runs on macOS, and its results describe the machine it ran on.

Do not change `web/src/data/evidence.json` by hand. It is a recording of a real Claude Code
run made by `scripts/record_claude_demo.py`, and the page says which komp version it used.

## After changing the website

Read `web/AGENTS.md` before writing Next.js code. From the repository root:

```bash
npm ci
npm run lint
PAGES_BASE_PATH=/komp npm run build
```

Check desktop and phone widths. Keep claims tied to measured data, and say when a result comes
from the repository's test logs or from one machine.

## Rules

- Do not change the комп logo, wordmark, favicons or social images unless the maintainer asks.
- The privacy check in `src/guard.rs` runs before compression and again on the summary. Keep both.
- Pushing `master` deploys the website. Installers use the latest GitHub release, so compressor
  changes reach users only after a new `v*` tag.

## Commit messages

Use Conventional Commits with a context and a bullet list. The
[commit-message skill](https://github.com/rshdhere/commit-message-skill) can be installed for
this if you want the full rules.
