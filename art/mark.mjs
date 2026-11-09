// The "J" mark: favicon, shirt print and social avatar. node mark.mjs
import opentype from 'opentype.js';
import { readFile, writeFile } from 'node:fs/promises';

const font = opentype.parse((await readFile(new URL('fonts/lilita-one-400.woff', import.meta.url))).buffer);
const glyph = font.charToGlyph('J');
const probe = glyph.getPath(0, 0, 100).getBoundingBox();
const s = 64 / (probe.y2 - probe.y1);
const size = 100 * s;
const bb = glyph.getPath(0, 0, size).getBoundingBox();
const x = 50 - (bb.x1 + bb.x2) / 2 - 2;
const y = 50 - (bb.y1 + bb.y2) / 2 - 1;
const d = glyph.getPath(x, y, size).toPathData(2);
const mark = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg}<path d="${d}" transform="translate(3.5 4)" fill="#bff01a" stroke="#bff01a" stroke-width="5" stroke-linejoin="round"/><path d="${d}" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>\n`;
await writeFile(new URL('../public/favicon.svg', import.meta.url), mark('<rect width="100" height="100" rx="24" fill="#0b2394"/>'));
await writeFile(new URL('mark-print.svg', import.meta.url), mark(''));
console.log('favicon.svg + mark-print.svg');
