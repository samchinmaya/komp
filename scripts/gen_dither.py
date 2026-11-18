"""Ordered (Bayer) dither textures for the комп website. Plain Python, no dependencies.

  web/public/dither-plate.png        diagonal ramp in deep green: a dithered gradient plate.

    python3 scripts/gen_dither.py
"""
import pathlib, struct, zlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "web" / "public"


def bayer(n: int) -> list[list[int]]:
    """n×n Bayer threshold matrix (n a power of two), values 0..n*n-1."""
    m = [[0]]
    while len(m) < n:
        s = len(m)
        m = [[4 * m[y % s][x % s] + [[0, 2], [3, 1]][y // s][x // s] for x in range(2 * s)] for y in range(2 * s)]
    return m


B8 = bayer(8)


def render(w: int, h: int, block: int, density, rgb: tuple[int, int, int]) -> bytes:
    """1-bit ordered dither of `density(cx, cy)` (0..1) with block×block pixel dots."""
    on, off = bytes([*rgb, 255]), b"\x00\x00\x00\x00"
    cw, ch = w // block, h // block
    rows = []
    for y in range(h):
        cy = y // block
        row = bytearray()
        for x in range(w):
            cx = x // block
            threshold = (B8[cy % 8][cx % 8] + 0.5) / 64
            row += on if density(cx / max(1, cw - 1), cy / max(1, ch - 1)) > threshold else off
        rows.append(b"\x00" + bytes(row))
    raw = b"".join(rows)

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def smooth(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    files = {
        # "dither art gradient" plate: dense in the lower left, dissolving to the upper right.
        "dither-plate.png": render(1200, 480, 4, lambda u, v: smooth(1.15 - ((1 - v) * 0.75 + u * 0.95)), (15, 122, 71)),
    }
    for name, data in files.items():
        (OUT / name).write_bytes(data)
        print(f"web/public/{name}", len(data), "bytes")
