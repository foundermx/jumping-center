// The first scroll is a drone flight through the model: down from the hero view onto the
// trampolines, past the ninja course, low over the ball pit, then up and out to a last look at the
// whole park, after which the page carries on. The hero holds still for it (sticky, Hero.astro).
//
// The frames are path-traced from the very scene hero.webp was rendered from (art/src/flight.js),
// with the same camera to begin with: drawn on a canvas the size of the screen, the first one sits
// exactly on the picture, and the flight grows out of it. They come in coarse to fine and are
// decoded around wherever the flight is; until they are there, the picture itself zooms in.
// The mascot, a cut-out over the picture, is moved with the frames to where he stands in them.
import { FLIGHT } from '../data/flight';

const FILES = import.meta.glob<string>('../assets/flight/*/*.webp', { eager: true, query: '?url', import: 'default' });

type Kind = keyof typeof FLIGHT.boxes;
type Map2 = { a: number; x: number; y: number }; // square px → canvas px: (a·X + x, a·Y + y)

const hero = document.querySelector<HTMLElement>('.hero');
const stage = hero?.querySelector<HTMLElement>('.hero__stage');
const art = hero?.querySelector<HTMLElement>('.hero__art');
const canvas = hero?.querySelector<HTMLCanvasElement>('.hero__flight');
const ctx = canvas?.getContext('2d');
const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
const slow = connection?.saveData || /2g$/.test(connection?.effectiveType ?? '');

if (hero && stage && art && canvas && ctx && 'createImageBitmap' in window && !slow && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  hero.classList.add('is-flying'); // the room to scroll through, and the pin (Hero.astro)

  const park = hero.querySelector<HTMLElement>('.hero__park');
  const copy = hero.querySelector<HTMLElement>('.hero__copy');
  const hint = hero.querySelector<HTMLElement>('.hint');
  const orbit = hero.querySelector<SVGElement>('.hero__orbit');
  const kid = hero.querySelector<HTMLElement>('.hero__kid');
  const cubes = [...hero.querySelectorAll<HTMLElement>('.cube')];

  const N = FLIGHT.frames;
  /** By here the frame covers the screen; from END it settles on the last view (see finish-flight.py). */
  const START = 0.17;
  const END = 0.84;
  const [hx0, hy0, hx1, hy1] = FLIGHT.hero;

  const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
  const smooth = (a: number, b: number, v: number) => {
    const t = clamp01((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const box = (kind: Kind, i: number) => FLIGHT.boxes[kind].slice(i * 5, i * 5 + 5) as number[];

  /* ---------------------------------------------------------------- frames */

  type Frame = ImageBitmap | HTMLImageElement;

  let kind: Kind = 'wide';
  let files: (Blob | undefined)[] = [];
  const bitmaps = new Map<number, Frame>();
  const decoding = new Set<number>();
  let batch = 0;

  /** Coarse to fine, the first and the last view first: a flight half loaded still plays. */
  const ORDER = [0, N - 1];
  for (let stride = 8; stride >= 1; stride /= 2) for (let i = 0; i < N; i += stride) if (!ORDER.includes(i)) ORDER.push(i);

  // Safari (and every browser on iOS) decodes createImageBitmap(blob) on the main thread, a stall for
  // each frame in the middle of the flight, and each bitmap it makes is 4 MB its garbage collector
  // must come back for, now and then in one long pause. So there the frames are decoded by a few
  // <img>s, off the main thread, and drawn straight from them, the same few over and over: nothing
  // left behind to collect. Elsewhere createImageBitmap(blob) is off the main thread already.
  const ua = navigator.userAgent;
  const webkit = /AppleWebKit/.test(ua) && !/(Chrome|Chromium|Edg)\//.test(ua);
  const spare: HTMLImageElement[] = [];

  async function decode(blob: Blob): Promise<Frame> {
    if (!webkit) return createImageBitmap(blob);
    const img = spare.pop() ?? new Image();
    const url = URL.createObjectURL(blob);
    img.src = url;
    try {
      await img.decode();
      return img;
    } catch (error) {
      spare.push(img);
      throw error;
    } finally {
      URL.revokeObjectURL(url); // the <img> holds the file now
    }
  }

  function release(frame: Frame) {
    if (frame instanceof HTMLImageElement) spare.push(frame);
    else frame.close();
  }

  let picked = false; // fetching may begin (once the picture itself is in)

  function load(next: Kind) {
    kind = next;
    if (!picked) return;
    const mine = ++batch;
    files = new Array(N);
    bitmaps.forEach(release);
    bitmaps.clear();
    decoding.clear();
    let k = 0;
    const fetchNext = async (): Promise<void> => {
      while (k < ORDER.length && mine === batch) {
        const i = ORDER[k++];
        const url = FILES[`../assets/flight/${next}/${String(i).padStart(3, '0')}.webp`];
        try {
          const response = await fetch(url, { priority: k > 12 ? 'low' : 'auto' } as RequestInit);
          const blob = response.ok ? await response.blob() : undefined;
          if (mine !== batch) return;
          files[i] = blob;
          want();
        } catch {
          /* that frame is skipped: its neighbours stand in */
        }
      }
    };
    for (let lane = 0; lane < 4; lane++) fetchNext();
  }

  /** Decodes the frames around where the flight is, mostly those it is heading for (nearest first),
   *  and lets go of the ones it has left behind. */
  function want() {
    const at = Math.round(Math.max(now, 0) * (N - 1));
    const on = goal >= now ? 1 : -1;
    const keep = (i: number) => (i - at) * on <= 10 && (at - i) * on <= 3;
    for (const [i, bitmap] of bitmaps) {
      if (keep(i) || i === 0 || i === N - 1) continue;
      release(bitmap);
      bitmaps.delete(i);
    }
    const mine = batch;
    const next = [at, at + on, 0, at + 2 * on, at - on, N - 1];
    for (let d = 3; d <= 10; d++) next.push(at + d * on);
    for (const i of next) {
      if (decoding.size >= 4) break;
      const blob = files[i];
      if (!blob || bitmaps.has(i) || decoding.has(i)) continue;
      decoding.add(i);
      decode(blob).then(
        (bitmap) => {
          decoding.delete(i);
          if (mine !== batch || !(keep(i) || i === 0 || i === N - 1)) return release(bitmap);
          bitmaps.set(i, bitmap);
          want();
          request();
        },
        () => decoding.delete(i),
      );
    }
  }

  /* ---------------------------------------------------------------- geometry */

  let W = 1; // canvas, CSS px: the screen below the header
  let H = 1;
  let dpr = 1;
  let pre = 0; // scroll before the stage pins (a stage taller than the screen pins by its bottom)
  let travel = 1; // scroll the flight takes
  let start: Map2 = { a: 1, x: 0, y: 0 }; // frame 0 lying exactly on the picture
  let cover: Map2 = start; // the frame's cut covering the canvas
  let end: Map2 = start; // the last view, centred and as big as fits
  let picture = { x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0 }; // its content box in the canvas, and its box's centre
  let kid0 = { x: 0, y: 0, ppm: 1 };
  let spread: { x: number; y: number }[] = [];

  function measure() {
    const header = document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 72;
    const vw = document.documentElement.clientWidth;
    W = vw;
    H = Math.max(1, innerHeight - header);
    // at least the screen below the header, so the page after it can't show before the flight ends
    stage!.style.minHeight = `${Math.ceil(H)}px`;
    // a stage much taller than that (a phone on its side) pins by its bottom; a few px more and it
    // just pins under the header, its bottom padding past the screen
    const tall = stage!.offsetHeight;
    const top = tall - H > 48 ? innerHeight - tall : header;
    stage!.style.top = `${top}px`;
    const heroTop = hero!.getBoundingClientRect().top + scrollY;
    pre = Math.max(0, heroTop - top);
    travel = Math.max(1, hero!.offsetHeight - tall);

    // where the art box is while pinned: the canvas inside it is placed over the whole screen
    const a = art!.getBoundingClientRect();
    const pinnedTop = top + (a.top - stage!.getBoundingClientRect().top);
    canvas!.style.left = `${-a.left}px`;
    canvas!.style.top = `${header - pinnedTop}px`;
    canvas!.style.width = `${W}px`;
    canvas!.style.height = `${H}px`;

    // the picture is drawn `contain` in the art box
    const ratio = (hx1 - hx0) / (hy1 - hy0);
    const w = Math.min(a.width, a.height * ratio);
    const h = w / ratio;
    picture = { x: a.left + (a.width - w) / 2, y: pinnedTop - header + (a.height - h) / 2, w, h, cx: a.left + a.width / 2, cy: pinnedTop - header + a.height / 2 };

    const next: Kind = W >= H ? 'wide' : 'narrow';
    start = { a: w / (hx1 - hx0), x: 0, y: 0 };
    start.x = picture.x - start.a * hx0;
    start.y = picture.y - start.a * hy0;
    const [cx, cy, cw, ch] = FLIGHT.crop[next];
    const ca = Math.max(W / cw, H / ch);
    cover = { a: ca, x: W / 2 - ca * (cx + cw / 2), y: H / 2 - ca * (cy + ch / 2) };
    // as sharp as the frames are when they cover the screen, and no sharper: every px drawn costs
    dpr = Math.min(Math.max(1, (FLIGHT.scale[next] / ca) * 1.15), devicePixelRatio || 1, 2);
    canvas!.width = Math.round(W * dpr);
    canvas!.height = Math.round(H * dpr);
    const [lx0, ly0, lx1, ly1] = FLIGHT.last;
    const ea = Math.min((W * (next === 'wide' ? 0.94 : 1)) / (lx1 - lx0), (H * 0.84) / (ly1 - ly0));
    end = { a: ea, x: W / 2 - (ea * (lx0 + lx1)) / 2, y: H * 0.54 - (ea * (ly0 + ly1)) / 2 };

    kid0 = pose(0);
    // the cubes fly outwards from the middle of the picture, as if passing the drone
    const mx = a.left + a.width / 2;
    const my = a.top + a.height / 2;
    spread = cubes.map((cube) => {
      put(cube, 'translate', '');
      put(cube, 'scale', '');
      const r = cube.getBoundingClientRect();
      return { x: r.left + r.width / 2 - mx, y: r.top + r.height / 2 - my };
    });

    if (next !== kind || (picked && !files.length)) load(next);
    kind = next;
    drawn = -1;
  }

  const map = (m: Map2, p: { x: number; y: number }) => ({ x: m.a * p.x + m.x, y: m.a * p.y + m.y });
  const mix = (m: Map2, n: Map2, w: number): Map2 => ({ a: m.a + (n.a - m.a) * w, x: m.x + (n.x - m.x) * w, y: m.y + (n.y - m.y) * w });

  /** Where the frames are drawn at `t`: off the picture, then covering the screen, then the last view. */
  function placement(t: number) {
    return mix(mix(cover, start, 1 - smooth(0, START, t)), end, smooth(END, 1, t));
  }

  /** Keeps the sides of frame `i` that cut through the picture beyond the edges of the canvas. */
  function fit(m: Map2, i: number): Map2 {
    const [bx, by, bw, bh, cuts] = box(kind, i);
    let { a, x, y } = m;
    const edges = () => [a * bx + x, a * by + y, a * (bx + bw) + x, a * (by + bh) + y];
    let [L, T, R, B] = edges();
    let grow = 1;
    if (cuts & 1 && cuts & 4 && R - L < W) grow = Math.max(grow, W / (R - L));
    if (cuts & 2 && cuts & 8 && B - T < H) grow = Math.max(grow, H / (B - T));
    if (grow > 1) {
      a *= grow;
      x = W / 2 - (W / 2 - x) * grow;
      y = H / 2 - (H / 2 - y) * grow;
      [L, T, R, B] = edges();
    }
    if (cuts & 1 && L > 0) x -= L;
    else if (cuts & 4 && R < W) x += W - R;
    if (cuts & 2 && T > 0) y -= T;
    else if (cuts & 8 && B < H) y += H - B;
    return { a, x, y };
  }

  /** The mascot's feet in frame `f` (fractional), square px, and px per metre there. */
  function pose(f: number) {
    const i = Math.min(Math.floor(f), N - 2);
    const w = f - i;
    const k = FLIGHT.kid;
    const at = (j: number, c: number) => k[j * 3 + c];
    const ppmA = at(i, 2);
    const ppmB = at(i + 1, 2);
    if (!ppmA || !ppmB) return { x: 0, y: 0, ppm: 0 }; // behind the drone
    return { x: at(i, 0) + (at(i + 1, 0) - at(i, 0)) * w, y: at(i, 1) + (at(i + 1, 1) - at(i, 1)) * w, ppm: ppmA + (ppmB - ppmA) * w };
  }

  /* ---------------------------------------------------------------- drawing */

  let drawn = -1; // the flight position on the canvas, -1: nothing
  let shown = 0; // how much the canvas has taken over from the picture (glides)

  /** Draws the flight at frame position `f`; false if no frame near it is decoded yet. */
  function paint(f: number, t: number): Map2 | null {
    const i = Math.min(Math.floor(f), N - 2);
    // each frame shows on its own most of the way to the next, then a quick cross-fade: a still
    // scroll never rests on two frames at once
    const w = smooth(0.2, 0.8, f - i);
    let a = bitmaps.get(i);
    let b = w > 0.002 ? bitmaps.get(i + 1) : undefined;
    let ia = i;
    let ib = i + 1;
    if (!a && b) [a, ia, b] = [b, i + 1, undefined];
    if (!a) {
      for (let d = 1; d <= 10 && !a; d++) {
        for (const j of [Math.round(f) - d, Math.round(f) + d]) {
          const near = bitmaps.get(j);
          if (near) [a, ia] = [near, j];
        }
      }
      if (!a) return null;
    }
    const base = placement(t);
    const m = b ? mix(fit(base, ia), fit(base, ib), w) : fit(base, ia);
    if (drawn === f) return m;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, W, H);
    const blit = (bitmap: Frame, j: number) => {
      const [bx, by, bw, bh] = box(kind, j);
      ctx!.drawImage(bitmap, m.a * bx + m.x, m.a * by + m.y, m.a * bw, m.a * bh);
    };
    // a cross-fade: (1 − w)·A + w·B, added up in premultiplied colour
    ctx!.globalCompositeOperation = 'source-over';
    ctx!.globalAlpha = b ? 1 - w : 1;
    blit(a, ia);
    if (b) {
      ctx!.globalCompositeOperation = 'lighter';
      ctx!.globalAlpha = w;
      blit(b, ib);
    }
    ctx!.globalCompositeOperation = 'source-over';
    ctx!.globalAlpha = 1;
    drawn = f;
    return m;
  }

  /** Sets a style only when it changes: most of the hero is still most of the time. */
  const styles = new WeakMap<Element, Map<string, string>>();
  function put(el: HTMLElement | SVGElement | null | undefined, prop: string, value: string) {
    if (!el) return;
    let known = styles.get(el);
    if (!known) styles.set(el, (known = new Map()));
    if (known.get(prop) === value) return;
    known.set(prop, value);
    el.style.setProperty(prop, value);
  }
  const n3 = (v: number) => v.toFixed(3);
  const px = (v: number) => `${v.toFixed(1)}px`;

  function apply(p: number, dt: number) {
    const f = p * (N - 1);
    // drawn even at rest, unseen under the picture: the first scroll finds it ready to show
    const live = paint(f, p);
    const m = live ?? fit(placement(p), 0);
    // the canvas takes over from the picture during the first steps (the same image there)
    const goal = live && p > 0 ? smooth(0, 0.035, p) : 0;
    shown = dt ? shown + (goal - shown) * (1 - Math.exp(-dt * 14)) : goal;
    if (Math.abs(goal - shown) < 0.002) shown = goal;
    put(canvas, 'opacity', live && p > 0 ? '1' : '0');

    // the picture is frame 0: it rides along with the frames while they take over (scaled about
    // its box's centre, where the entrance animation scales it too)
    const s = m.a / start.a;
    put(park, 'scale', n3(s));
    put(park, 'translate', `${px(m.a * hx0 + m.x - (picture.cx + s * (picture.x - picture.cx)))} ${px(m.a * hy0 + m.y - (picture.cy + s * (picture.y - picture.cy)))}`);
    put(park, 'opacity', n3(1 - shown));

    put(copy, 'opacity', n3(1 - smooth(0, 0.09, p)));
    put(copy, 'translate', `0 ${px(-44 * smooth(0, 0.12, p))}`);
    put(copy, 'pointer-events', p > 0.04 ? 'none' : '');
    put(copy, 'visibility', p >= 0.09 ? 'hidden' : ''); // and no focus on what can't be seen
    put(hint, 'opacity', n3(1 - smooth(0, 0.05, p)));
    put(orbit, 'opacity', n3(1 - smooth(0, 0.09, p)));
    put(orbit, 'scale', n3(1 + 0.25 * smooth(0, 0.12, p)));
    const fly = smooth(0, 0.16, p);
    cubes.forEach((cube, i) => {
      put(cube, 'translate', `${px(spread[i].x * fly)} ${px(spread[i].y * fly)}`);
      put(cube, 'scale', n3(1 + 1.4 * fly));
      put(cube, 'opacity', n3(1 - smooth(0.06, 0.16, p)));
    });

    if (kid) {
      const k = pose(f);
      const here = map(m, k);
      const rest = map(start, kid0);
      const size = k.ppm ? (k.ppm * m.a) / (kid0.ppm * start.a) : 0;
      const near = k.ppm / kid0.ppm; // how much closer the drone is to him than at the start
      const inView = here.x > -200 && here.x < W + 200 && here.y > -50 && here.y < H + 600;
      // he is a giant cut-out next to the drone: he steps out of the picture as it comes close, and
      // is back on his bed when it looks at the whole park again
      const seen = size && inView ? 1 - smooth(1.15, 1.45, near) : 0;
      put(kid, 'opacity', n3(seen));
      if (seen > 0) {
        put(kid, 'translate', `calc(-50% + ${px(here.x - rest.x)}) calc(-97% + ${px(here.y - rest.y)})`);
        put(kid, 'scale', n3(size));
      }
    }
    return shown !== goal;
  }

  /* ---------------------------------------------------------------- scroll */

  let goal = 0;
  let now = -1;
  let raf = 0;
  let before = 0;

  function frame(time: number) {
    const dt = Math.min((time - before) / 1000, 0.05);
    before = time;
    // follows the scroll with a short lag, so it glides instead of stepping with each wheel notch
    now = now < 0 ? goal : now + (goal - now) * (1 - Math.exp(-dt * 8));
    if (Math.abs(goal - now) < 0.0002) now = goal;
    want();
    const gliding = apply(now, dt);
    raf = now !== goal || gliding ? requestAnimationFrame(frame) : 0;
  }

  function request() {
    drawn = -1;
    if (raf) return;
    before = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function update() {
    goal = clamp01((scrollY - pre) / travel);
    if (goal !== now) request();
  }

  let queued = 0;
  const remeasure = () => {
    queued = 0;
    measure();
    update();
    request();
  };
  const later = () => (queued ||= requestAnimationFrame(remeasure));
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', later);
  // the header grows when its logo arrives, the stage when the fonts do
  const header = document.querySelector('.site-header');
  const resized = new ResizeObserver(later);
  for (const el of [header, stage, art]) if (el) resized.observe(el);
  remeasure();

  // the frames wait for the picture: it is what the page paints first
  const img = park?.querySelector('img');
  const begin = () => {
    picked = true;
    load(kind);
  };
  if (!img || img.complete) begin();
  else {
    img.addEventListener('load', begin, { once: true });
    img.addEventListener('error', begin, { once: true });
  }
}

export {}; // a module: its names stay its own
