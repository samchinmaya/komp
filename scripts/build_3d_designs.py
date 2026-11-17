"""Draw комп's isometric 3D illustrations into brand/3d/.

Run:  python3 scripts/build_3d_designs.py
"""
import pathlib, random, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from iso3d import Scene, shade, INK, PAPER, MUTED, GREEN, RED, AMBER, MONO, WORDMARK

OUT = pathlib.Path(__file__).resolve().parent.parent / "brand" / "3d"
OUT.mkdir(parents=True, exist_ok=True)
rnd = random.Random(7)

SHEET = "#2A333D"
LEVEL_SHEET = {"info": SHEET, "warn": "#5C4A1E", "error": "#5E262B"}
LEVEL_EDGE = {"info": "#3E4955", "warn": AMBER, "error": RED}


def text_lines(count, width, gap, rng=rnd, short=0.45):
    """Fake log text for a sheet's top face, in that face's local coordinates."""
    return "".join(f'<path d="M0 {j * gap}H{width * rng.uniform(short, 1):.1f}"/>' for j in range(count))


def log_stack(s, x, y, w, d, sheets, h=3.0, step=4.4, levels=None, lines=True):
    levels = levels or ["info"] * sheets
    for i, lvl in enumerate(levels[:sheets]):
        jitter = rnd.uniform(-2.2, 2.2)
        s.box(x + jitter, y - jitter, i * step + s_z(s), w, d, h, LEVEL_SHEET[lvl], edge=LEVEL_EDGE[lvl],
              top=shade(LEVEL_SHEET[lvl], 0.12))
    top_z = (sheets - 1) * step + h + s_z(s)
    if lines:
        s.on_top_face(x + w * 0.12, y + d * 0.14, top_z, 1, text_lines(7, w * 0.76, d * 0.11), color="#5B6573", sw=1.6)
    return top_z


def s_z(s):
    return getattr(s, "base_z", 0)


def ground_text(s, x, y, z, txt, size=6.5, color=MUTED):
    """Text lying flat on the ground, running along the world x axis."""
    from iso3d import C, S as SIN
    ex, ey = s.p(x, y, z)
    k = s.k
    s.items.append(f'<g transform="matrix({C * k:.4f} {SIN * k:.4f} {-C * k:.4f} {SIN * k:.4f} {ex:.1f} {ey:.1f})">'
                   f'<text font-family="{MONO}" font-size="{size}" letter-spacing="0.6" fill="{color}">{txt}</text></g>')


# ─────────────────────────── 1. architecture ───────────────────────────
def architecture():
    s = Scene(scale=2.0)
    s.box(-6, 0, -6, 360, 132, 6, "#161C23", edge="#222A33", top="#141A20")
    corners = [(4, 12, 0), (198, 12, 0), (198, 122, 0), (4, 122, 0), (4, 12, 0)]
    for a, b in zip(corners, corners[1:]):
        s.line3(a, b, "#3A4552", 1.4, dash="6 6")
    ground_text(s, 54, 119.5, 0, "YOUR MACHINE · RAW LOGS STAY HERE")

    # the flow runs along the front edge, where nothing hides it
    s.arrow((78, 100, 0.5), (110, 100, 0.5))
    s.arrow((168, 100, 0.5), (218, 100, 0.5))
    s.arrow((266, 100, 0.5), (294, 100, 0.5))

    levels = ["info"] * 6 + ["error", "warn", "error", "error", "info", "warn", "info", "error", "info", "info"]
    top = log_stack(s, 14, 34, 60, 60, 16, levels=levels)

    # комп: a light block with the wordmark on its front face
    s.box(114, 39, 0, 50, 50, 50, "#C9D0D9", edge="#F3F5F8", top="#EEF1F5")
    s.on_left_face(120.5, 89, 31, 0.27, WORDMARK, color=INK, sw=6)
    s.box(151, 42, 50, 7, 7, 2.2, GREEN, edge=GREEN, top=GREEN)

    # the summary: one thin green sheet with a few lines
    s.box(222, 44, 0, 40, 40, 3, "#1C5E43", edge=GREEN, top="#1F7A53")
    s.on_top_face(227, 50, 3, 1, text_lines(4, 30, 6, short=0.5), color="#BFF5D9", sw=1.8)

    # Claude Code: a dark terminal block with a prompt on its face
    s.box(298, 41, 0, 46, 46, 34, "#252D36", edge="#3E4955", top="#2E3740")
    s.on_left_face(302, 87, 26, 0.55, '<path d="M92 20L104 30L92 40M110 40H126"/>', color=GREEN, sw=4.5)

    s.label((44, 64, top), -30, -50, "2,001 log lines", "~76,000 tokens if pasted", align="end")
    s.label((139, 64, 52.2), 60, -120, "комп", "reads your clipboard, on your machine", align="start")
    s.label((242, 64, 3), 70, -96, "11-line summary", "~312 tokens", align="start")
    s.label((321, 64, 34), 40, -40, "Claude", "reads only the summary", align="start")
    return s.svg("How комп works: logs are compressed on your machine; only the summary reaches Claude",
                 caption="HOW КОМП WORKS")


# ─────────────────────────── 2. pipeline tower ───────────────────────────
def pipeline():
    s = Scene(scale=1.55)
    stages = [
        ("1 · parse", "timestamps, levels, stack traces"),
        ("2 · hoist", "shared fields → one header"),
        ("3 · templatize", "IDs, IPs, durations → slots"),
        ("4 · group", "same template → one line ×N"),
        ("5 · render", "ranges, counts, errors in full"),
    ]
    sheets = [16, 11, 7, 4, 1]
    pitch, size = 96, 70
    s.box(-12, -12, -6, pitch * len(stages) + 2, size + 44, 6, "#161C23", edge="#222A33", top="#141A20")
    for i, ((name, sub), n) in enumerate(zip(stages, sheets)):
        x = i * pitch
        s.box(x, 0, 0, size, size, 6, "#1E252D", edge="#2F3842", top="#232B34")
        s.base_z = 6
        if n == 1:
            s.box(x + 12, 12, 6, size - 24, size - 24, 3, "#1C5E43", edge=GREEN, top="#1F7A53")
            s.on_top_face(x + 17, 18, 9, 1, text_lines(4, size - 36, 7, short=0.5), color="#BFF5D9", sw=1.9)
            top = 9
        else:
            levels = [rnd.choice(["info"] * 5 + ["warn", "error"]) for _ in range(n - 1)] + ["info"]
            top = log_stack(s, x + 12, 12, size - 24, size - 24, n, h=2.6, step=4.2, levels=levels, lines=True)
        s.base_z = 0
        if i < len(stages) - 1:
            s.arrow((x + size + 3, size + 14, 0.5), (x + pitch - 3, size + 14, 0.5), color=GREEN, sw=1.8, head=7)
        bx, by = s.p(x + size / 2, size / 2, top)
        badge = GREEN if n == 1 else PAPER
        s.items.append(f'<circle cx="{bx:.1f}" cy="{by - 26:.1f}" r="13" fill="{INK}" stroke="{badge}" stroke-width="1.5"/>')
        s.text(bx, by - 21.5, str(i + 1), size=13, color=badge, align="middle", weight=700)
        s.ys.append(by - 42)
    kx, ky = s.p(pitch * 3.35, -12, 175)
    for i, (name, sub) in enumerate(stages):
        col = GREEN if i == len(stages) - 1 else PAPER
        s.text(kx, ky + i * 46, name, size=15, color=col, weight=600)
        s.text(kx, ky + i * 46 + 19, sub, size=12, color=MUTED)
    s.xs.append(kx + 260)
    return s.svg("The комп pipeline: five stages turn thousands of log lines into a short summary",
                 caption="INSIDE КОМП · 5 STAGES")


# ─────────────────────────── 3. token bars ───────────────────────────
def tokens():
    s = Scene(scale=1.6)
    data = [("Go outage", 75958, 312), ("Spring Boot", 41216, 196), ("Node.js", 59552, 314), ("kubelet", 39180, 315)]
    H, step = 230, 74
    s.box(-14, -14, -5, step * len(data) + 6, 92, 5, "#161C23", edge="#222A33", top="#141A20")
    later = []
    for i, (name, raw, out) in enumerate(data):
        x = i * step
        h_raw, h_out = H * raw / 76000, max(3, H * out / 76000)
        s.box(x, 0, 0, 26, 26, h_raw, "#2A333D", edge="#3E4955", top="#36404B")
        s.box(x, 36, 0, 26, 26, h_out, "#1C5E43", edge=GREEN, top=GREEN)
        later.append((s.p(x + 13, 13, h_raw), f"~{raw / 1000:.0f}k tokens", PAPER, -12))
        later.append((s.p(x + 26, 36, h_out), f"~{out}", GREEN, 4))
        ground_text(s, x - 4, 74, 0, name.upper(), size=6.5)
    for (px, py), txt, col, dy in later:
        green = col == GREEN
        s.text(px + (12 if green else 0), py + dy, txt, size=13, color=col,
               align="start" if green else "middle", weight=600)
    lx, ly = s.p(step * 2.6, -14, H * 0.95)
    s.items.append(f'<rect x="{lx:.1f}" y="{ly:.1f}" width="11" height="11" rx="2" fill="#36404B"/>')
    s.text(lx + 18, ly + 10, "logs pasted into Claude raw", size=12, color=PAPER)
    s.items.append(f'<rect x="{lx:.1f}" y="{ly + 22:.1f}" width="11" height="11" rx="2" fill="{GREEN}"/>')
    s.text(lx + 18, ly + 32, "комп summary · over 99% smaller", size=12, color=PAPER)
    s.xs += [lx + 290]
    return s.svg("Tokens Claude reads per log, raw versus комп summary", caption="TOKENS CLAUDE READS · RAW VS КОМП")


for name, fn in [("architecture", architecture), ("pipeline", pipeline), ("tokens", tokens)]:
    (OUT / f"{name}.svg").write_text(fn())
    print("wrote", OUT / f"{name}.svg")
