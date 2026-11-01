#!/usr/bin/env python3
"""
Draws the pixel-art page scenery for the website and writes it to docs/img/:

  scenery_hills.png   a seamless, tileable strip: far mountains, near mountains and grass
  scenery_cloud1..3.png   three small clouds
  scenery_sun.png     a pixel sun

The mountains echo the legend: two peaks, Pamitinan and Binacayan, with the giant between them.
Run:  python3 tools/make_scenery.py     (needs Pillow)
"""
import math
import os
import random

from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "img")
os.makedirs(OUT, exist_ok=True)

W, H = 192, 64  # one tile of the hills strip, in "art pixels"


def rgba(h, a=255):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def noise(i, seed):
    """Deterministic jitter in [0, 1) for column i (periodic by caller)."""
    r = random.Random(seed * 1000003 + i * 7919)
    return r.random()


def ridge(peaks, seed):
    """Height of the skyline at every column. Peaks wrap around so the tile repeats seamlessly."""
    hs = []
    for x in range(W):
        best = 0.0
        for cx, height, half in peaks:
            dx = (x - cx + W / 2) % W - W / 2
            if abs(dx) < half:
                h = height * (1 - abs(dx) / half)
                # a slightly broken, rocky edge
                h += (noise(x, seed) - 0.5) * 2.2
                best = max(best, h)
        hs.append(best)
    return hs


def paint_range(img, heights, base_y, palette, seed):
    rim, light, mid, dark, deep = palette
    rng = random.Random(seed)
    for x in range(W):
        top = int(round(base_y - heights[x]))
        prev = heights[(x - 1) % W]
        nxt = heights[(x + 1) % W]
        lit = heights[x] >= prev          # slope rising to the right faces the sun
        steep = abs(heights[x] - prev) > 0.9 or abs(nxt - heights[x]) > 0.9
        for y in range(max(0, top), H):
            d = y - top
            if d == 0:
                c = rim
            elif d < 3:
                c = light if lit else mid
            elif d < 12:
                c = mid if lit else dark
            else:
                c = dark if lit else deep
            if steep and d > 1 and rng.random() < 0.18:
                c = dark if c in (light, mid) else deep
            if d > 3 and (x + 2 * y) % 13 == 0 and rng.random() < 0.55:
                c = dark if c in (light, mid) else deep       # rock strata
            img.putpixel((x, y), rgba(c))


def paint_grass(img):
    green, green_d, green_l = "#3fa65b", "#2f7d44", "#7bdc8a"
    rng = random.Random(11)
    base = H - 11
    for x in range(W):
        top = base + int(2 * math.sin(2 * math.pi * 3 * x / W) + (noise(x, 5) > 0.7))
        for y in range(top, H):
            d = y - top
            c = green_l if d == 0 else green
            if d >= 5:
                c = green_d
            elif rng.random() < 0.12:
                c = green_d
            img.putpixel((x, y), rgba(c))
        if noise(x, 9) > 0.8 and top > 0:                      # little grass tufts
            img.putpixel((x, top - 1), rgba(green_l))


def hills():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # far range: pale, small peaks
    far = ridge([(24, 22, 38), (92, 30, 46), (150, 20, 34)], seed=3)
    paint_range(img, far, base_y=44, palette=("#e3ecff", "#c3d3f5", "#a9bfec", "#8ea7df", "#7a93cf"), seed=1)
    # near range: the two legend peaks, Pamitinan and Binacayan, with a valley between
    near = ridge([(52, 30, 40), (134, 34, 44)], seed=8)
    paint_range(img, near, base_y=56, palette=("#d4e1fa", "#8ea4da", "#6a7fb8", "#465a94", "#37487e"), seed=2)
    paint_grass(img)
    img.save(os.path.join(OUT, "scenery_hills.png"))


def cloud(name, blobs, w, h):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cells = set()
    for cx, cy, rx, ry in blobs:
        for y in range(h):
            for x in range(w):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                    cells.add((x, y))
    for (x, y) in cells:
        below = (x, y + 1) in cells
        above = (x, y - 1) in cells
        if not below:
            c = "#c9dcfb"            # soft blue underside
        elif not above:
            c = "#ffffff"
        else:
            c = "#f4f8ff"
        img.putpixel((x, y), rgba(c))
    img.save(os.path.join(OUT, name))


def sun():
    s = 24
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    c = (s - 1) / 2
    for y in range(s):
        for x in range(s):
            d = math.hypot(x - c, y - c)
            if d <= 7.5:
                img.putpixel((x, y), rgba("#f5c842" if d > 4.5 else "#fff3b0"))
            elif d <= 8.8:
                img.putpixel((x, y), rgba("#ffe9a3", 150))
    for dx, dy in ((0, -11), (0, 11), (-11, 0), (11, 0), (8, 8), (-8, 8), (8, -8), (-8, -8)):
        for k in (0, 1):
            img.putpixel((int(c + 0.5 + dx * (1 + k * 0.08)), int(c + 0.5 + dy * (1 + k * 0.08))), rgba("#f5c842", 200))
    img.save(os.path.join(OUT, "scenery_sun.png"))


if __name__ == "__main__":
    hills()
    cloud("scenery_cloud1.png", [(8, 11, 7, 5), (17, 8, 9, 7), (27, 11, 8, 5), (20, 12, 14, 4)], 36, 18)
    cloud("scenery_cloud2.png", [(7, 9, 6, 4), (16, 6, 8, 6), (24, 9, 6, 4), (15, 10, 11, 3)], 30, 15)
    cloud("scenery_cloud3.png", [(10, 14, 9, 6), (22, 10, 11, 9), (34, 13, 10, 7), (44, 15, 8, 5), (28, 16, 20, 5)], 54, 24)
    sun()
    print("scenery written to", os.path.abspath(OUT))
