#!/usr/bin/env python3
"""Benchmark the release komp binary and write web/src/data/benchmarks.json.

Each run starts a fresh process on a log file with output discarded. Time is
wall-clock; CPU and peak memory come from the kernel's rusage for that process.
Reported values are medians.

Usage: cargo build --release && python3 scripts/benchmark.py
"""
import json
import os
import platform
import statistics
import subprocess
import tempfile
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KOMP = ROOT / "target" / "release" / "komp"
FIXTURES = ROOT / "tests" / "fixtures"
OUT = ROOT / "web" / "src" / "data" / "benchmarks.json"
LOGS = [
    ("go", "Go", "go-logfmt-db-outage.log"),
    ("java", "Spring Boot", "java-spring-npe.log"),
    ("node", "Node.js", "node-json-payments.log"),
    ("k8s", "kubelet", "kubelet-crashloop.log"),
]
RUNS = 41
SCALE_RUNS = 15
SCALES = [1, 2, 5, 10, 25, 50]
MB = 1024 * 1024


def sysctl(name):
    return subprocess.run(["sysctl", "-n", name], capture_output=True, text=True, check=True).stdout.strip()


def run_once(path):
    with open(os.devnull, "wb") as sink:
        start = time.perf_counter()
        process = subprocess.Popen([str(KOMP), str(path)], stdout=sink, stderr=sink)
        _, status, usage = os.wait4(process.pid, 0)
        elapsed = time.perf_counter() - start
    process.returncode = os.waitstatus_to_exitcode(status)
    if process.returncode != 0:
        raise SystemExit(f"komp failed on {path}: exit {process.returncode}")
    # macOS reports ru_maxrss in bytes.
    return elapsed * 1000, (usage.ru_utime + usage.ru_stime) * 1000, usage.ru_maxrss / MB


def measure(path, runs):
    samples = [run_once(path) for _ in range(runs)]
    wall, cpu, memory = zip(*samples)
    return statistics.median(wall), statistics.median(cpu), statistics.median(memory)


def main():
    if platform.system() != "Darwin":
        raise SystemExit("this script reads macOS system details")
    if not KOMP.exists():
        raise SystemExit("build first: cargo build --release")
    memory_bytes = int(sysctl("hw.memsize"))
    system_mb = memory_bytes / MB

    logs = []
    for key, label, name in LOGS:
        path = FIXTURES / name
        data = path.read_bytes()
        wall, cpu, memory = measure(path, RUNS)
        logs.append({
            "key": key,
            "label": label,
            "lines": data.count(b"\n"),
            "sizeMB": round(len(data) / MB, 3),
            "ms": round(wall, 2),
            "cpuMs": round(cpu, 2),
            "memoryMB": round(memory, 2),
            "memoryShare": round(100 * memory / system_mb, 3),
            "mbPerSecond": round(len(data) / MB / (wall / 1000), 1),
        })

    base = (FIXTURES / LOGS[0][2]).read_bytes()
    scale = []
    with tempfile.TemporaryDirectory(prefix="komp-benchmark-") as folder:
        for factor in SCALES:
            path = Path(folder) / f"log-{factor}.log"
            path.write_bytes(base * factor)
            wall, cpu, memory = measure(path, SCALE_RUNS)
            scale.append({
                "lines": base.count(b"\n") * factor,
                "sizeMB": round(len(base) * factor / MB, 2),
                "ms": round(wall, 2),
                "cpuMs": round(cpu, 2),
                "memoryMB": round(memory, 2),
                "memoryShare": round(100 * memory / system_mb, 3),
            })

    OUT.write_text(json.dumps({
        "recorded": date.today().isoformat(),
        "runs": RUNS,
        "scaleRuns": SCALE_RUNS,
        "binaryMB": round(KOMP.stat().st_size / MB, 2),
        "system": {
            "chip": sysctl("machdep.cpu.brand_string"),
            "cores": int(sysctl("hw.ncpu")),
            "memoryGB": round(memory_bytes / 1024**3),
            "os": f"macOS {platform.mac_ver()[0]}",
            "arch": platform.machine(),
        },
        "logs": logs,
        "scale": scale,
    }, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
