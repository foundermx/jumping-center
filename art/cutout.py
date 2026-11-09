"""Cut the client's real mascot out of their own stories (art/ref) into transparent PNGs.

    python3 cutout.py        (needs: pip install pillow numpy opencv-python-headless)

The stories draw the kid as a sticker with a white outline, so the background is everything
reachable from the crop border without crossing white. The outline stays: it's their style.
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).parent
OUT = HERE.parent / "src" / "assets" / "kid"


def sticker(src: str, box, name: str, cut=None, seal: int = 0, barriers=(), holes=(), ring: int = 10) -> None:
    rgb = np.array(Image.open(HERE / "ref" / src).convert("RGB"))
    x0, y0, x1, y1 = box
    rgb = np.ascontiguousarray(rgb[y0:y1, x0:x1])
    h, w = rgb.shape[:2]

    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    white = ((rgb.min(axis=2) > 200) & (hsv[..., 1] < 48)).astype(np.uint8)
    # A thin outline has pinholes: grow it `seal` px so the fill can't leak in, shrink back after.
    if seal:
        white = cv2.dilate(white, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * seal + 1, 2 * seal + 1)))
    # Where the drawing's border is shaded grey instead of white, close it by hand (crop coords).
    for line in barriers:
        cv2.polylines(white, [np.array(line, np.int32)], False, 1, thickness=5)
    count, labels = cv2.connectedComponents(1 - white, connectivity=4)

    # Background = regions touching the crop border, except where the border cuts through
    # the kid (cut = {side: (from, to)} in pixels along that side), or the fill eats him.
    edges = {"top": labels[0].copy(), "left": labels[:, 0].copy(), "right": labels[:, -1].copy(), "bottom": labels[-1].copy()}
    for side, (a, b) in (cut or {}).items():
        edges[side][a:b] = -1
    seeds = np.unique(np.concatenate(list(edges.values()) + [np.array([labels[y, x] for x, y in holes], np.int32)]))
    # label 0 is every white pixel (outline, eyes, teeth, shirt print): never background by itself
    background = np.isin(labels, seeds[seeds > 0])
    # White counts only as the sticker outline: within `ring` px of the drawing. That drops white
    # bits of the photo stuck to the outline; enclosed whites (eyes, teeth, print) come back as holes.
    interior = (labels > 0) & ~background
    near = cv2.dilate(interior.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * ring + 1, 2 * ring + 1)))
    kid = ((~background) & (interior | (near == 1))).astype(np.uint8)

    n, comp, stats, _ = cv2.connectedComponentsWithStats(kid, connectivity=8)
    kid = (comp == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    n, comp, stats, _ = cv2.connectedComponentsWithStats(1 - kid, connectivity=4)
    for i in range(1, n):
        x, y, bw, bh, _ = stats[i]
        enclosed = x > 0 and y > 0 and x + bw < w and y + bh < h
        if enclosed and not background[comp == i].any():
            kid[comp == i] = 1
    kid = cv2.morphologyEx(kid, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    if seal:
        kid = cv2.erode(kid, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * seal + 1, 2 * seal + 1)))
    alpha = cv2.GaussianBlur(kid.astype(np.float32), (0, 0), 0.7)
    alpha = np.clip((alpha - 0.5) * 2.2 + 0.5, 0, 1)

    image = Image.fromarray(np.dstack([rgb, (alpha * 255).astype(np.uint8)]))
    image = image.crop(image.getchannel("A").getbbox())
    OUT.mkdir(parents=True, exist_ok=True)
    image.save(OUT / f"{name}.png", optimize=True)
    print(f"{name}.png {image.width}×{image.height}")


# Chill Fall: full body, hand on hip, pointing up.
sticker(
    "story-chill-fall.png", (95, 560, 700, 1395), "kid-point", seal=2,
    barriers=[
        [(350, 728), (354, 772), (378, 792), (430, 800), (482, 796), (494, 774), (491, 763), (484, 757)],
        [(77, 772), (84, 790), (120, 798), (165, 795), (198, 786), (208, 770), (208, 748)],
    ],
    holes=[(172, 425)],
)
# Sunset Boost: arms up. The promo text covers his legs, so it's cut at the waist.
sticker("story-sunset-boost.png", (0, 420, 470, 875), "kid-cheer", cut={"left": (0, 115), "bottom": (70, 360)})
