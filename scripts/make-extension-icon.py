#!/usr/bin/env python3
"""Generates the DSSL extension marketplace icon (128x128 PNG).

Design ties into the site's classic re-skin: ink background, parchment
section-mark glyph (the site's logo mark is a literal section sign), brass accent.
"""
from PIL import Image, ImageDraw, ImageFont

SIZE = 128
INK = (24, 19, 16, 255)          # candlelit walnut, the site's dark bg
PARCHMENT = (245, 240, 228, 255)  # site parchment
BRASS = (201, 164, 92, 255)       # brass accent

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([2, 2, SIZE - 2, SIZE - 2], radius=24, fill=INK)

font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
try:
    font = ImageFont.truetype(font_path, 78)
except OSError:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 78)

glyph = "\u00a7"  # section sign, the site's logo mark
bbox = d.textbbox((0, 0), glyph, font=font)
w = bbox[2] - bbox[0]
h = bbox[3] - bbox[1]
x = (SIZE - w) / 2 - bbox[0]
y = (SIZE - h) / 2 - bbox[1] - 6
d.text((x, y), glyph, font=font, fill=PARCHMENT)

# brass baseline accent under the glyph
d.rounded_rectangle([36, SIZE - 26, SIZE - 36, SIZE - 20], radius=3, fill=BRASS)

out = "/home/z/my-project/dssl-vscode/icon.png"
img.save(out, "PNG")
print("wrote", out, img.size)
