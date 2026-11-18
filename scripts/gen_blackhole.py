"""Render a dithered black hole for the комп website (plain Python, no dependencies).

The scene: a black shadow, a thin photon ring, the lensed far side of the
accretion disk arching over the top, a tilted disk in front (brighter on the
left, where it moves towards us) and a few stars. The brightness image is then
Floyd–Steinberg dithered to 1-bit and written as transparent PNGs, one per
colour, so pages can layer it over any background.

    python3 scripts/gen_blackhole.py
"""
import math, pathlib, random, struct, zlib

W, H = 560, 340          # rendered size; shown at 2x with pixelated scaling
CX, CY = W / 2, H * 0.5
R = H * 0.2              # shadow radius in pixels
OUT = pathlib.Path(__file__).resolve().parent.parent / "web" / "public"
COLORS = {"paper": (232, 236, 241), "signal": (62, 224, 143), "ink": (15, 20, 25)}

rnd = random.Random(7)
stars = {(rnd.randrange(W), rnd.randrange(H)): rnd.uniform(0.55, 1.0) for _ in range(150)}


def brightness(px: int, py: int) -> float:
    x, y = (px - CX) / R, (py - CY) / R
    r = math.hypot(x, y)
    a = math.atan2(y, x)

    # Thin bright photon ring just outside the shadow.
    ring = 1.15 * math.exp(-(((r - 1.07) / 0.045) ** 2))

    # Lensed image of the disk's far side: an arc over the top, a fainter one below.
    top = max(0.0, -y / r) if r else 0.0
    halo = math.exp(-(((r - 1.3) / 0.2) ** 2)) * (0.1 + 1.0 * top ** 1.2)
    halo *= 0.85 + 0.15 * math.sin(14 * r + 5 * a)

    # Tilted accretion disk: an ellipse squashed vertically.
    re = math.hypot(x, y / 0.14)
    disk = 0.0
    if 1.4 < re < 4.2:
        disk = 1.7 * math.exp(-(re - 1.4) * 1.15)
        disk *= 0.7 + 0.3 * math.sin(22 * re + 2.5 * math.atan2(y / 0.14, x))   # streaks
        disk *= 1 + 0.65 * (-x / re)                                             # Doppler beaming
        disk *= min(1.0, (4.2 - re) / 0.9) * min(1.0, (re - 1.4) / 0.08)        # soft edges
        if y < 0 and r < 1.03:                                                   # far side hidden behind the hole
            disk = 0.0

    if r < 1.0 and disk == 0.0:
        return 0.0                                                               # the shadow itself
    glow = 0.16 * math.exp(-max(0.0, r - 1.0) * 3.0)
    return min(1.0, ring + halo + disk + glow + stars.get((px, py), 0.0))


def dither(img: list[list[float]]) -> list[list[bool]]:
    """Floyd–Steinberg error diffusion to on/off pixels."""
    out = [[False] * W for _ in range(H)]
    for y in range(H):
        row, nxt = img[y], img[y + 1] if y + 1 < H else None
        for x in range(W):
            old = row[x]
            on = old >= 0.5
            out[y][x] = on
            err = old - (1.0 if on else 0.0)
            if x + 1 < W:
                row[x + 1] += err * 7 / 16
            if nxt:
                if x > 0:
                    nxt[x - 1] += err * 3 / 16
                nxt[x] += err * 5 / 16
                if x + 1 < W:
                    nxt[x + 1] += err * 1 / 16
    return out


def write_png(path: pathlib.Path, bits: list[list[bool]], rgb: tuple[int, int, int]) -> None:
    on = bytes([*rgb, 255])
    off = b"\x00\x00\x00\x00"
    raw = b"".join(b"\x00" + b"".join(on if b else off for b in row) for row in bits)

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    image = [[brightness(x, y) ** 0.9 for x in range(W)] for y in range(H)]
    bits = dither(image)
    OUT.mkdir(parents=True, exist_ok=True)
    for name, rgb in COLORS.items():
        path = OUT / f"blackhole-{name}.png"
        write_png(path, bits, rgb)
        print(path.relative_to(OUT.parent.parent), path.stat().st_size, "bytes")
