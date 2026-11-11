"""Denoise the path-traced flight frames (render-flight.mjs) and cut them for the site.

    python3 finish-flight.py [--src out/flight-trace] [--h 5]

Every frame is a 1280 px square. While the drone is inside the park, wide screens get its middle
16:10 band and narrow ones a tall cut of it: that is all a screen covered by the frame can show.
At the start and the end the frame is shown smaller than the screen (it grows out of hero.webp,
and settles on the last view), so those frames keep everything they show. Writes
src/assets/flight/{wide,narrow}/NNN.webp and src/data/flight.ts (where things are in the frames).
Needs: pip install pillow numpy opencv-python-headless, and cwebp on the PATH.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "src" / "assets"
DATA = HERE.parent / "src" / "data" / "flight.ts"

args = sys.argv[1:]
opt = lambda name, fallback: args[args.index(f"--{name}") + 1] if f"--{name}" in args else fallback
SRC = HERE / opt("src", "out/flight-trace")
H = float(opt("h", "5"))  # denoise strength (40 spp); 0 = none (raster previews)

# The cut each screen gets while the frame covers it (x, y, w, h in the square), the scale it is
# stored at, and its webp quality.
SETS = {"wide": ((0, 240, 1280, 800), 1.0, 56), "narrow": ((100, 0, 1080, 1280), 0.75, 56)}
# Outside this part of the flight (0..1) the site may show a frame smaller than the screen: such
# frames keep all their pixels. hero.ts must finish growing from hero.webp before it begins and
# start settling on the last view after it ends.
COVERED = (0.22, 0.8)


def load(path: Path) -> tuple[np.ndarray, np.ndarray]:
    rgba = np.array(Image.open(path).convert("RGBA"))
    return rgba[..., :3].copy(), rgba[..., 3].copy()


def fill(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Extends the colours next to the cut-out's edges into the empty background, so the denoiser
    can't pull black into them."""
    hole = (alpha < 10).astype(np.uint8)
    if not hole.any():
        return rgb
    band = cv2.dilate(1 - hole, np.ones((9, 9), np.uint8)) & hole
    out = rgb.copy()
    out[hole == 1] = rgb[alpha >= 250].mean(axis=0) if (alpha >= 250).any() else 0
    return cv2.inpaint(out, band, 3, cv2.INPAINT_TELEA)


def denoise(frames: list, i: int) -> np.ndarray:
    """Spatial and temporal: the frames either side of it are nearly the same picture."""
    if H <= 0:
        return frames[i]
    have = [k for k in (i - 1, i, i + 1) if 0 <= k < len(frames) and frames[k] is not None]
    if len(have) == 3:
        stack = [cv2.cvtColor(frames[k], cv2.COLOR_RGB2BGR) for k in have]
        out = cv2.fastNlMeansDenoisingColoredMulti(stack, 1, 3, None, H, H, 5, 15)
    else:
        out = cv2.fastNlMeansDenoisingColored(cv2.cvtColor(frames[i], cv2.COLOR_RGB2BGR), None, H, H, 5, 17)
    return cv2.cvtColor(out, cv2.COLOR_BGR2RGB)


def encode(image: Image.Image, target: Path, quality: int) -> None:
    with tempfile.NamedTemporaryFile(suffix=".png") as tmp:
        image.save(tmp.name)
        subprocess.run(["cwebp", "-quiet", "-q", str(quality), "-alpha_q", "90", "-m", "6", "-sharp_yuv", tmp.name, "-o", str(target)], check=True)


def visible(alpha: np.ndarray) -> list[int]:
    """Bounding box (x0, y0, x1, y1) of the pixels that show."""
    ys, xs = np.where(alpha > 6)
    if not len(xs):
        return [0, 0, 1, 1]
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def cut(shows: list[int], box: tuple[int, int, int, int], size: int) -> int:
    """Which sides of `box` cut through the picture (1 left, 2 top, 4 right, 8 bottom): those past
    which it goes on, or where the render itself ends. On screen, they must stay beyond the edges
    of the canvas."""
    x0, y0, x1, y1 = shows
    x, y, w, h = box
    return (
        (1 if x0 < x or x0 == 0 else 0)
        | (2 if y0 < y or y0 == 0 else 0)
        | (4 if x1 > x + w or x1 == size else 0)
        | (8 if y1 > y + h or y1 == size else 0)
    )


def find_hero(alpha0: np.ndarray, size: int) -> list[float]:
    """Where hero.webp sits in the first frame: same camera, so only a scale and an offset, found by
    matching its outline. hero.webp is a crop of a 1350 px tall render; the frame's 16:10 band is
    as tall as that render's whole picture."""
    hero = np.array(Image.open(ASSETS / "renders" / "hero.webp").convert("RGBA"))[..., 3]
    k = size / 1.6 / 1350
    w, h = hero.shape[1] * k, hero.shape[0] * k
    small = cv2.resize(hero, (round(w), round(h)), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    x0, y0, *_ = visible(alpha0)
    best = None
    for dy in range(-8, 9):
        for dx in range(-8, 9):
            X, Y = x0 + dx, y0 + dy
            if X < 0 or Y < 0:
                continue
            region = alpha0[Y : Y + small.shape[0], X : X + small.shape[1]].astype(np.float32) / 255
            if region.shape != small.shape:
                continue
            err = float(np.abs(region - small).mean())
            if best is None or err < best[0]:
                best = (err, X, Y)
    err, X, Y = best
    print(f"hero.webp in frame 0 at {X},{Y} size {w:.1f}×{h:.1f} (outline error {err:.4f})")
    return [X, Y, round(X + w, 2), round(Y + h, 2)]


files = sorted(SRC.glob("[0-9][0-9][0-9].png"))
poses = json.loads((SRC / "poses.json").read_text())
n = poses["n"]
size = poses["w"]
assert poses["h"] == size, "frames are squares"
assert len(files) == n, f"only {len(files)} of {n} frames in {SRC}"
print(f"{n} frames in {SRC}")

frames: list = [None] * n
alphas: list = [None] * n
for f in files:
    i = int(f.stem)
    rgb, alpha = load(f)
    frames[i] = fill(rgb, alpha)
    alphas[i] = alpha

for name in SETS:
    folder = ASSETS / "flight" / name
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob("*.webp"):
        old.unlink()

total = {name: 0 for name in SETS}
boxes = {name: [] for name in SETS}
for i in range(n):
    t = i / (n - 1)
    rgba = Image.fromarray(np.dstack([denoise(frames, i), alphas[i]]))
    x0, y0, x1, y1 = visible(alphas[i])
    for name, ((bx, by, bw, bh), scale, quality) in SETS.items():
        if not COVERED[0] <= t <= COVERED[1]:
            bx, by, bw, bh = 0, 0, size, size
        # never more than what shows
        X0, Y0, X1, Y1 = max(bx, x0), max(by, y0), min(bx + bw, x1), min(by + bh, y1)
        # on a 4 px grid, so the box holds whole stored pixels at either scale
        X0, Y0 = X0 - X0 % 4, Y0 - Y0 % 4
        X1, Y1 = min(size, X1 + (-X1) % 4), min(size, Y1 + (-Y1) % 4)
        box = (X0, Y0, X1 - X0, Y1 - Y0)
        image = rgba.crop((X0, Y0, X1, Y1))
        if scale != 1:
            image = image.resize((round(box[2] * scale), round(box[3] * scale)), Image.Resampling.LANCZOS)
        target = ASSETS / "flight" / name / f"{i:03d}.webp"
        encode(image, target, quality)
        total[name] += target.stat().st_size
        boxes[name] += [*box, cut([x0, y0, x1, y1], box, size)]
    print(f"{i:03d}", end=" ", flush=True)
print()
for name, bytes_ in total.items():
    print(f"{name}: {bytes_ / 1024 / 1024:.2f} MB")

kid = []
for i in range(n):
    p = poses["frames"][i]
    kid += [round(p["x"] * size, 1), round(p["y"] * size, 1), round(p["ppm"], 1)]

data = {
    "frames": n,
    "size": size,
    "covered": list(COVERED),
    "hero": find_hero(alphas[0], size),
    "last": visible(alphas[n - 1]),
    "crop": {name: list(box) for name, (box, _, _) in SETS.items()},
    "scale": {name: scale for name, (_, scale, _) in SETS.items()},
    "boxes": boxes,
    "kid": kid,
}
DATA.write_text(
    "// Generated by art/finish-flight.py from the flight render: do not edit by hand.\n"
    "// In px of the rendered square frames. hero: where hero.webp sits in the first frame (x0, y0, x1, y1);\n"
    "// last: what the last frame shows; crop: per kind of screen, what one the frame covers can show\n"
    "// (x, y, w, h); scale: what its files are stored at; covered: the part of the flight where frames\n"
    "// are cut to that; boxes: per kind of screen, per frame, the part of the square its file holds\n"
    "// (x, y, w, h) and which of its sides cut through the picture (1 left, 2 top, 4 right, 8 bottom);\n"
    "// kid: per frame, the mascot's feet (x, y) and how many px a metre spans there.\n"
    f"export const FLIGHT = {json.dumps(data, separators=(',', ':'))};\n"
)
print(f"→ {DATA.relative_to(HERE.parent)}")
