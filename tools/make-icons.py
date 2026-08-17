# Generates the app icons: a pretzel on the brand green.
#
# The mark is the pretzel emoji rendered from the system colour-emoji font,
# rather than a hand-drawn curve. The app already shows 🥨 in the streak chip,
# and a drawn one sitting next to it never quite matched.
#
#     python tools/make-icons.py
#
# Needs Pillow and a colour emoji font. This is the only Python in the project;
# the app itself has no build step.

import os
import sys
from PIL import Image, ImageDraw, ImageFont

PRETZEL = "\U0001F968"
BG = (31, 111, 92)          # --accent, matches theme-color in index.html

# Colour emoji fonts, in the order we would rather have them.
FONT_CANDIDATES = [
    "C:/Windows/Fonts/seguiemj.ttf",                        # Windows
    "/System/Library/Fonts/Apple Color Emoji.ttc",          # macOS
    "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",    # Linux
    "/usr/share/fonts/noto/NotoColorEmoji.ttf",
]

ICONS = [
    # name, size, share of the canvas the pretzel occupies
    ("icon-512.png", 512, 0.78),
    ("icon-192.png", 192, 0.78),
    ("icon-180.png", 180, 0.78),
    # Maskable icons get cropped to a circle by some launchers, so the mark has
    # to sit well inside the safe zone.
    ("icon-maskable-512.png", 512, 0.58),
    ("favicon-64.png", 64, 0.86),
    ("favicon-32.png", 32, 0.90),
]


def find_font():
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return path
    sys.exit(
        "No colour emoji font found. Tried:\n  " + "\n  ".join(FONT_CANDIDATES)
    )


def render_glyph(font_path, px):
    """The pretzel on transparency, cropped to its own ink."""
    canvas = px * 2
    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Apple's emoji font only carries fixed bitmap strikes; asking for any other
    # size raises, so fall back to the one it does have and scale afterwards.
    try:
        font = ImageFont.truetype(font_path, px)
    except OSError:
        font = ImageFont.truetype(font_path, 137)

    draw.text((canvas // 2, canvas // 2), PRETZEL, font=font,
              anchor="mm", embedded_color=True)

    box = img.getbbox()
    if box is None:
        sys.exit("The emoji font produced an empty glyph.")
    return img.crop(box)


def make(font_path, size, fill, supersample=4):
    big = size * supersample
    img = Image.new("RGBA", (big, big), BG + (255,))

    glyph = render_glyph(font_path, int(big * fill))

    # Fit inside the target square, preserving the glyph's own proportions.
    target = int(big * fill)
    scale = min(target / glyph.width, target / glyph.height)
    glyph = glyph.resize(
        (max(1, int(glyph.width * scale)), max(1, int(glyph.height * scale))),
        Image.LANCZOS,
    )

    # Centre on the ink, not on the font's advance box -- the glyph is not
    # centred within its own em, which left the pretzel riding high.
    img.paste(glyph, ((big - glyph.width) // 2, (big - glyph.height) // 2), glyph)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    font_path = find_font()
    print("font:", font_path)

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "icons")
    os.makedirs(out, exist_ok=True)

    for name, size, fill in ICONS:
        make(font_path, size, fill).save(os.path.join(out, name))
        print("wrote icons/" + name)
