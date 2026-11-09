// Renders shots to PNG with the real GPU.
//   node render.mjs <shot...> [--spp 600] [--scale 1] [--out ../src/assets/renders]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const [value] = args.splice(i, 2).slice(1);
  return value;
};
const spp = opt('spp', '600');
const scale = opt('scale', '1');
const rand = opt('rand', '1');
const out = resolve(opt('out', '../src/assets/renders'));
const shots = args;
if (!shots.length) throw new Error('usage: node render.mjs <shot...> [--spp N] [--scale S] [--out dir]');

const CHROME =
  process.env.CHROME ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const server = await createServer({ root: import.meta.dirname, server: { port: 5190, fs: { allow: ['..'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader=false'],
});
await mkdir(out, { recursive: true });

try {
  for (const shot of shots) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error(`[${shot}] ${e.message}`));
    page.on('console', (m) => (m.type() === 'error' || m.text().startsWith('progress') || m.text().startsWith('bvh')) && console.error(`[${shot}] ${m.text()}`));
    await page.goto(`http://localhost:5190/?shot=${shot}&spp=${spp}&scale=${scale}&rand=${rand}`);
    await page.waitForFunction(() => window.__done === true, null, { timeout: 0, polling: 500 });
    const stats = await page.evaluate(() => window.__stats);
    const dataUrl = await page.evaluate(() => window.__png());
    const file = `${out}/${shot}.png`;
    await writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`${shot}: ${stats.width}×${stats.height}, bvh ${stats.build} ms, total ${(stats.total / 1000).toFixed(1)} s → ${file}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
