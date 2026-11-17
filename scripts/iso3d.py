"""Tiny isometric (3D) SVG drawing kit for комп's illustrations.

World axes: x goes right-down, y goes left-down, z goes up.
Three faces of a box are visible: top, left (the y = max face) and right (the x = max face).
"""
import math

C, S = math.cos(math.radians(30)), math.sin(math.radians(30))
INK, PAPER, MUTED = "#0F1419", "#E8ECF1", "#8B95A3"
GREEN, RED, AMBER = "#3EE08F", "#FF6B6B", "#F5B83D"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

# The комп wordmark, as drawn in brand/logo-*.svg (viewBox 82 12 138 40).
WORDMARK = ('<path d="M88 18V46M90 32L104 18M90 32L105 46"/><ellipse cx="132" cy="32" rx="13" ry="14"/>'
            '<path d="M158 46V18L169 38L180 18V46"/><path d="M194 46V18H214V46"/>')


def shade(hex_color, k):
    """Lighten (k > 0) or darken (k < 0) a colour."""
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    t = 255 if k > 0 else 0
    k = abs(k)
    return "#%02X%02X%02X" % tuple(round(v + (t - v) * k) for v in (r, g, b))


class Scene:
    def __init__(self, scale=1.0):
        self.k = scale
        self.items = []          # (svg string)
        self.xs, self.ys = [], []

    def p(self, x, y, z):
        sx, sy = (x - y) * C * self.k, ((x + y) * S - z) * self.k
        self.xs.append(sx)
        self.ys.append(sy)
        return sx, sy

    def poly(self, pts, fill, stroke=None, sw=1, extra=""):
        d = " ".join("%.1f,%.1f" % self.p(*q) for q in pts)
        st = f' stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"' if stroke else ""
        self.items.append(f'<polygon points="{d}" fill="{fill}"{st} {extra}/>')

    def box(self, x, y, z, w, d, h, color, edge=None, top=None):
        """A solid box; top/left/right faces are shaded from one base colour."""
        top = top or shade(color, 0.18)
        left, right = color, shade(color, -0.22)
        e = edge or shade(color, 0.32)
        self.poly([(x, y + d, z), (x + w, y + d, z), (x + w, y + d, z + h), (x, y + d, z + h)], left, e, 0.8)
        self.poly([(x + w, y, z), (x + w, y + d, z), (x + w, y + d, z + h), (x + w, y, z + h)], right, e, 0.8)
        self.poly([(x, y, z + h), (x + w, y, z + h), (x + w, y + d, z + h), (x, y + d, z + h)], top, e, 0.8)

    def line3(self, a, b, color, sw=1.5, dash=None, cap="round"):
        (x1, y1), (x2, y2) = self.p(*a), self.p(*b)
        ds = f' stroke-dasharray="{dash}"' if dash else ""
        self.items.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                          f'stroke="{color}" stroke-width="{sw}" stroke-linecap="{cap}"{ds}/>')

    def arrow(self, a, b, color=GREEN, sw=2.2, head=9):
        """A line from a to b with an arrowhead drawn in screen space."""
        self.line3(a, b, color, sw)
        (x1, y1), (x2, y2) = self.p(*a), self.p(*b)
        ang = math.atan2(y2 - y1, x2 - x1)
        pts = [(x2, y2)] + [(x2 - head * math.cos(ang + s * 0.45), y2 - head * math.sin(ang + s * 0.45)) for s in (1, -1)]
        self.items.append('<polygon points="%s" fill="%s"/>' % (" ".join("%.1f,%.1f" % q for q in pts), color))

    def on_left_face(self, x, y_face, z_top, unit, svg, color=INK, sw=5.5):
        """Draw `svg` (wordmark coordinates, origin 82,12) flat on a left (y = max) face."""
        ex, ey = self.p(x, y_face, z_top)
        a, b, d = C * unit * self.k, S * unit * self.k, unit * self.k
        self.items.append(f'<g transform="matrix({a:.4f} {b:.4f} 0 {d:.4f} {ex:.1f} {ey:.1f}) translate(-82 -12)" '
                          f'fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" '
                          f'stroke-linejoin="round">{svg}</g>')

    def on_top_face(self, x, y, z, unit, svg, color=PAPER, sw=2):
        """Draw `svg` (local coords, origin 0,0: +x along world x, +y along world y) flat on a top face."""
        ex, ey = self.p(x, y, z)
        k = unit * self.k
        self.items.append(f'<g transform="matrix({C * k:.4f} {S * k:.4f} {-C * k:.4f} {S * k:.4f} {ex:.1f} {ey:.1f})" '
                          f'fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round">{svg}</g>')

    def label(self, anchor3, dx, dy, title, sub=None, align="start", leader=True, color=PAPER):
        ax, ay = self.p(*anchor3)
        tx, ty = ax + dx, ay + dy
        if leader:
            self.items.append(f'<path d="M{ax:.1f} {ay:.1f}L{tx:.1f} {ty + (4 if dy < 0 else -14):.1f}" '
                              f'stroke="{MUTED}" stroke-width="1" fill="none" stroke-dasharray="2 3"/>')
            self.items.append(f'<circle cx="{ax:.1f}" cy="{ay:.1f}" r="2.5" fill="{MUTED}"/>')
        self.items.append(f'<text x="{tx:.1f}" y="{ty:.1f}" text-anchor="{align}" font-family="{MONO}" '
                          f'font-size="15" font-weight="600" fill="{color}">{title}</text>')
        if sub:
            self.items.append(f'<text x="{tx:.1f}" y="{ty + 19:.1f}" text-anchor="{align}" font-family="{MONO}" '
                              f'font-size="12" fill="{MUTED}">{sub}</text>')
        self.xs += [tx - 230 if align == "end" else tx, tx + (0 if align == "end" else 230)]
        self.ys += [ty - 16, ty + 26]

    def text(self, x, y, s, size=12, color=MUTED, align="start", weight=400):
        self.items.append(f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="{align}" font-family="{MONO}" '
                          f'font-size="{size}" font-weight="{weight}" fill="{color}">{s}</text>')

    def svg(self, title, caption=None, pad=36, bg=INK, min_width=0):
        x0, x1 = min(self.xs) - pad, max(self.xs) + pad
        y0, y1 = min(self.ys) - pad - (34 if caption else 0), max(self.ys) + pad
        w, h = x1 - x0, y1 - y0
        if w < min_width:
            x0 -= (min_width - w) / 2
            w = min_width
        cap = ""
        if caption:
            cap = (f'<text x="{x0 + pad:.1f}" y="{y0 + pad + 4:.1f}" font-family="{MONO}" font-size="13" '
                   f'letter-spacing="0.08em" fill="{MUTED}">{caption}</text>')
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.0f} {y0:.0f} {w:.0f} {h:.0f}" '
                f'width="{w:.0f}" height="{h:.0f}" role="img">\n<title>{title}</title>\n'
                f'<rect x="{x0:.0f}" y="{y0:.0f}" width="{w:.0f}" height="{h:.0f}" rx="24" fill="{bg}"/>\n'
                + cap + "\n" + "\n".join(self.items) + "\n</svg>\n")
