// Builds the Jumping Center lockup as pure SVG paths (no font needed at runtime).
//   node logo.mjs [font-file] [out.svg]
// Colours are inline-style CSS variables so the site can recolour it (header, footer)
// and an <img> or a 3D texture still gets the navy/lime defaults.
import opentype from 'opentype.js';
import { readFile, writeFile } from 'node:fs/promises';

const [fontFile = 'fonts/lilita-one-400.woff', out = '../src/assets/brand/logo.svg'] = process.argv.slice(2);
const load = async (file) => opentype.parse((await readFile(new URL(file, import.meta.url))).buffer);
const display = await load(fontFile);
const tag = await load('fonts/poppins-800.woff');

const SIZE = 100;
const fmt = (n) => +n.toFixed(1);

/** Lays out `text` letter by letter with a small bounce (dy, rotation) per letter. */
function bouncyPath(font, text, x0, baseline, bounce) {
  let x = x0;
  let d = '';
  const glyphs = font.stringToGlyphs(text);
  glyphs.forEach((glyph, i) => {
    const [dy, rot] = bounce[i % bounce.length];
    const path = glyph.getPath(x, baseline + dy, SIZE);
    const bb = path.getBoundingBox();
    const cx = (bb.x1 + bb.x2) / 2;
    const cy = (bb.y1 + bb.y2) / 2;
    const a = (rot * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const t = (px, py) => [cx + (px - cx) * cos - (py - cy) * sin, cy + (px - cx) * sin + (py - cy) * cos];
    for (const c of path.commands) {
      if (c.type === 'Z') { d += 'Z'; continue; }
      const pts = [];
      if (c.x1 !== undefined) pts.push(t(c.x1, c.y1));
      if (c.x2 !== undefined) pts.push(t(c.x2, c.y2));
      pts.push(t(c.x, c.y));
      d += c.type + pts.flat().map(fmt).join(' ');
    }
    const next = glyphs[i + 1];
    x += glyph.advanceWidth * (SIZE / font.unitsPerEm) + (next ? font.getKerningValue(glyph, next) * (SIZE / font.unitsPerEm) : 0) - 1.5;
  });
  return { d, width: x - x0 };
}

const line1 = bouncyPath(display, 'Jumping', 0, 92, [[0, -4], [-5, 3], [2, -2], [-7, 5], [3, -3], [-3, 2], [1, -4]]);
const line2 = bouncyPath(display, 'Center', 24, 168, [[-2, 3], [3, -3], [-4, 2], [2, -4], [-3, 3], [2, -2]]);
const width = Math.max(line1.width, line2.width + 26) + 14;

// Tagline pill
const tagText = 'DIVERSIÓN EN ACCIÓN';
const tagSize = 15.5;
const tagPath = tag.getPath(tagText, 0, 0, tagSize, { letterSpacing: 0.06 });
const tb = tagPath.getBoundingBox();
const pillW = Math.min(width - 6, tb.x2 - tb.x1 + 36);
const pillH = 30;
const pillX = (width - pillW) / 2 + 6;
const pillY = 184;
const tagX = pillX + (pillW - (tb.x2 - tb.x1)) / 2 - tb.x1;
const tagY = pillY + pillH / 2 - (tb.y1 + tb.y2) / 2;
const tagD = tag.getPath(tagText, tagX, tagY, tagSize, { letterSpacing: 0.06 }).toPathData(1);

const height = pillY + pillH + 6;
const letters = line1.d + line2.d;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 ${fmt(width + 16)} ${fmt(height + 12)}" role="img" aria-label="Jumping Center, diversión en acción">
<path d="${letters}" transform="translate(4.5 6)" style="fill:var(--logo-pop,#bff01a);stroke:var(--logo-pop,#bff01a);stroke-width:9;stroke-linejoin:round"/>
<path d="${letters}" style="fill:var(--logo-ink,#111a5e);stroke:var(--logo-ink,#111a5e);stroke-width:2.5;stroke-linejoin:round"/>
<rect x="${fmt(pillX)}" y="${pillY}" width="${fmt(pillW)}" height="${pillH}" rx="${pillH / 2}" style="fill:var(--logo-pill,#111a5e);stroke:var(--logo-pill-edge,none);stroke-width:2.5"/>
<path d="${tagD}" style="fill:var(--logo-pill-ink,#fff)"/>
</svg>
`;
await writeFile(new URL(out, import.meta.url), svg);
console.log(`${out}: ${fmt(width)}×${fmt(height)}, ${(svg.length / 1024).toFixed(1)} KB`);
