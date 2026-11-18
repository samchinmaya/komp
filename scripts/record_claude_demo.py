#!/usr/bin/env python3
"""Capture a real Claude Code session that uses komp, for the website.

Runs `claude -p` in an empty folder holding one test log. The only tool Claude
gets is komp's compress_file, and komp runs inside the macOS sandbox with all
networking denied. The prompt, tool call, tool result and answer are stored
as they came back, in web/src/data/evidence.json.

Usage: python3 scripts/record_claude_demo.py   (after cargo build --release)
"""
import json
import os
import platform
import shutil
import subprocess
import tempfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KOMP = ROOT / "target" / "release" / "komp"
LOG = ROOT / "tests" / "fixtures" / "go-logfmt-db-outage.log"
OUT = ROOT / "web" / "src" / "data" / "evidence.json"
NO_NETWORK = "(version 1)(allow default)(deny network*)"
TOOL = "mcp__komp__compress_file"
PROMPT = "orders went down. check outage.log with komp and tell me why, in two short sentences"


def main():
    with tempfile.TemporaryDirectory(prefix="komp-evidence-") as tmp:
        work = Path(tmp).resolve()
        shutil.copy(LOG, work / "outage.log")
        config = work / "mcp.json"
        config.write_text(json.dumps({"mcpServers": {"komp": {
            "command": "/usr/bin/sandbox-exec",
            "args": ["-p", NO_NETWORK, str(KOMP), "serve"],
        }}}))
        env = {**os.environ, "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"}
        run = subprocess.run(
            ["claude", "-p", PROMPT, "--model", "sonnet", "--output-format", "stream-json", "--verbose",
             "--strict-mcp-config", "--mcp-config", str(config), "--setting-sources", "project",
             "--tools", "", "--allowedTools", TOOL, "--no-session-persistence", "--max-budget-usd", "1"],
            cwd=work, env=env, capture_output=True, text=True, timeout=240,
        )
    events = [json.loads(line) for line in run.stdout.splitlines() if line.startswith("{")]
    if run.returncode != 0 and not events:
        raise SystemExit(run.stderr[-800:] or "claude failed")

    call = result = answer = model = None
    for event in events:
        message = event.get("message") or {}
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if block.get("type") == "tool_use" and block.get("name") == TOOL and call is None:
                call, model = block, message.get("model")
            elif block.get("type") == "tool_result" and call and block.get("tool_use_id") == call["id"]:
                body = block.get("content")
                result = "".join(b.get("text", "") for b in body) if isinstance(body, list) else body
            elif block.get("type") == "text" and result is not None and event.get("type") == "assistant":
                answer = block["text"].strip()
    if not (call and result and answer):
        raise SystemExit("Claude did not complete the komp call:\n" + run.stdout[-1500:])

    raw = LOG.read_text().splitlines()
    OUT.write_text(json.dumps({
        "recorded": date.today().isoformat(),
        "system": f"macOS {platform.mac_ver()[0]} · {platform.machine()}",
        "claudeCode": subprocess.run(["claude", "--version"], capture_output=True, text=True).stdout.split()[0],
        "model": model,
        "prompt": PROMPT,
        "tool": "compress_file",
        "input": call["input"],
        "result": result,
        "answer": answer,
        "rawLines": len(raw),
        "rawPreview": raw[:40],
    }, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
