#!/usr/bin/env python3
"""
Generates the pixel scenery used behind the website:
  docs/img/bg-ridge.png   480x120  two layers of mountains (the far range and the near twin peaks,
                                   a nod to Pamitinan and Binacayan), tiles seamlessly left to right
  docs/img/bg-clouds.png  480x64   a strip of pixel clouds, tiles seamlessly left to right

Usage: python3 tools/make_background.py     (needs Pillow)
Change the colors or peak lists below and run it again.
"""
import math
import os
import random

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "docs", "img")
os.makedirs(OUT, exist_ok=True)

W, H = 480, 120


def rgba(h, a=255):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def pdist(a, b, w=W):
    d = abs(a - b) % w
    return min(d, w - d)


def ridge_heights(peaks, base, seed):
    """Height (in pixels above the bottom) for each column; periodic so the strip tiles."""
    rnd = random.Random(seed)
    p1, p2 = rnd.uniform(0, 6.28), rnd.uniform(0, 6.28)
    hs = []
    for x in range(W):
        h = base
        for cx, ph, slope in peaks:
            h = max(h, ph - slope * pdist(x, cx))
        h += 1.3 * math.sin(2 * math.pi * 11 * x / W + p1) + 0.9 * math.sin(2 * math.pi * 27 * x / W + p2)
        hs.append(max(4, min(H - 2, int(round(h)))))
    return hs


def paint_layer(img, hs, base, shade, rim, seed, floor):
    rnd = random.Random(seed)
    px = img.load()
    # Which way is the slope going? Look a few pixels either side so rock noise cannot flip it
    # column by column (that made thin vertical streaks). Flat stretches inherit the last direction.
    direction, last = [], 1
    for x in range(W):
        d = hs[(x + 5) % W] - hs[(x - 5) % W]
        if d <= -3:
            last = -1
        elif d >= 3:
            last = 1
        if hs[x] <= floor:          # low flat ground between mountains is always lit
            last = 1
        direction.append(last)
    for x in range(W):
        top = H - hs[x]
        descending = direction[x] < 0                    # slope facing right = shaded side
        facet = int(hs[x] * 0.6)
        for y in range(top, H):
            c = shade if (descending and y < top + facet) else base
            if y == top:
                c = rim if not descending else shade
            elif y == top + 1 and not descending:
                c = rim
            px[x, y] = rgba(c)
        # a few rock specks
        if rnd.random() < 0.10 and H - top > 12:
            y = rnd.randint(top + 4, min(H - 1, top + 30))
            px[x, y] = rgba(shade)


def make_ridge():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    far = ridge_heights([(40, 62, 0.9), (130, 80, 1.0), (250, 58, 0.8), (340, 86, 1.05), (430, 66, 0.9)], 30, 3)
    paint_layer(img, far, base="#cfe1fc", shade="#bcd4f6", rim="#eaf3ff", seed=5, floor=36)
    # near layer: twin peaks in the middle (the two mountains the giant holds apart) plus smaller hills
    near = ridge_heights([(168, 74, 1.15), (276, 80, 1.15), (56, 46, 1.0), (404, 52, 1.0)], 20, 9)
    paint_layer(img, near, base="#b9d1f7", shade="#a5c2ee", rim="#e0ecff", seed=11, floor=26)
    img.save(os.path.join(OUT, "bg-ridge.png"))


def ellipse_cells(cx, cy, rx, ry):
    cells = set()
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                cells.add((x, y))
    return cells


def make_clouds():
    CW, CH = 480, 64
    img = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    px = img.load()
    # (center x, center y, width)
    for cx, cy, w in [(70, 30, 58), (200, 22, 40), (310, 36, 72), (428, 24, 46)]:
        cells = set()
        cells |= ellipse_cells(cx, cy, w / 2, w / 7)
        cells |= ellipse_cells(cx - w * 0.2, cy - w * 0.08, w * 0.22, w * 0.18)
        cells |= ellipse_cells(cx + w * 0.06, cy - w * 0.15, w * 0.27, w * 0.24)
        cells |= ellipse_cells(cx + w * 0.3, cy - w * 0.03, w * 0.2, w * 0.13)
        for (x, y) in cells:
            if 0 <= x < CW and 0 <= y < CH:
                under = (x, y + 1) not in cells
                under2 = (x, y + 2) not in cells
                px[x, y] = rgba("#d6e6ff", 235) if (under or under2) else rgba("#ffffff", 235)
    img.save(os.path.join(OUT, "bg-clouds.png"))


def preview():
    """A quick look at how the layers sit on the sky gradient (not used by the site)."""
    S = 3
    ridge = Image.open(os.path.join(OUT, "bg-ridge.png")).resize((W * S, H * S), Image.NEAREST)
    clouds = Image.open(os.path.join(OUT, "bg-clouds.png")).resize((W * S, 64 * S), Image.NEAREST)
    canvas = Image.new("RGBA", (W * S, 560), rgba("#a9cbff"))
    top, bot = (0xa9, 0xcb, 0xff), (0xea, 0xf2, 0xff)
    for y in range(560):
        t = min(1.0, y / 470)
        canvas.paste(tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,), (0, y, W * S, y + 1))
    canvas.alpha_composite(clouds, (0, 40))
    canvas.alpha_composite(ridge, (0, 560 - H * S))
    canvas.save(os.path.join(HERE, "..", "tests", "background_preview.png"))


if __name__ == "__main__":
    make_ridge()
    make_clouds()
    preview()
    print("wrote docs/img/bg-ridge.png, docs/img/bg-clouds.png and tests/background_preview.png")
