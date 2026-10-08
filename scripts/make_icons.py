#!/usr/bin/env python3
"""Génère les icônes PNG de la PWA (192, 512, maskable, apple-touch)."""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")
MAGENTA, CYAN, WHITE = (230, 0, 126), (0, 209, 209), (255, 255, 255)
FONTS = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
         "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"]


def font(size):
    for f in FONTS:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def draw_icon(size, rounded=True):
    S = size * 4  # supersampling
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=MAGENTA)
    else:
        d.rectangle([0, 0, S, S], fill=MAGENTA)
    # Lettre P (zone sûre maskable : 80 % central)
    f = font(int(S * 0.46))
    d.text((S * 0.5, S * 0.40), "P", font=f, fill=WHITE, anchor="mm")
    # Petites barres théorique (cyan) / réel (blanc)
    base, bw, gap = S * 0.78, S * 0.055, S * 0.02
    heights = [(0.12, 0.10), (0.09, 0.11), (0.13, 0.12)]
    x = S * 0.5 - (3 * (2 * bw + gap) + 2 * gap * 2) / 2
    for th, re_ in heights:
        d.rounded_rectangle([x, base - S * th, x + bw, base], radius=int(bw / 3), fill=CYAN)
        x += bw + gap
        d.rounded_rectangle([x, base - S * re_, x + bw, base], radius=int(bw / 3), fill=WHITE)
        x += bw + gap * 3
    return img.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
draw_icon(192).save(os.path.join(OUT, "icon-192.png"))
draw_icon(512).save(os.path.join(OUT, "icon-512.png"))
draw_icon(512, rounded=False).save(os.path.join(OUT, "icon-maskable-512.png"))
draw_icon(180, rounded=False).convert("RGB").save(os.path.join(OUT, "apple-touch-icon.png"))
draw_icon(32).save(os.path.join(OUT, "favicon-32.png"))
print("icônes générées dans", OUT)
