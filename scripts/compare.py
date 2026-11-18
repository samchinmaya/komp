#!/usr/bin/env python3
"""Compare komp with common shell shortcuts and write web/src/data/comparison.json.

Every method runs on the four test logs. Tokens are estimated the way komp
estimates them: characters / 4, rounded up per log. A fact counts as kept when
one of its accepted spellings appears in the output.

The facts come from tests/fixtures.rs, so they favour komp: it was built against
these logs. The website says so next to the results.

Usage: cargo build --release && python3 scripts/compare.py
"""
import json
import math
import os
import subprocess
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KOMP = ROOT / "target" / "release" / "komp"
FIXTURES = ROOT / "tests" / "fixtures"
OUT = ROOT / "web" / "src" / "data" / "comparison.json"
ENV = {**os.environ, "LC_ALL": "C"}

METHODS = [
    ("raw", "the whole log", ["cat", "{log}"]),
    ("uniq", "sort | uniq -c", ["sh", "-c", 'sort "$0" | uniq -c', "{log}"]),
    ("grep", "grep errors and warnings", ["grep", "-E", "-i", "error|warn|fatal|exception", "{log}"]),
    ("tail", "tail -n 100", ["tail", "-n", "100", "{log}"]),
    ("komp", "комп", [str(KOMP), "{log}"]),
]

# (log label, file, [(fact shown on the site, accepted spellings)])
LOGS = [
    ("Go", "go-logfmt-db-outage.log", [
        ("database connection refused", ["connection refused"]),
        ("final fatal error", ["giving up"]),
        ("503 responses during the outage", ["status=503"]),
        ("retry attempts", ["attempt=1/5", "attempt={1|2|3|4|5}/5"]),
        ("time the outage began", ["10:04:06"]),
    ]),
    ("Spring Boot", "java-spring-npe.log", [
        ("NullPointerException", ["NullPointerException"]),
        ("line of code that failed", ["ShippingService.java:57"]),
    ]),
    ("kubelet", "kubelet-crashloop.log", [
        ("CrashLoopBackOff", ["CrashLoopBackOff"]),
        ("failed health probe", ["Probe failed"]),
        ("probe connection refused", ["connection refused"]),
    ]),
    ("Node.js", "node-json-payments.log", [
        ("failed charge", ["charge failed"]),
        ("card declined message", ["card was declined"]),
        ("line of code that failed", ["charge.js:88"]),
        ("fraud-check upstream", ["fraud-check"]),
    ]),
]


def output(command, path):
    args = [str(path) if part == "{log}" else part for part in command]
    # grep exits 1 when nothing matches, which is a valid (empty) result.
    done = subprocess.run(args, capture_output=True, env=ENV)
    if done.returncode not in (0, 1):
        raise SystemExit(f"{args[0]} failed on {path.name}: exit {done.returncode}")
    return done.stdout.decode("utf-8", "replace")


def main():
    if not KOMP.exists():
        raise SystemExit("build first: cargo build --release")

    tokens = {key: 0 for key, _, _ in METHODS}
    kept = {key: 0 for key, _, _ in METHODS}
    facts = []
    for label, name, log_facts in LOGS:
        path = FIXTURES / name
        outputs = {key: output(command, path) for key, _, command in METHODS}
        for key, text in outputs.items():
            # komp counts its summary without the newline its CLI prints after it.
            counted = text.removesuffix("\n") if key == "komp" else text
            tokens[key] += math.ceil(len(counted) / 4)
        for fact, spellings in log_facts:
            found = {key: any(s in text for s in spellings) for key, text in outputs.items()}
            for key, present in found.items():
                kept[key] += present
            facts.append({"log": label, "fact": fact, "kept": found})

    OUT.write_text(json.dumps({
        "recorded": date.today().isoformat(),
        "factCount": len(facts),
        "methods": [
            {"key": key, "label": label, "tokens": tokens[key], "kept": kept[key]}
            for key, label, _ in METHODS
        ],
        "facts": facts,
    }, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {OUT}")
    for key, label, _ in METHODS:
        print(f"{label:28} {tokens[key]:>8,} tokens  {kept[key]}/{len(facts)} facts")


if __name__ == "__main__":
    main()
