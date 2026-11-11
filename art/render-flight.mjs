// Renders the hero's drone flight (src/flight.js) to numbered PNGs, plus poses.json for the mascot.
//   node render-flight.mjs [--mode trace|preview] [--n 72] [--w 1280] [--h 1280] [--spp 40]
//                          [--only 3,7,…] [--skip-done] [--out out/flight-trace]
// Frames go coarse to fine (every 8th, then every 4th, …), so a run cut short still covers the flight.
// Then: python3 finish-flight.py → denoised frames, cut for wide and narrow screens, in public/flight.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { writeFile, mkdir, readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const mode = opt('mode', 'trace');
const n = Number(opt('n', '96'));
const w = opt('w', '1280');
const h = opt('h', '1280');
const spp = opt('spp', '40');
const bounces = opt('bounces', '3');
const tiles = opt('tiles', '1');
const band = opt('band', '0');
const bg = opt('bg', '');
const port = Number(opt('port', '5191'));
const out = resolve(opt('out', `out/flight-${mode}`));
const name = (i) => `${out}/${String(i).padStart(3, '0')}.png`;

let order = [];
for (let stride = 8; stride >= 1; stride /= 2) for (let i = 0; i < n; i += stride) if (!order.includes(i)) order.push(i);
if (!order.includes(n - 1)) order.splice(1, 0, n - 1); // the last view early too
order = [...new Set(order)];
if (opt('only')) order = opt('only').split(',').map(Number);
if (args.includes('--skip-done')) {
  const done = await Promise.all(order.map((i) => access(name(i)).then(() => true, () => false)));
  order = order.filter((_, k) => !done[k]);
}
if (!order.length) process.exit(0);

const CHROME =
  process.env.CHROME ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const server = await createServer({ root: import.meta.dirname, server: { port, strictPort: true, hmr: false, watch: null, fs: { allow: ['..'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader=false'],
});
await mkdir(out, { recursive: true });
const file = `${out}/poses.json`;
const poses = await readFile(file, 'utf8').then(JSON.parse, () => ({ n, w: Number(w), h: Number(h), frames: [] }));

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e.message));
  page.on('console', (m) => (m.type() === 'error' || m.text().startsWith('frame')) && console.error(m.text()));
  await page.exposeFunction('__save', async (i, dataUrl, kid) => {
    await writeFile(name(i), Buffer.from(dataUrl.split(',')[1], 'base64'));
    poses.frames[i] = { x: +kid.x.toFixed(5), y: +kid.y.toFixed(5), ppm: +kid.ppm.toFixed(2) };
    await writeFile(file, JSON.stringify(poses));
  });
  const query = new URLSearchParams({ mode, n, list: order.join(','), w, h, spp, bounces, tiles, band, bg });
  await page.goto(`http://localhost:${port}/flight.html?${query}`);
  await page.waitForFunction(() => window.__done === true, null, { timeout: 0, polling: 500 });
  console.log(`${order.length} frames → ${out} (${((await page.evaluate(() => window.__total)) / 1000).toFixed(1)} s)`);
} finally {
  await browser.close();
  await server.close();
}
