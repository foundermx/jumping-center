#!/bin/sh
# Final renders (raw PNG into out/). Then: python3 finish.py → denoise + export to src/assets/renders.
set -e
cd "$(dirname "$0")"
node render.mjs hero --spp 256 --scale 0.9 --out out
node render.mjs mascot-jump mascot-welcome --spp 300 --scale 0.9 --out out
node render.mjs pumpkin --spp 256 --scale 0.8 --out out
node render.mjs trampolines --spp 256 --scale 0.9 --out out
node render.mjs retos infantil fiestas --spp 256 --scale 0.875 --out out
node render.mjs visita --spp 256 --scale 0.875 --out out
