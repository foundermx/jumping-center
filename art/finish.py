"""Denoise the raw path-traced PNGs in out/ and export them as the site's source images.

    python3 finish.py [name ...]      (needs: pip install pillow numpy opencv-python-headless)

Cut-outs (anything with transparency) are cropped to their visible pixels; before denoising,
the colours next to their edges are extended outwards so the filter can't pull in black halos.
"""
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).parent
SRC = HERE / "out"
DST = HERE.parent / "src" / "assets" / "renders"
STRENGTH = {"default": 3.0, "hero": 2.6}


def denoise(rgb: np.ndarray, h: float) -> np.ndarray:
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    out = cv2.fastNlMeansDenoisingColored(bgr, None, h, h, 5, 17)
    return cv2.cvtColor(out, cv2.COLOR_BGR2RGB)


def finish(path: Path) -> None:
    rgba = np.array(Image.open(path).convert("RGBA"))
    rgb, alpha = rgba[..., :3].copy(), rgba[..., 3]
    h = STRENGTH.get(path.stem, STRENGTH["default"])
    cutout = alpha.min() < 255

    if cutout:
        hole = (alpha < 10).astype(np.uint8)
        band = cv2.dilate(1 - hole, np.ones((25, 25), np.uint8)) & hole
        rgb[hole == 1] = rgb[alpha >= 250].mean(axis=0)
        rgb = cv2.inpaint(rgb, band, 4, cv2.INPAINT_TELEA)

    out = np.dstack([denoise(rgb, h), alpha]) if cutout else denoise(rgb, h)
    image = Image.fromarray(out)
    if cutout:
        x0, y0, x1, y1 = Image.fromarray(alpha).point(lambda v: 255 if v > 6 else 0).getbbox()
        pad = 6
        image = image.crop((max(0, x0 - pad), max(0, y0 - pad), min(image.width, x1 + pad), min(image.height, y1 + pad)))

    DST.mkdir(parents=True, exist_ok=True)
    target = DST / f"{path.stem}.webp"
    image.save(target, quality=94, method=6)
    print(f"{path.name} → {target.name} {image.width}×{image.height} {target.stat().st_size // 1024} KB")


names = sys.argv[1:]
for file in sorted(SRC.glob("*.png")):
    if not names or file.stem in names:
        finish(file)
