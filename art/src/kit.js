// Shared materials and builders for every shot. Units: metres, y up.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import logoUrl from '../../src/assets/brand/logo.svg?url';

export { THREE };

/** Brand colours as they should read after tone mapping (slightly calmer than the screen hexes). */
export const C = {
  lime: '#bff01a',
  limeDeep: '#9fd10e',
  blue: '#1d37d2',
  royal: '#0b2394',
  navy: '#111a5e',
  ink: '#101020',
  bed: '#141417',
  wall: '#f3f2ee',
  floor: '#c4c7cd',
  cream: '#f8f2ec',
};

// No clearcoat anywhere: three-gpu-pathtracer 0.0.28 renders clearcoated surfaces black on this GPU.
const vinyl = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.36, ...extra });

export const M = {
  lime: vinyl(C.lime),
  blue: vinyl(C.blue),
  royal: vinyl(C.royal),
  navy: vinyl(C.navy),
  bed: new THREE.MeshStandardMaterial({ color: C.bed, roughness: 0.42 }),
  floor: new THREE.MeshStandardMaterial({ color: C.floor, roughness: 0.3 }),
  wall: new THREE.MeshStandardMaterial({ color: C.wall, roughness: 0.92 }),
  white: new THREE.MeshStandardMaterial({ color: '#f7f7f5', roughness: 0.6 }),
  grey: new THREE.MeshStandardMaterial({ color: '#8d9099', roughness: 0.5, metalness: 0.2 }),
  steel: new THREE.MeshStandardMaterial({ color: '#e9eaee', roughness: 0.35, metalness: 0.6 }),
  steelBlue: new THREE.MeshStandardMaterial({ color: C.blue, roughness: 0.28, metalness: 0.3 }),
  rope: new THREE.MeshStandardMaterial({ color: '#efe6cf', roughness: 0.85 }),
  black: new THREE.MeshStandardMaterial({ color: '#1a1a1e', roughness: 0.5 }),
  // Emissive surfaces are hit only by chance (not light-sampled): keep them dim or they speckle the whole frame.
  // The real light comes from the RectAreaLight under each strip.
  glow: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.25 }),
  sky: new THREE.MeshStandardMaterial({ color: '#e9f1fb', roughness: 0.12 }),
};

export const vinylMat = vinyl;

const boxCache = new Map();
/** Rounded box, geometry cached by size so repeated pads share one buffer. */
export function rbox(w, h, d, r = 0.04, material = M.lime, segments = 4) {
  const key = [w, h, d, r, segments].join();
  let geo = boxCache.get(key);
  if (!geo) {
    geo = new RoundedBoxGeometry(w, h, d, segments, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
    geo.clearGroups(); // per-face groups would index into the path tracer's global material list
    boxCache.set(key, geo);
  }
  return new THREE.Mesh(geo, material);
}

export function box(w, h, d, material) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.clearGroups();
  return new THREE.Mesh(geo, material);
}

export function at(object, x = 0, y = 0, z = 0, ry = 0) {
  object.position.set(x, y, z);
  object.rotation.y = ry;
  return object;
}

/** Cylinder between two points (tubes, bars, ropes). */
export function rod(a, b, radius, material, radial = 16) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, radial, 1), material);
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return mesh;
}

/** Deterministic random so every render of a shot is identical. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Trampoline court: `cols × rows` beds of `cell` metres, lime rails between them,
 * blue squares where rails cross, on a platform `height` tall. Origin at the court centre, floor level.
 */
export function court({ cols = 3, rows = 2, cell = 2.4, rail = 0.5, height = 0.5, blueEdges = true, skirt = M.grey } = {}) {
  const g = new THREE.Group();
  const W = cols * cell + (cols + 1) * rail;
  const D = rows * cell + (rows + 1) * rail;
  const top = height;
  const padH = 0.22;
  const padY = top - 0.08 + padH / 2;

  const base = rbox(W, top - 0.12, D, 0.03, skirt);
  base.position.y = (top - 0.12) / 2;
  g.add(base);

  const x0 = -W / 2;
  const z0 = -D / 2;

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cx = x0 + rail + i * (cell + rail) + cell / 2;
      const cz = z0 + rail + j * (cell + rail) + cell / 2;
      g.add(at(box(cell + 0.1, 0.03, cell + 0.1, M.bed), cx, top - 0.06, cz));
    }
  }
  // rails along x (between rows) and along z (between cols); blue squares where they cross
  for (let j = 0; j <= rows; j++) {
    const z = z0 + j * (cell + rail) + rail / 2;
    const edge = j === 0 || j === rows;
    for (let i = 0; i < cols; i++) {
      const x = x0 + rail + i * (cell + rail) + cell / 2;
      const m = edge && blueEdges && (i + j) % 2 === 0 ? M.blue : M.lime;
      g.add(at(rbox(cell + 0.04, padH, rail, 0.07, m), x, padY, z));
    }
  }
  for (let i = 0; i <= cols; i++) {
    const x = x0 + i * (cell + rail) + rail / 2;
    const edge = i === 0 || i === cols;
    for (let j = 0; j < rows; j++) {
      const z = z0 + rail + j * (cell + rail) + cell / 2;
      const m = edge && blueEdges && (i + j) % 2 === 1 ? M.blue : M.lime;
      g.add(at(rbox(rail, padH, cell + 0.04, 0.07, m), x, padY, z));
    }
  }
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      const x = x0 + i * (cell + rail) + rail / 2;
      const z = z0 + j * (cell + rail) + rail / 2;
      g.add(at(rbox(rail + 0.03, padH + 0.03, rail + 0.03, 0.08, M.blue), x, padY + 0.012, z));
    }
  }
  g.userData.size = { W, D, top: top - 0.08 + padH };
  return g;
}

/** Foam pit: a padded tub filled with blue/lime cubes. */
export function foamPit({ w = 4, d = 3, depth = 0.7, cube = 0.34, seed = 7, fill = 1 } = {}) {
  const g = new THREE.Group();
  const wallT = 0.36;
  const r = rng(seed);
  const tubH = depth + 0.12;
  g.add(at(rbox(w + wallT * 2, tubH, wallT, 0.07, M.blue), 0, tubH / 2, -d / 2 - wallT / 2));
  g.add(at(rbox(w + wallT * 2, tubH, wallT, 0.07, M.blue), 0, tubH / 2, d / 2 + wallT / 2));
  g.add(at(rbox(wallT, tubH, d, 0.07, M.blue), -w / 2 - wallT / 2, tubH / 2, 0));
  g.add(at(rbox(wallT, tubH, d, 0.07, M.blue), w / 2 + wallT / 2, tubH / 2, 0));
  const nx = Math.floor(w / (cube * 0.92));
  const nz = Math.floor(d / (cube * 0.92));
  const layers = 3;
  for (let L = 0; L < layers; L++) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        if (L === layers - 1 && r() > fill) continue;
        const c = rbox(cube, cube, cube, 0.06, r() < 0.5 ? M.lime : M.blue, 3);
        c.position.set(
          -w / 2 + cube / 2 + i * (w - cube) / Math.max(1, nx - 1) + (r() - 0.5) * 0.08,
          depth - 0.22 + L * cube * 0.8 + r() * 0.1,
          -d / 2 + cube / 2 + j * (d - cube) / Math.max(1, nz - 1) + (r() - 0.5) * 0.08,
        );
        c.rotation.set((r() - 0.5) * 0.9, r() * Math.PI, (r() - 0.5) * 0.9);
        g.add(c);
      }
    }
  }
  return g;
}

/** Ceiling light strip: a visible emissive bar plus a sampled rect light under it. */
export function lightStrip(x, y, z, width = 0.3, intensity = 70, ry = 0, len = 3) {
  const g = new THREE.Group();
  g.add(box(len + 0.08, 0.06, width + 0.08, M.grey));
  const bar = box(len, 0.02, width, M.glow);
  bar.position.y = -0.035;
  g.add(bar);
  const light = new THREE.RectAreaLight('#fffbf5', intensity, len, width);
  light.position.set(0, -0.05, 0);
  light.lookAt(0, -10, 0);
  g.add(light);
  return at(g, x, y, z, ry);
}

/** Canvas texture helper: draw(ctx, w, h) once, returns an sRGB texture. */
export function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Soft studio environment: warm-white top, light grey horizon, used as fill everywhere. */
export async function studioEnv(top = '#ffffff', bottom = '#d9d4cc') {
  const { GradientEquirectTexture } = await import('three-gpu-pathtracer');
  const env = new GradientEquirectTexture(128);
  env.topColor.set(top);
  env.bottomColor.set(bottom);
  env.exponent = 1.5;
  env.update();
  return env;
}


/** Brand wall graphic: big slanted lime blocks and thin blue slashes rising from the floor. */
export function wallArt(ctx, w, h, { seed = 3, density = 1 } = {}) {
  const r = rng(seed);
  ctx.fillStyle = C.wall;
  ctx.fillRect(0, 0, w, h);
  const slant = h * 0.42;
  let x = -h * 0.2;
  while (x < w) {
    const big = r() < 0.55;
    const bw = big ? h * (0.5 + r() * 0.35) : h * (0.09 + r() * 0.05);
    const top = h * (big ? 0.18 + r() * 0.25 : 0.05 + r() * 0.2);
    ctx.fillStyle = big ? C.lime : r() < 0.8 ? C.blue : C.royal;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + slant, top);
    ctx.lineTo(x + slant + bw, top);
    ctx.lineTo(x + bw, h);
    ctx.fill();
    x += bw + (h * (0.25 + r() * 0.9)) / density;
  }
}

let logoImage;
/** Wall sign: the logo on a wall-coloured panel (opaque, so the path tracer needs no alpha). */
export async function logoPanel(width, { background = C.wall, pad = 0.08 } = {}) {
  logoImage ??= await loadImage(logoUrl);
  const ratio = logoImage.naturalHeight / logoImage.naturalWidth;
  const height = width * ratio;
  const tex = canvasTexture(2048, Math.round(2048 * ratio), (ctx, w, h) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(logoImage, w * pad, h * pad, w * (1 - 2 * pad), h * (1 - 2 * pad));
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  mesh.userData.height = height;
  return mesh;
}

/** Steel roof truss spanning `span` along z, centred at x. */
function truss(x, y, span, material) {
  const g = new THREE.Group();
  const depth = 0.7;
  const z0 = -span / 2;
  g.add(rod([x, y, z0], [x, y, -z0], 0.05, material, 8));
  g.add(rod([x, y - depth, z0], [x, y - depth, -z0], 0.05, material, 8));
  const n = Math.round(span / 1.1);
  for (let i = 0; i < n; i++) {
    const za = z0 + (i * span) / n;
    const zb = z0 + ((i + 1) * span) / n;
    g.add(rod([x, y, za], [x, y - depth, zb], 0.028, material, 6));
    g.add(rod([x, y - depth, za], [x, y - depth + 0.01, za + 0.001], 0.028, material, 6));
  }
  for (let i = 0; i <= n; i++) {
    const z = z0 + (i * span) / n;
    g.add(rod([x, y, z], [x, y - depth, z], 0.024, material, 6));
  }
  return g;
}

/**
 * Indoor hall: floor, back wall (painted lower band + window band) at z = back,
 * optional side walls, white roof with trusses and LED strips.
 * The side facing the camera (+z) stays open so the studio environment fills the room.
 */
export async function hall({
  width = 28, back = -9, front = 9, height = 7.4, paint = 3.2,
  windowBand = [4.3, 5.7], windowW = 2.2, sides = ['left', 'right'],
  lightIntensity = 70, roof = true, seed = 3,
} = {}) {
  const g = new THREE.Group();
  const floor = box(width + 30, 0.1, front - back + 30, M.floor);
  floor.position.set(0, -0.05, (front + back) / 2);
  g.add(floor);

  const art = canvasTexture(4096, Math.round((4096 * paint) / width), (ctx, w, h) => wallArt(ctx, w, h, { seed }));
  const wallMat = new THREE.MeshStandardMaterial({ map: art, roughness: 0.9 });

  const wallSection = (len, axis, at0, normalSign) => {
    const sec = new THREE.Group();
    const t = 0.25;
    const lower = new THREE.Mesh(new THREE.PlaneGeometry(len, paint), wallMat);
    lower.position.set(0, paint / 2, t / 2 + 0.002);
    sec.add(lower);
    sec.add(at(box(len, paint, t, M.wall), 0, paint / 2, 0));
    sec.add(at(box(len, windowBand[0] - paint, t, M.wall), 0, (paint + windowBand[0]) / 2, 0));
    sec.add(at(box(len, height - windowBand[1], t, M.wall), 0, (windowBand[1] + height) / 2, 0));
    const winH = windowBand[1] - windowBand[0];
    const n = Math.floor(len / (windowW + 0.9));
    const pitch = len / n;
    for (let i = 0; i <= n; i++) {
      sec.add(at(box(i === 0 || i === n ? 0.45 : 0.9, winH, t, M.wall), -len / 2 + i * pitch, (windowBand[0] + windowBand[1]) / 2, 0));
    }
    for (let i = 0; i < n; i++) {
      const cx = -len / 2 + (i + 0.5) * pitch;
      for (const f of [-0.25, 0.25]) sec.add(at(box(0.05, winH, 0.06, M.steel), cx + f * windowW, (windowBand[0] + windowBand[1]) / 2, 0));
      sec.add(at(box(pitch - 0.9, 0.05, 0.06, M.steel), cx, (windowBand[0] + windowBand[1]) / 2, 0));
    }
    if (axis === 'x') sec.position.set(0, 0, at0);
    else { sec.rotation.y = normalSign * Math.PI / 2; sec.position.set(at0, 0, (front + back) / 2); }
    return sec;
  };

  g.add(wallSection(width, 'x', back));
  const sideLen = front - back;
  if (sides.includes('left')) g.add(wallSection(sideLen, 'z', -width / 2, 1));
  if (sides.includes('right')) g.add(wallSection(sideLen, 'z', width / 2, -1));

  if (roof) {
    const roofSlab = box(width + 1, 0.12, sideLen + 1, M.white);
    roofSlab.position.set(0, height + 0.06, (front + back) / 2);
    g.add(roofSlab);
    for (let x = -width / 2 + 3; x < width / 2 - 1; x += 4.5) {
      const t = truss(x, height - 0.1, sideLen, M.steel);
      t.position.z = (front + back) / 2;
      g.add(t);
      for (let z = back + 2.5; z < front - 1; z += 4.2) g.add(lightStrip(x + 2.25, height - 0.9, z, 0.32, lightIntensity, Math.PI / 2, 3.2));
    }
    for (let z = back + 1; z < front; z += 3) {
      g.add(rod([-width / 2, height - 0.12, z], [width / 2, height - 0.12, z], 0.035, M.steel, 6));
    }
  }
  return g;
}
