"""How the picture moves from each flight frame to the next, for the site to play between frames.

    python3 flight-motion.py

Run after finish-flight.py. For each pair of consecutive frames and each kind of screen, measures
the optical flow from one frame to the next over the frames as the site gets them, and keeps:

- a zoom and a pan (in px of the square frames): the camera's overall move. hero.ts carries the
  hero picture along with it while the frames take over from it, and moves the frames by it where
  WebGL is missing. Where it is no better than standing still, the pair stands still.
- the flow itself on a grid over the frame (src/assets/flight/flow-<kind>.bin): where each point of
  the frame is in the next one, near things and far things each their own way (parallax). hero.ts
  draws the frame as a mesh on that grid and slides every point along its own path while it fades
  into the next frame, which slides in from the other end: a scroll however slow sees the flight
  move, never two pictures.

Writes src/data/flight-motion.ts and the flow files. Needs: pip install pillow numpy
opencv-python-headless.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FLIGHT = ROOT / "src" / "data" / "flight.ts"
OUT = ROOT / "src" / "data" / "flight-motion.ts"
FLOWS = ROOT / "src" / "assets" / "flight"
K = 0.5  # the flow is measured at half the square's size
GRID = 24  # points per side of the grid over each frame
QUARTER = 4  # the flow files hold quarter px, as int16
CREAM = np.array([245, 240, 232], np.float32)  # the page under the frames' empty parts

source = FLIGHT.read_text()
F = json.loads(source[source.index("{") : source.rindex("}") + 1])
N, SIZE = F["frames"], F["size"]
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)


def square(kind: str, i: int) -> tuple[np.ndarray, np.ndarray, tuple[float, float, float, float]]:
    """Frame i where it sits in the (half-size) square, on the page's colour, its alpha, and its box
    (in px of the full square)."""
    x, y, w, h, _ = F["boxes"][kind][i * 5 : i * 5 + 5]
    image = Image.open(FLOWS / kind / f"{i:03d}.webp").convert("RGBA")
    image = image.resize((round(w * K), round(h * K)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (round(SIZE * K), round(SIZE * K)), (0, 0, 0, 0))
    canvas.paste(image, (round(x * K), round(y * K)))
    rgba = np.array(canvas).astype(np.float32)
    alpha = rgba[..., 3:] / 255
    return rgba[..., :3] * alpha + CREAM * (1 - alpha), rgba[..., 3], (x, y, w, h)


def gray(image: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(image.astype(np.uint8), cv2.COLOR_RGB2GRAY)


def fit(a: np.ndarray, b: np.ndarray, alpha_a: np.ndarray, alpha_b: np.ndarray) -> tuple[float, float, float]:
    """Zoom s and pan (tx, ty) such that a point p of frame a shows at s·p + t in frame b (half-size
    px): robust least squares over the flow of the textured pixels both frames show."""
    ga, gb = gray(a), gray(b)
    flow = cv2.calcOpticalFlowFarneback(ga, gb, None, 0.5, 5, 31, 5, 7, 1.5, 0)
    ys, xs = np.mgrid[0 : ga.shape[0], 0 : ga.shape[1]].astype(np.float32)
    texture = np.hypot(cv2.Sobel(ga, cv2.CV_32F, 1, 0), cv2.Sobel(ga, cv2.CV_32F, 0, 1))
    use = (alpha_a > 250) & (alpha_b > 250) & (texture > 8)
    X, Y = xs[use], ys[use]
    U, V = X + flow[..., 0][use], Y + flow[..., 1][use]
    weight = np.ones_like(X)
    for _ in range(8):  # Huber: what moves its own way (parallax) counts for less
        M = np.zeros((2 * len(X), 3), np.float32)
        M[0::2, 0], M[0::2, 1] = X, 1
        M[1::2, 0], M[1::2, 2] = Y, 1
        target = np.empty(2 * len(X), np.float32)
        target[0::2], target[1::2] = U, V
        W = np.repeat(weight, 2)
        s, tx, ty = np.linalg.lstsq(M * W[:, None], target * W, rcond=None)[0]
        miss = np.hypot(s * X + tx - U, s * Y + ty - V)
        weight = np.where(miss < 2, 1, 2 / np.maximum(miss, 1e-6))
    return float(s), float(tx), float(ty)


def moved(image: np.ndarray, s: float, tx: float, ty: float) -> np.ndarray:
    M = np.float32([[s, 0, tx], [0, s, ty]])
    return cv2.warpAffine(image, M, (image.shape[1], image.shape[0]), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def ghost(a: np.ndarray, b: np.ndarray, alpha_a: np.ndarray, alpha_b: np.ndarray, s: float, tx: float, ty: float) -> float:
    """How far apart the two pictures of a half-way cross-fade are, each moved half the way."""
    A = moved(a, 1 + (s - 1) / 2, tx / 2, ty / 2)
    B = moved(b, 1 + (1 / s - 1) / 2, -tx / s / 2, -ty / s / 2)
    both = (moved(alpha_a, 1 + (s - 1) / 2, tx / 2, ty / 2) > 250) & (moved(alpha_b, 1 + (1 / s - 1) / 2, -tx / s / 2, -ty / s / 2) > 250)
    return float(np.abs(A - B).mean(axis=2)[both].mean())


def flow_grid(a: np.ndarray, b: np.ndarray, box: tuple[float, float, float, float], s: float, tx: float, ty: float) -> np.ndarray:
    """Where each point of a GRID × GRID grid over frame a's box is in frame b, as a move (px of the
    full square): the overall zoom and pan, then the flow left between the frames lined up by it."""
    lined = moved(a, s, tx, ty)
    rest = dis.calc(gray(lined), gray(b), None)  # lined(p) shows at p + rest(p) in b
    x, y, w, h = (v * K for v in box)
    r = max(2, int(min(w, h) / GRID / 2))
    out = np.zeros((GRID, GRID, 2), np.float32)
    for j, gy in enumerate(np.linspace(y, y + h, GRID)):
        for i, gx in enumerate(np.linspace(x, x + w, GRID)):
            px, py = s * gx + tx, s * gy + ty  # where the overall move takes the point
            cx, cy = int(np.clip(px, 0, rest.shape[1] - 1)), int(np.clip(py, 0, rest.shape[0] - 1))
            cell = rest[max(0, cy - r) : cy + r + 1, max(0, cx - r) : cx + r + 1].reshape(-1, 2)
            dx, dy = np.median(cell, axis=0)  # the median: one cell may straddle near and far
            out[j, i] = (px + dx - gx, py + dy - gy)
    return out / K


motion: dict[str, list[float]] = {}
for kind in F["boxes"]:
    frames = [square(kind, i) for i in range(N)]
    steps: list[float] = []
    grids = np.zeros((N - 1, GRID, GRID, 2), np.float32)
    before = after = 0.0
    for i in range(N - 1):
        (a, alpha_a, box), (b, alpha_b, _) = frames[i], frames[i + 1]
        s, tx, ty = fit(a, b, alpha_a, alpha_b)
        still = ghost(a, b, alpha_a, alpha_b, 1, 0, 0)
        carried = ghost(a, b, alpha_a, alpha_b, s, tx, ty)
        if carried >= still:
            s, tx, ty, carried = 1, 0, 0, still
        before += still
        after += carried
        steps += [round(s, 5), round(tx / K, 2), round(ty / K, 2)]
        grids[i] = flow_grid(a, b, box, s, tx, ty)
        print(f"{i:03d}", end=" ", flush=True)
    print(f"\n{kind}: half-way cross-fade, moved by zoom and pan: {before / (N - 1):.1f} → {after / (N - 1):.1f} apart")
    motion[kind] = steps
    quarters = np.clip(np.round(grids * QUARTER), -32768, 32767).astype("<i2")
    (FLOWS / f"flow-{kind}.bin").write_bytes(quarters.tobytes())
    print(f"→ src/assets/flight/flow-{kind}.bin ({quarters.nbytes // 1024} KB)")

OUT.write_text(
    "// Generated by art/flight-motion.py from the flight frames: do not edit by hand.\n"
    "// MOTION: per kind of screen, per pair of consecutive frames (i, i + 1), zoom s and pan tx, ty such\n"
    "// that a point p of frame i (px of the square frames) shows at about s·p + (tx, ty) in frame i + 1.\n"
    "// The flow files (src/assets/flight/flow-<kind>.bin) hold, per pair, where each point of a GRID × GRID\n"
    "// grid over frame i's box (corners included, rows top to bottom) is in frame i + 1, as a move (int16,\n"
    "// in 1/QUARTER px).\n"
    f"export const MOTION = {json.dumps(motion, separators=(',', ':'))};\n"
    f"export const GRID = {GRID};\n"
    f"export const QUARTER = {QUARTER};\n"
)
print(f"→ {OUT.relative_to(ROOT)}")
