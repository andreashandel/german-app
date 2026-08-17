# Generates the pretzel mark: PNG app icons (PIL) and an SVG path (for the
# in-app logo). Both come from the same geometry so they cannot drift apart.
import math, os
from PIL import Image, ImageDraw

W = 512.0                      # design space
BELLY_C = (256.0, 335.0)       # centre of the bottom loop
BELLY_R = 138.0
BELLY_A0, BELLY_A1 = 210.0, -30.0   # degrees, y-down; 90 = bottom

# Each arm is two cubics: one rising up the outside and over the top, one
# sweeping back down across the middle. Only the second halves cross, giving
# the single central X of a Brezel and leaving both upper holes open.
LEFT_ARM = [
    [(136.5, 266.0), (94.0, 192.0), (102.0, 104.0), (172.0, 90.0)],
    [(172.0, 90.0), (228.0, 126.0), (290.0, 178.0), (352.0, 246.0)],
]
RIGHT_ARM = [
    [(375.5, 266.0), (418.0, 192.0), (410.0, 104.0), (340.0, 90.0)],
    [(340.0, 90.0), (284.0, 126.0), (222.0, 178.0), (160.0, 246.0)],
]

BG      = (31, 111, 92)
DOUGH   = (231, 169, 63)
CRUST   = (150, 88, 26)
SALT    = (255, 250, 240)

SALT_SPOTS = []  # filled in from the path itself


def arc_point(a_deg):
    a = math.radians(a_deg)
    return (BELLY_C[0] + BELLY_R * math.cos(a), BELLY_C[1] + BELLY_R * math.sin(a))


def arc_to_cubics(a0, a1, segments=3):
    """Circular arc as cubic Beziers (exact enough well under 90 deg/segment)."""
    out = []
    step = (a1 - a0) / segments
    for i in range(segments):
        a, b = math.radians(a0 + i * step), math.radians(a0 + (i + 1) * step)
        k = (4.0 / 3.0) * math.tan((b - a) / 4.0)
        p0 = (BELLY_C[0] + BELLY_R * math.cos(a), BELLY_C[1] + BELLY_R * math.sin(a))
        p3 = (BELLY_C[0] + BELLY_R * math.cos(b), BELLY_C[1] + BELLY_R * math.sin(b))
        p1 = (p0[0] - BELLY_R * k * math.sin(a), p0[1] + BELLY_R * k * math.cos(a))
        p2 = (p3[0] + BELLY_R * k * math.sin(b), p3[1] - BELLY_R * k * math.cos(b))
        out.append([p0, p1, p2, p3])
    return out


def bez(p, t):
    u = 1 - t
    return (u*u*u*p[0][0] + 3*u*u*t*p[1][0] + 3*u*t*t*p[2][0] + t*t*t*p[3][0],
            u*u*u*p[0][1] + 3*u*u*t*p[1][1] + 3*u*t*t*p[2][1] + t*t*t*p[3][1])


def sample(n=120):
    """Every stroke of the pretzel as lists of points."""
    strokes = []
    belly = []
    for seg in arc_to_cubics(BELLY_A0, BELLY_A1):
        belly += [bez(seg, i / n) for i in range(n + 1)]
    strokes.append(belly)
    for arm in (LEFT_ARM, RIGHT_ARM):
        pts = []
        for seg in arm:
            pts += [bez(seg, i / n) for i in range(n + 1)]
        strokes.append(pts)
    return strokes


def stamp(draw, strokes, radius, colour, scale, offset, shift=(0.0, 0.0)):
    for pts in strokes:
        for (x, y) in pts:
            cx = (x + shift[0]) * scale + offset
            cy = (y + shift[1]) * scale + offset
            draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=colour)


def render(size, inset=0.0, bg=BG, ss=4):
    """inset: fraction of the canvas kept clear around the mark (maskable)."""
    big = int(size * ss)
    img = Image.new("RGBA", (big, big), bg + (255,))
    draw = ImageDraw.Draw(img)

    usable = big * (1.0 - 2 * inset)
    scale = usable / W
    offset = big * inset

    strokes = sample()
    rope = 23.0 * scale          # half-width of the dough
    edge = rope + 6.0 * scale    # crust outline

    stamp(draw, strokes, edge, CRUST + (255,), scale, offset)
    stamp(draw, strokes, rope, DOUGH + (255,), scale, offset)

    # Below favicon size the grains stop reading as salt and just muddy the
    # shape, so the small icons go plain.
    if size < 96:
        return img.resize((size, size), Image.LANCZOS)

    # Salt spaced by arc length, not curve parameter -- parameter spacing bunches
    # grains wherever the curve is slow, which put a clump on the crossing.
    r_salt = 6.5 * scale
    for idx, pts in enumerate(strokes):
        # Stagger the phase per stroke, or both arms drop a grain at the
        # crossing and the two overlap into one blob.
        walked, next_at = 0.0, 28.0 + 31.0 * idx
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            walked += math.hypot(x1 - x0, y1 - y0)
            if walked < next_at:
                continue
            next_at += 92.0
            cx, cy = x1 * scale + offset, y1 * scale + offset
            draw.ellipse([cx - r_salt, cy - r_salt, cx + r_salt, cy + r_salt], fill=SALT + (255,))

    return img.resize((size, size), Image.LANCZOS)


def svg_path():
    """The same outline as SVG path data, for the in-app logo."""
    def f(v):
        return f"{v:.1f}".rstrip("0").rstrip(".")

    parts = []
    cubics = arc_to_cubics(BELLY_A0, BELLY_A1)
    p0 = cubics[0][0]
    parts.append(f"M{f(p0[0])} {f(p0[1])}")
    for _, p1, p2, p3 in cubics:
        parts.append(f"C{f(p1[0])} {f(p1[1])} {f(p2[0])} {f(p2[1])} {f(p3[0])} {f(p3[1])}")
    for arm in (LEFT_ARM, RIGHT_ARM):
        parts.append(f"M{f(arm[0][0][0])} {f(arm[0][0][1])}")
        for seg in arm:
            _, p1, p2, p3 = seg
            parts.append(f"C{f(p1[0])} {f(p1[1])} {f(p2[0])} {f(p2[1])} {f(p3[0])} {f(p3[1])}")
    return "".join(parts)


ROPE_HALF = 23.0        # must match render(); the SVG logo strokes to match
CRUST_HALF = 29.0


if __name__ == "__main__":
    # Regenerate every icon in the repo:  python tools/make-icons.py
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons = os.path.join(root, "icons")
    os.makedirs(icons, exist_ok=True)

    for name, size, inset in [
        ("icon-512.png", 512, 0.0),
        ("icon-192.png", 192, 0.0),
        ("icon-180.png", 180, 0.0),
        ("icon-maskable-512.png", 512, 0.14),
        ("favicon-64.png", 64, 0.0),
        ("favicon-32.png", 32, 0.0),
    ]:
        render(size, inset=inset).save(os.path.join(icons, name))
        print("wrote icons/" + name)

    print()
    print("SVG path for the in-app logo (index.html):")
    print(svg_path())
