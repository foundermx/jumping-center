// Social card (public/og.jpg, 1200×630) and iOS icon (public/apple-touch-icon.png) from the
// site's own assets.   node og.mjs
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root).href;
const CHROME =
  process.env.CHROME ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const logo = await readFile(new URL('src/assets/brand/logo.svg', root), 'utf8');
const favicon = await readFile(new URL('public/favicon.svg', root), 'utf8');

const card = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: P; src: url(${file('src/assets/fonts/poppins-800.woff2')}); font-weight: 800; }
@font-face { font-family: P; src: url(${file('src/assets/fonts/poppins-600.woff2')}); font-weight: 600; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #f8f2ec; font-family: P; color: #101020; }
.logo { position: absolute; left: 64px; top: 52px; width: 210px; }
.logo svg { display: block; width: 100%; height: auto; }
h1 { position: absolute; left: 60px; top: 205px; margin: 0; font-size: 104px; line-height: .92; letter-spacing: -.045em; font-weight: 800; }
p { position: absolute; left: 66px; top: 452px; margin: 0; font-size: 26px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
p::before { content: ''; display: inline-block; width: 16px; height: 16px; margin-right: 12px; border-radius: 50% 50% 50% 0; background: #ccf82a; box-shadow: inset 0 0 0 4px #101020; rotate: -45deg; }
.park { position: absolute; right: -60px; top: 70px; width: 700px; }
.kid { position: absolute; right: 360px; top: 150px; width: 150px; }
.ring { position: absolute; right: -40px; top: 250px; width: 700px; height: 300px; border: 3px solid #a9d80c; border-radius: 50%; }
</style>
<div class="ring"></div>
<img class="park" src="${file('src/assets/renders/hero.webp')}">
<img class="kid" src="${file('src/assets/kid/kid-point.png')}">
<div class="logo">${logo}</div>
<h1>Salta sin<br>límites.</h1>
<p>Orizaba, Veracruz</p>`;

const icon = `<!doctype html><style>html,body{margin:0;width:180px;height:180px;overflow:hidden}svg{display:block;width:180px;height:180px}</style>${favicon.replace('rx="24"', 'rx="0"')}`;

// Local files (fonts need CORS) load only between file:// pages with this flag.
const browser = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const tmp = new URL('out/', import.meta.url);
await mkdir(tmp, { recursive: true });
await writeFile(new URL('og.html', tmp), card);
await page.goto(new URL('og.html', tmp).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL('public/og.jpg', root).pathname, type: 'jpeg', quality: 86 });
await page.setViewportSize({ width: 180, height: 180 });
await writeFile(new URL('icon.html', tmp), icon);
await page.goto(new URL('icon.html', tmp).href);
await page.screenshot({ path: new URL('public/apple-touch-icon.png', root).pathname });
await browser.close();
console.log('public/og.jpg, public/apple-touch-icon.png');
