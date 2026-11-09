// Park equipment: ninja course, soft play, ball pit, party furniture, bunting.
import { THREE, M, C, rbox, box, at, rod, rng, vinylMat } from './kit.js';

const mat = {
  rope: new THREE.MeshStandardMaterial({ color: '#f1e6c8', roughness: 0.8 }),
  strap: new THREE.MeshStandardMaterial({ color: '#1b1c22', roughness: 0.6 }),
  net: new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.7 }),
  orange: vinylMat('#ff8a1f'),
  yellow: vinylMat('#ffc928'),
  purple: vinylMat('#8a3fd6'),
  pink: vinylMat('#ff4f9a'),
  teal: vinylMat('#19c6e6'),
  frameLime: vinylMat('#c3ee1e', { roughness: 0.3 }),
  cloth: new THREE.MeshStandardMaterial({ color: C.lime, roughness: 0.75 }),
  plastic: new THREE.MeshStandardMaterial({ color: '#f6f6f4', roughness: 0.35 }),
  plateBlue: new THREE.MeshStandardMaterial({ color: C.blue, roughness: 0.3 }),
};
export { mat as PM };

/* ------------------------------------------------------------------ ninja course */

/** Square steel tube from a to b (axis-aligned or not). */
function beam(a, b, s = 0.13, material = M.steelBlue) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = rbox(s, len, s, 0.025, material, 2);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}

/** Lattice girder between two top points (top chord, bottom chord, zig-zag). */
function girder(a, b, depth = 0.42, material = M.steelBlue) {
  const g = new THREE.Group();
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const down = new THREE.Vector3(0, -depth, 0);
  g.add(beam(a, b, 0.12, material));
  g.add(beam(A.clone().add(down).toArray(), B.clone().add(down).toArray(), 0.08, material));
  const n = Math.max(2, Math.round(A.distanceTo(B) / 0.55));
  for (let i = 0; i < n; i++) {
    const p = A.clone().lerp(B, i / n);
    const q = A.clone().lerp(B, (i + 1) / n).add(down);
    g.add(rod(p.toArray(), q.toArray(), 0.022, material, 8));
    const r = A.clone().lerp(B, (i + 1) / n);
    g.add(rod(r.toArray(), q.toArray(), 0.022, material, 8));
  }
  return g;
}

function ring(x, y, z, top) {
  const g = new THREE.Group();
  g.add(rod([x, top, z], [x, y + 0.2, z], 0.022, mat.strap, 8));
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 20, 48), M.lime);
  torus.position.set(x, y, z);
  g.add(torus);
  return g;
}

function bag(x, y, z, top, material, h = 1.0, r = 0.17) {
  const g = new THREE.Group();
  g.add(rod([x, top, z], [x, y + h / 2, z], 0.02, mat.strap, 8));
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(r, h - 2 * r, 10, 28), material);
  body.position.set(x, y, z);
  g.add(body);
  return g;
}

/** Hanging cargo net from (x0, top) to (x1, bottom), in the plane z. */
export function cargoNet(x0, x1, yTop, yBottom, z, cell = 0.2, material = mat.rope, r = 0.016) {
  const g = new THREE.Group();
  const cols = Math.round((x1 - x0) / cell);
  const rows = Math.round((yTop - yBottom) / cell);
  for (let i = 0; i <= cols; i++) {
    const x = x0 + (i * (x1 - x0)) / cols;
    g.add(rod([x, yTop, z], [x, yBottom, z], r, material, 6));
  }
  for (let j = 0; j <= rows; j++) {
    const y = yTop - (j * (yTop - yBottom)) / rows;
    g.add(rod([x0, y, z], [x1, y, z], r, material, 6));
  }
  return g;
}

export function ninja({ length = 6.4, depth = 2.6, height = 3.4, seed = 4 } = {}) {
  const g = new THREE.Group();
  const L = length / 2;
  const D = depth / 2;
  const H = height;
  for (const x of [-L, 0, L]) for (const z of [-D, D]) g.add(beam([x, 0, z], [x, H, z], 0.15));
  g.add(girder([-L, H, -D], [L, H, -D]));
  g.add(girder([-L, H, D], [L, H, D]));
  for (const x of [-L, 0, L]) g.add(girder([x, H, -D], [x, H, D], 0.32));
  for (const x of [-L + 1.1, L - 1.1]) g.add(beam([x, H, -D], [x, H, D], 0.1));
  // braces at the feet
  for (const z of [-D, D]) g.add(beam([-L, 0.5, z], [L, 0.5, z], 0.1));

  const top = H - 0.42;
  const zc = 0.25;
  g.add(ring(-L + 0.6, 1.75, zc, top));
  g.add(ring(-L + 1.25, 1.6, zc, top));
  g.add(ring(-L + 1.9, 1.75, zc, top));
  g.add(bag(-0.55, 1.35, zc, top, M.lime, 1.15));
  g.add(bag(0.2, 1.3, zc, top, M.blue, 1.15));
  g.add(cargoNet(0.75, 2.35, top, 0.75, zc - 0.1));
  g.add(bag(2.75, 1.45, zc, top, M.lime, 0.95, 0.15));
  return g;
}

/* ------------------------------------------------------------------ soft play */

/** Square net panel (white rope grid) between two corners in the xy plane at z, or yz plane at x. */
function netPanel(w, h, cell = 0.09, material = mat.net) {
  const g = new THREE.Group();
  const cols = Math.round(w / cell);
  const rows = Math.round(h / cell);
  for (let i = 0; i <= cols; i++) g.add(rod([-w / 2 + (i * w) / cols, 0, 0], [-w / 2 + (i * w) / cols, h, 0], 0.007, material, 4));
  for (let j = 0; j <= rows; j++) g.add(rod([-w / 2, (j * h) / rows, 0], [w / 2, (j * h) / rows, 0], 0.007, material, 4));
  return g;
}

/** Spiral tube slide from (x, yTop, z) curling down to (x + dx, ~0.3, z + dz). */
function tubeSlide({ x, z, yTop, turns = 0.75, radius = 0.95, tube = 0.36, start = 0 }) {
  const pts = [];
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = start + t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(x + Math.cos(a) * radius * (1 - 0.15 * t), yTop - t * (yTop - 0.45), z + Math.sin(a) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.Group();
  // two-tone: blue first half, lime second half
  const half = (from, to, m) => {
    const sub = new THREE.CatmullRomCurve3(pts.slice(Math.floor(from * N), Math.ceil(to * N) + 1));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(sub, 80, tube, 28, false), m));
  };
  half(0, 0.5, M.blue);
  half(0.5, 1, M.lime);
  const exit = curve.getPoint(1);
  g.userData.exit = exit;
  return g;
}

export function ballPit({ w = 3, d = 2.2, depth = 0.55, ball = 0.075, seed = 9, colors = [M.lime, M.blue, mat.teal], fill = 0.97 } = {}) {
  const g = new THREE.Group();
  const t = 0.3;
  const h = depth + 0.1;
  g.add(at(rbox(w + 2 * t, h, t, 0.1, M.blue), 0, h / 2, -d / 2 - t / 2));
  g.add(at(rbox(w + 2 * t, h, t, 0.1, M.blue), 0, h / 2, d / 2 + t / 2));
  g.add(at(rbox(t, h, d, 0.1, M.blue), -w / 2 - t / 2, h / 2, 0));
  g.add(at(rbox(t, h, d, 0.1, M.blue), w / 2 + t / 2, h / 2, 0));
  const r = rng(seed);
  const geo = new THREE.SphereGeometry(ball, 18, 12);
  const step = ball * 1.85;
  for (let y = depth - ball * 2.5; y <= depth - ball * 0.4; y += ball * 1.6) {
    for (let x = -w / 2 + ball; x <= w / 2 - ball; x += step) {
      for (let z = -d / 2 + ball; z <= d / 2 - ball; z += step) {
        if (r() > fill) continue;
        const m = new THREE.Mesh(geo, colors[Math.floor(r() * colors.length)]);
        m.position.set(x + (r() - 0.5) * ball * 0.5, y + r() * ball * 0.5, z + (r() - 0.5) * ball * 0.5);
        g.add(m);
      }
    }
  }
  return g;
}

/**
 * Two-level soft play: lime padded posts, white nets, coloured padded rails,
 * a purple arch with soft steps, a two-tone spiral slide into a ball pit.
 */
export function softPlay({ cols = 3, rows = 2, bay = 1.25, level = 1.2, levels = 2, slide = true } = {}) {
  const g = new THREE.Group();
  const W = cols * bay;
  const D = rows * bay;
  const H = level * levels + 0.9;
  const post = (x, z) => g.add(at(rbox(0.11, H, 0.11, 0.04, mat.frameLime), x, H / 2, z));
  for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) post(-W / 2 + i * bay, -D / 2 + j * bay);
  // floors + padded rails per level
  const railColors = [mat.orange, M.blue, mat.purple, mat.yellow];
  for (let L = 1; L <= levels; L++) {
    const y = L * level;
    g.add(at(box(W, 0.08, D, M.blue), 0, y, 0));
    g.add(at(rbox(W + 0.12, 0.16, 0.16, 0.06, railColors[L % 4]), 0, y + 0.08, D / 2));
    g.add(at(rbox(W + 0.12, 0.16, 0.16, 0.06, railColors[(L + 1) % 4]), 0, y + 0.08, -D / 2));
    g.add(at(rbox(0.16, 0.16, D, 0.06, railColors[(L + 2) % 4]), -W / 2, y + 0.08, 0));
    g.add(at(rbox(0.16, 0.16, D, 0.06, railColors[(L + 3) % 4]), W / 2, y + 0.08, 0));
  }
  g.add(at(rbox(W + 0.1, 0.12, 0.12, 0.04, mat.frameLime), 0, H, D / 2));
  g.add(at(rbox(W + 0.1, 0.12, 0.12, 0.04, mat.frameLime), 0, H, -D / 2));
  // padded tubes running through the upper level
  for (const z of [-0.25, 0.3]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, W * 0.7, 32, 1, true), z < 0 ? mat.orange : M.blue);
    tube.material = z < 0 ? mat.orange : mat.purple;
    tube.rotation.z = Math.PI / 2;
    tube.position.set(-0.1, level * levels + 0.45, z);
    g.add(tube);
  }
  // nets on the front (z = D/2) and sides, leaving the ground-floor bay open for the arch
  for (let i = 0; i < cols; i++) {
    for (let L = 0; L <= levels; L++) {
      if (L === 0 && i === 1) continue;
      const h = L === levels ? 0.9 : level;
      const net = netPanel(bay - 0.12, h - 0.1);
      net.position.set(-W / 2 + (i + 0.5) * bay, L * level + 0.06, D / 2 + 0.01);
      g.add(net);
    }
  }
  for (const side of [-1, 1]) {
    for (let j = 0; j < rows; j++) {
      for (let L = 0; L <= levels; L++) {
        const h = L === levels ? 0.9 : level;
        const net = netPanel(bay - 0.12, h - 0.1);
        net.rotation.y = Math.PI / 2;
        net.position.set(side * (W / 2 + 0.01), L * level + 0.06, -D / 2 + (j + 0.5) * bay);
        g.add(net);
      }
    }
  }
  // back wall panels in colour so the inside reads
  g.add(at(box(W, H - 0.1, 0.06, M.royal), 0, H / 2, -D / 2 - 0.04));

  // purple arch + soft steps in the open bay
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 20, 48, Math.PI), mat.purple);
  arch.position.set(-W / 2 + 1.5 * bay, level - 0.55, D / 2 + 0.05);
  g.add(arch);
  for (const s of [-1, 1]) g.add(at(rbox(0.18, level - 0.55, 0.18, 0.06, mat.purple), -W / 2 + 1.5 * bay + s * 0.5, (level - 0.55) / 2, D / 2 + 0.05));
  const stepColors = [mat.purple, mat.yellow, mat.orange];
  stepColors.forEach((m, k) => {
    g.add(at(rbox(0.8, 0.26, 0.32, 0.08, m), -W / 2 + 1.5 * bay, 0.13 + k * 0.26, D / 2 + 0.7 - k * 0.3));
  });

  if (slide) {
    const s = tubeSlide({ x: W / 2 + 0.95, z: D / 2 - 0.2, yTop: level * levels + 0.4, start: Math.PI * 1.05, turns: 0.62 });
    g.add(s);
  }
  g.userData.size = { W, D, H };
  return g;
}

/* ------------------------------------------------------------------ party */

export function chair(material = mat.plastic) {
  const g = new THREE.Group();
  g.add(at(rbox(0.44, 0.05, 0.42, 0.02, material), 0, 0.45, 0));
  const back = rbox(0.44, 0.42, 0.04, 0.02, material);
  back.position.set(0, 0.68, -0.2);
  back.rotation.x = -0.12;
  g.add(back);
  for (const x of [-0.19, 0.19]) for (const z of [-0.18, 0.18]) g.add(rod([x, 0, z], [x * 0.96, 0.45, z * 0.96], 0.016, material, 8));
  return g;
}

export function partyTable({ length = 2.4, width = 0.9, seats = 3, cups = true } = {}) {
  const g = new THREE.Group();
  const H = 0.74;
  g.add(at(rbox(length, 0.04, width, 0.01, mat.cloth), 0, H, 0));
  // cloth skirt hanging on the long sides
  for (const s of [-1, 1]) g.add(at(box(length, 0.55, 0.01, mat.cloth), 0, H - 0.28, (s * width) / 2 + s * 0.005));
  for (const s of [-1, 1]) g.add(at(box(0.01, 0.55, width, mat.cloth), (s * length) / 2 + s * 0.005, H - 0.28, 0));
  for (let i = 0; i < seats; i++) {
    const x = -length / 2 + (i + 0.5) * (length / seats);
    for (const s of [-1, 1]) {
      const c = chair();
      c.position.set(x, 0, s * (width / 2 + 0.32));
      c.rotation.y = s < 0 ? 0 : Math.PI;
      g.add(c);
      if (cups) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.015, 32), mat.plateBlue);
        plate.position.set(x, H + 0.03, s * (width / 2 - 0.2));
        g.add(plate);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.12, 24), mat.plateBlue);
        cup.position.set(x + 0.17, H + 0.08, s * (width / 2 - 0.22));
        g.add(cup);
      }
    }
  }
  return g;
}

/** String of triangle flags hanging between two points. */
export function bunting(a, b, { sag = 0.35, flags = 12, size = 0.32, seed = 2 } = {}) {
  const g = new THREE.Group();
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const colors = [mat.pink, mat.yellow, M.blue, M.lime, mat.teal];
  const point = (t) => A.clone().lerp(B, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0));
  const pts = Array.from({ length: 33 }, (_, i) => point(i / 32));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.006, 6), mat.strap));
  const dir = B.clone().sub(A).normalize();
  const r = rng(seed);
  for (let i = 0; i < flags; i++) {
    const t = (i + 0.5) / flags;
    const p = point(t);
    const shape = new THREE.Shape();
    shape.moveTo(-size / 2, 0);
    shape.lineTo(size / 2, 0);
    shape.lineTo(0, -size * 1.15);
    shape.closePath();
    const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), colors[i % colors.length].clone());
    flag.material.side = THREE.DoubleSide;
    flag.position.copy(p);
    flag.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    flag.rotateX((r() - 0.5) * 0.25);
    g.add(flag);
  }
  return g;
}

/** Party balloon on a string, anchored at (x, 0, z). */
export function balloon(x, y, z, material, seed = 1) {
  const g = new THREE.Group();
  const r = rng(seed);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 48, 32), material);
  body.scale.set(1, 1.18, 1);
  body.position.set(x, y, z);
  g.add(body);
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 16), material);
  knot.position.set(x, y - 0.25, z);
  g.add(knot);
  const pts = [0, 0.33, 0.66, 1].map((t) => new THREE.Vector3(x + Math.sin(t * 5 + r() * 2) * 0.05 * t, y - 0.27 - t * (y - 0.8), z));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.004, 6), mat.strap));
  return g;
}
export const balloonMats = [vinylMat('#ff4f9a', { roughness: 0.22 }), vinylMat('#ffc928', { roughness: 0.22 }), vinylMat('#1d37d2', { roughness: 0.22 }), vinylMat('#bff01a', { roughness: 0.22 }), vinylMat('#19c6e6', { roughness: 0.22 })];
