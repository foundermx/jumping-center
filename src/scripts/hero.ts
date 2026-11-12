// The first scroll is a drone flight through the model: down from the hero view onto the
// trampolines, past the ninja course, low over the ball pit, then up and out to a last look at the
// whole park, after which the page carries on. The hero holds still for it (sticky, Hero.astro).
//
// The frames are path-traced from the very scene hero.webp was rendered from (art/src/flight.js),
// with the same camera to begin with: drawn on a canvas the size of the screen, the first one sits
// exactly on the picture, and the flight grows out of it. They come in coarse to fine and are
// decoded around wherever the flight is; until they are there, the picture itself zooms in.
// The mascot, a cut-out over the picture, is moved with the frames to where he stands in them.
//
// Between two frames the picture is not a cross-fade: with WebGL each frame is drawn as a mesh over
// the optical flow to the next one (art/flight-motion.py), every point sliding along its own path
// while the next frame slides in from the other end, so however slowly the page scrolls the flight
// moves, near things and far things each at their own speed. Without WebGL, a canvas 2D moves both
// frames by the camera's overall zoom and pan instead.
import { FLIGHT } from '../data/flight';
import { GRID, MOTION, QUARTER } from '../data/flight-motion';

const FILES = import.meta.glob<string>('../assets/flight/*/*.webp', { eager: true, query: '?url', import: 'default' });
const FLOWS = import.meta.glob<string>('../assets/flight/flow-*.bin', { eager: true, query: '?url', import: 'default' });

type Kind = keyof typeof FLIGHT.boxes;
type Map2 = { a: number; x: number; y: number }; // square px → canvas px: (a·X + x, a·Y + y)

const hero = document.querySelector<HTMLElement>('.hero');
const stage = hero?.querySelector<HTMLElement>('.hero__stage');
const art = hero?.querySelector<HTMLElement>('.hero__art');
const canvas = hero?.querySelector<HTMLCanvasElement>('.hero__flight');
const gl = canvas?.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }) ?? null;
const ctx = gl ? null : canvas?.getContext('2d');
const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
const slow = connection?.saveData || /2g$/.test(connection?.effectiveType ?? '');

if (hero && stage && art && canvas && (gl || ctx) && 'createImageBitmap' in window && !slow && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
    forget();
    flow = null;
    if (gl) {
      // the frames' flow, a little file: until it is in, frames move by the overall zoom and pan
      fetch(FLOWS[`../assets/flight/flow-${next}.bin`])
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .then((data) => {
          if (mine !== batch || !data || data.byteLength !== (N - 1) * GRID * GRID * 4) return;
          flow = new Int16Array(data);
          request();
        })
        .catch(() => {});
    }
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

  /** Frame `j` moved `u` of the way along the camera's path to the next frame (back toward the one
   *  before, for u < 0): a zoom and a pan, in the frames' own px (see art/flight-motion.py). */
  function step(j: number, u: number): Map2 {
    const q = u >= 0 ? j : j - 1;
    const v = Math.abs(u);
    if (!v || q < 0 || q > N - 2) return { a: 1, x: 0, y: 0 };
    let [s, tx, ty] = MOTION[kind].slice(q * 3, q * 3 + 3);
    if (u < 0) [s, tx, ty] = [1 / s, -tx / s, -ty / s];
    return { a: 1 + (s - 1) * v, x: tx * v, y: ty * v };
  }
  /** `n`, then `m`. */
  const then = (m: Map2, n: Map2): Map2 => ({ a: m.a * n.a, x: m.a * n.x + m.x, y: m.a * n.y + m.y });

  /** Per frame, where the first one's px are in it: all the camera's steps up to there. */
  const chains = new Map<Kind, Map2[]>();
  function chain(i: number) {
    let all = chains.get(kind);
    if (!all) {
      all = [{ a: 1, x: 0, y: 0 }];
      for (let j = 0; j < N - 1; j++) all.push(then(step(j, 1), all[j]));
      chains.set(kind, all);
    }
    return all[i];
  }

  /** The decoded frame nearest to `f`, if any is within 10 frames. */
  function nearest(f: number): [Frame, number] | null {
    for (let d = 1; d <= 10; d++) {
      for (const j of [Math.round(f) - d, Math.round(f) + d]) {
        const near = bitmaps.get(j);
        if (near) return [near, j];
      }
    }
    return null;
  }

  /** Draws the flight at frame position `f`: where it put the mascot's frames and the first frame
   *  (the picture), or null if no frame near it is decoded yet. */
  function paint(f: number, t: number): { m: Map2; m0: Map2 } | null {
    const i = Math.min(Math.floor(f), N - 2);
    const u = f - i;
    const base = placement(t);
    const m0 = then(then(base, step(i, u)), chain(i)); // the first frame, carried along to here
    if (gl) return paintGL(f, i, u, base, m0);
    // Between two frames both move along the camera's path, this one on toward the next and the
    // next in from where this one stands, while one fades into the other all the way across: however
    // slowly the page scrolls, the picture keeps moving (frames that held still and then crossed
    // quickly read as a stutter), and the two line up as they cross.
    const w = smooth(0, 1, u);
    const mA = fit(then(base, step(i, u)), i);
    const mB = fit(then(base, step(i + 1, u - 1)), i + 1);
    let a = bitmaps.get(i);
    let b = w > 0.002 ? bitmaps.get(i + 1) : undefined;
    let ia = i;
    let ma = mA;
    if (!a && b) [a, ia, ma, b] = [b, i + 1, mB, undefined];
    if (!a) {
      const near = nearest(f);
      if (!near) return null;
      [a, ia] = near;
      ma = fit(base, ia);
    }
    const m = mix(mA, mB, u); // where the mascot is: between where the two frames have him
    if (drawn === f) return { m, m0 };
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, W, H);
    const blit = (bitmap: Frame, j: number, at: Map2) => {
      const [bx, by, bw, bh] = box(kind, j);
      ctx!.drawImage(bitmap, at.a * bx + at.x, at.a * by + at.y, at.a * bw, at.a * bh);
    };
    // a cross-fade: (1 − w)·A + w·B, added up in premultiplied colour
    ctx!.globalCompositeOperation = 'source-over';
    ctx!.globalAlpha = b ? 1 - w : 1;
    blit(a, ia, ma);
    if (b) {
      ctx!.globalCompositeOperation = 'lighter';
      ctx!.globalAlpha = w;
      blit(b, i + 1, mB);
    }
    ctx!.globalCompositeOperation = 'source-over';
    ctx!.globalAlpha = 1;
    drawn = f;
    return { m, m0 };
  }

  /* ---------------------------------------------------------------- WebGL: frames as meshes */

  let flow: Int16Array | null = null; // per pair of frames, where each grid point of the first is in the next
  const SIDE = GRID + 2; // the grid over a frame, and a ring around it so its edges never show
  const RING = 0.3; // how far out the ring lies, of the frame's size
  const textures = new Map<number, WebGLTexture>(); // the last frames drawn, by frame: none uploaded twice
  let program: WebGLProgram | null = null;
  const vertices = new Float32Array(SIDE * SIDE * 6); // per point: where on the canvas, where in frame A, in frame B
  let uniforms: { view: WebGLUniformLocation | null; w: WebGLUniformLocation | null } = { view: null, w: null };

  /** The move of grid point (gx, gy) of frame i to frame i + 1, square px; `x`, `y` is where it is. */
  function move(i: number, gx: number, gy: number, x: number, y: number): [number, number] {
    if (flow) {
      const k = ((i * GRID + gy) * GRID + gx) * 2;
      return [flow[k] / QUARTER, flow[k + 1] / QUARTER];
    }
    const [s, tx, ty] = MOTION[kind].slice(i * 3, i * 3 + 3);
    return [(s - 1) * x + tx, (s - 1) * y + ty];
  }

  function setup() {
    const g = gl!;
    const shader = (type: number, source: string) => {
      const s = g.createShader(type)!;
      g.shaderSource(s, source);
      g.compileShader(s);
      return s;
    };
    const p = g.createProgram()!;
    g.attachShader(p, shader(g.VERTEX_SHADER, 'attribute vec2 p,a,b;uniform vec2 view;varying vec2 va,vb;void main(){va=a;vb=b;gl_Position=vec4(p.x/view.x*2.0-1.0,1.0-p.y/view.y*2.0,0.0,1.0);}'));
    // in highp where it exists: a mediump place in a 1280 px frame is off by a pixel or more
    g.attachShader(p, shader(g.FRAGMENT_SHADER, '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nuniform sampler2D A,B;uniform float w;varying vec2 va,vb;void main(){gl_FragColor=mix(texture2D(A,va),texture2D(B,vb),w);}'));
    g.linkProgram(p);
    g.useProgram(p);
    program = p;
    uniforms = { view: g.getUniformLocation(p, 'view'), w: g.getUniformLocation(p, 'w') };
    g.uniform1i(g.getUniformLocation(p, 'A'), 0);
    g.uniform1i(g.getUniformLocation(p, 'B'), 1);
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ARRAY_BUFFER, vertices.byteLength, g.DYNAMIC_DRAW);
    ['p', 'a', 'b'].forEach((name, n) => {
      const loc = g.getAttribLocation(p, name);
      g.enableVertexAttribArray(loc);
      g.vertexAttribPointer(loc, 2, g.FLOAT, false, 24, n * 8);
    });
    const quads: number[] = [];
    for (let r = 0; r < SIDE - 1; r++) {
      for (let c = 0; c < SIDE - 1; c++) {
        const k = r * SIDE + c;
        quads.push(k, k + 1, k + SIDE, k + 1, k + SIDE + 1, k + SIDE);
      }
    }
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ELEMENT_ARRAY_BUFFER, new Uint16Array(quads), g.STATIC_DRAW);
    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    g.clearColor(0, 0, 0, 0);
  }

  function forget() {
    textures.forEach((texture) => gl?.deleteTexture(texture));
    textures.clear();
  }

  /** Frame i's texture, uploaded the first time it is drawn; the six last drawn are kept. */
  function texture(i: number, frame: Frame) {
    const g = gl!;
    let t = textures.get(i);
    if (t) {
      textures.delete(i);
    } else {
      t = g.createTexture()!;
      g.bindTexture(g.TEXTURE_2D, t);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, frame);
      while (textures.size >= 6) {
        const [old, gone] = textures.entries().next().value!;
        g.deleteTexture(gone);
        textures.delete(old);
      }
    }
    textures.set(i, t);
    return t;
  }

  /**
   * The GL side of paint(): frame i, `u` of the way to the next. Every grid point of frame i goes
   * `u` of its way to where it is in frame i + 1, showing frame i there and frame i + 1 from where it
   * ends up, the two mixed by u. At u = 0 that is frame i as it is, at u = 1 frame i + 1 as it is.
   */
  function paintGL(f: number, i: number, u: number, base: Map2, m0: Map2): { m: Map2; m0: Map2 } | null {
    const g = gl!;
    if (g.isContextLost()) return null;
    let a = bitmaps.get(i);
    let b = bitmaps.get(i + 1);
    let ia = i;
    let ib = i + 1;
    let uu = u;
    let w = u;
    // where the pair is drawn: the frames' own fits, from this one's to the next one's
    let m = mix(fit(base, i), fit(base, i + 1), u);
    if (!a && !b) {
      const near = nearest(f);
      if (!near) return null;
      [a, ia] = near;
      [b, ib, uu, w, m] = [undefined, ia, 0, 0, fit(base, ia)];
    } else if (!a) w = 1;
    else if (!b) w = 0;
    if (drawn === f) return { m, m0 };
    if (!program) setup();

    const [ax, ay, aw, ah, cuts] = box(kind, ia);
    const [bx, by, bw, bh] = box(kind, ib);
    // the ring reaches out only past the sides where the picture goes on (its edge stretched out
    // there); past the others it is nothing, as the frame's own empty margin would be
    const [left, top, right, bottom] = [1, 2, 4, 8].map((side) => (cuts & side ? RING : 0));
    let n = 0;
    for (let r = 0; r < SIDE; r++) {
      const gy = Math.min(Math.max(r - 1, 0), GRID - 1);
      const ey = r === 0 ? -top : r === SIDE - 1 ? 1 + bottom : gy / (GRID - 1);
      for (let c = 0; c < SIDE; c++) {
        const gx = Math.min(Math.max(c - 1, 0), GRID - 1);
        const ex = c === 0 ? -left : c === SIDE - 1 ? 1 + right : gx / (GRID - 1);
        const x = ax + ex * aw;
        const y = ay + ey * ah;
        const [dx, dy] = uu ? move(ia, gx, gy, ax + (gx / (GRID - 1)) * aw, ay + (gy / (GRID - 1)) * ah) : [0, 0];
        vertices[n++] = m.a * (x + uu * dx) + m.x;
        vertices[n++] = m.a * (y + uu * dy) + m.y;
        vertices[n++] = ex;
        vertices[n++] = ey;
        vertices[n++] = (x + dx - bx) / bw;
        vertices[n++] = (y + dy - by) / bh;
      }
    }
    g.viewport(0, 0, canvas!.width, canvas!.height);
    g.clear(g.COLOR_BUFFER_BIT);
    g.uniform2f(uniforms.view, W, H);
    g.uniform1f(uniforms.w, w);
    const ta = a && texture(ia, a);
    const tb = b && texture(ib, b);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, (ta || tb)!);
    g.activeTexture(g.TEXTURE1);
    g.bindTexture(g.TEXTURE_2D, (tb || ta)!);
    g.bufferSubData(g.ARRAY_BUFFER, 0, vertices);
    g.drawElements(g.TRIANGLES, (SIDE - 1) * (SIDE - 1) * 6, g.UNSIGNED_SHORT, 0);
    drawn = f;
    return { m, m0 };
  }

  if (gl) {
    canvas.addEventListener('webglcontextlost', (event) => event.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => {
      program = null;
      textures.clear();
      request();
    });
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
    const m = live?.m ?? fit(placement(p), 0);
    // the canvas takes over from the picture during the first steps (the same image there)
    const goal = live && p > 0 ? smooth(0, 0.035, p) : 0;
    shown = dt ? shown + (goal - shown) * (1 - Math.exp(-dt * 14)) : goal;
    if (Math.abs(goal - shown) < 0.002) shown = goal;
    put(canvas, 'opacity', live && p > 0 ? '1' : '0');

    // the picture is frame 0: it rides along with the frames while they take over, where the camera
    // has carried it, so the two line up as one fades into the other (scaled about its box's centre,
    // where the entrance animation scales it too); long gone after START, it just goes with them
    const m0 = live && p < START ? live.m0 : m;
    const s = m0.a / start.a;
    put(park, 'scale', n3(s));
    put(park, 'translate', `${px(m0.a * hx0 + m0.x - (picture.cx + s * (picture.x - picture.cx)))} ${px(m0.a * hy0 + m0.y - (picture.cy + s * (picture.y - picture.cy)))}`);
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
    // a frame's time can be from before it was asked for: never a step back (it would overshoot)
    const dt = Math.min(Math.max(time - before, 0) / 1000, 0.05);
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
  const img = park instanceof HTMLImageElement ? park : park?.querySelector('img'); // <Picture> puts the class on the <img>
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
