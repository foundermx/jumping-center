// One pit as a real 3D scene: the tub and what stands in it, rebuilt from the render's geometry,
// simulated in the render's metres and drawn through the render's own camera onto its picture.
// The live pieces cover the whole painted pile, side to side and front to back, in the picture's
// perspective; walls, posts and bags of the picture hide them where they stand in front.
//
// What is thrown out, or falls over the front or a side, leaves as a `Throw`: the page world
// carries on with it from the same spot on screen, at the same speed.
import { Body, Box, ContactMaterial, type GSSolver, Material, Plane, SAPBroadphase, Sphere, Vec3, World } from 'cannon-es';
import {
  BoxGeometry,
  CapsuleGeometry,
  type Color,
  DirectionalLight,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShadowMaterial,
  type Texture,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ASPECT, type PitScene } from './scenes';
import { CALM, clamp, FLING, GRAVITY, type Kind, paint, rand, SHAPES, SOFT, soften, STEP, tame } from './shared';

/** A piece leaving a pit, as the page sees it. */
export interface Throw {
  kind: Kind;
  tint: Color;
  /** Where on the page, px, and how fast, px/s (y down). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** How big it looks there, px. */
  size: number;
  /** Which way it is turned and how it spins, as the camera sees it. */
  turn: Quaternion;
  spin: Vector3;
}

interface Piece {
  body: Body;
  tint: Color;
  born: number;
  /** How high above the pile (m) it must be thrown to leave: each one differs. */
  loft: number;
}

const FOLLOW = 45; // how eagerly the hand chases the pointer, 1/s
const GRASP = 1000; // fastest the hand moves, px/s on screen
const MAX = { cubes: 220, balls: 460 };
const SLEEPING = Body.SLEEPING;

const v1 = new Vector3();
const v2 = new Vector3();
const matrix = new Matrix4();
const turn = new Quaternion();
const grow = new Vector3();

/**
 * Spreads points over a rectangle as densely as `gap` allows, without the rows of a lattice: a
 * shaken hexagonal grid, pushed apart until no two are closer than `gap`.
 */
function scatter(x0: number, x1: number, z0: number, z1: number, gap: number) {
  const pts: [number, number][] = [];
  const dx = gap * 1.03;
  const dz = dx * 0.866;
  for (let z = z0, row = 0; z <= z1; z += dz, row++) {
    for (let x = x0 + ((row % 2) * dx) / 2; x <= x1; x += dx) pts.push([x + rand(-0.3, 0.3) * gap, z + rand(-0.3, 0.3) * gap]);
  }
  const cell = (x: number, z: number) => Math.floor((x - x0) / gap) * 4096 + Math.floor((z - z0) / gap);
  const near = (grid: Map<number, number[]>, x: number, z: number) => {
    const found: number[] = [];
    const i = Math.floor((x - x0) / gap);
    const j = Math.floor((z - z0) / gap);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) found.push(...(grid.get((i + a) * 4096 + j + b) ?? []));
    return found;
  };
  for (let round = 0; round < 30; round++) {
    const grid = new Map<number, number[]>();
    pts.forEach(([x, z], n) => {
      const key = cell(x, z);
      const list = grid.get(key);
      if (list) list.push(n);
      else grid.set(key, [n]);
    });
    let moved = false;
    pts.forEach((p, n) => {
      for (const o of near(grid, p[0], p[1])) {
        if (o <= n) continue;
        const q = pts[o];
        const dx = q[0] - p[0];
        const dz = q[1] - p[1];
        const d = Math.hypot(dx, dz) || 1e-6;
        if (d >= gap) continue;
        const push = (gap - d) / 2 / d;
        p[0] -= dx * push;
        p[1] -= dz * push;
        q[0] += dx * push;
        q[1] += dz * push;
        moved = true;
      }
    });
    for (const p of pts) {
      p[0] = clamp(p[0], x0, x1);
      p[1] = clamp(p[1], z0, z1);
    }
    if (!moved) break;
  }
  // the few that still overlap make way
  const kept: [number, number][] = [];
  const grid = new Map<number, number[]>();
  for (const p of pts) {
    if (near(grid, p[0], p[1]).some((o) => Math.hypot(kept[o][0] - p[0], kept[o][1] - p[1]) < gap * 0.97)) continue;
    const key = cell(p[0], p[1]);
    const list = grid.get(key);
    if (list) list.push(kept.length);
    else grid.set(key, [kept.length]);
    kept.push(p);
  }
  return kept;
}

export class Pit {
  readonly kind: Kind;
  /** CSS px per metre of the render, in the middle of the pile. */
  scale = 0;

  private readonly spec: PitScene;
  private readonly el: HTMLElement;
  private readonly onThrow: (t: Throw) => void;
  private readonly world = new World({ allowSleep: true });
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly unturn: Quaternion;
  private readonly mesh: InstancedMesh;
  private readonly mPiece = new Material();
  private readonly mSlick = new Material();
  private readonly pieces: Piece[] = [];
  private spots: { x: number; z: number }[] = [];
  private readonly hand: { body: Body; on: boolean; r: number; R: number; at: Vec3 };
  /** The frame's left and right edges, as walls through the eye (normals point inwards). */
  private fences: Body[] = [];
  private inward: Vector3[] = [];
  /** The whole picture on the page (it covers its frame, so it may reach past it), px. */
  private readonly image = { x: 0, y: 0, w: 0, h: 0 };
  /** The frame: what of the picture shows; `cut` slants its right edge in at the bottom. */
  private readonly frame = { x: 0, y: 0, w: 0, h: 0, cut: 0 };
  private crop = '';
  private seenAt = 0;
  private openAt = 0;
  private open = false;
  private clock = 0;
  private popping = 0;
  private out = 0;
  private due = 0;

  constructor(spec: PitScene, el: HTMLElement, env: Texture, shadows: boolean, onThrow: (t: Throw) => void) {
    this.spec = spec;
    this.kind = spec.kind;
    this.el = el;
    this.onThrow = onThrow;
    const { tub, layer, piece } = spec;
    const ball = spec.kind === 'balls';

    const camera = (this.camera = new PerspectiveCamera(spec.fov, ASPECT, 0.1, 80));
    camera.position.set(...spec.eye);
    camera.lookAt(...spec.target);
    camera.updateMatrixWorld();
    this.unturn = camera.quaternion.clone().invert();

    // ------------------------------------------------------------ world

    const world = this.world;
    world.broadphase = new SAPBroadphase(world);
    (world.solver as GSSolver).iterations = 8;
    const mSolid = new Material();
    const mHand = new Material();
    const touch = (a: Material, b: Material, friction: number, restitution: number) =>
      world.addContactMaterial(new ContactMaterial(a, b, { friction, restitution }));
    touch(this.mPiece, this.mPiece, ball ? 0.2 : 0.6, ball ? 0.4 : 0.12);
    touch(this.mPiece, mSolid, ball ? 0.3 : 0.65, ball ? 0.45 : 0.2);
    touch(this.mPiece, this.mSlick, 0, 0.2);
    touch(this.mPiece, mHand, ball ? 0.3 : 0.45, 0.1);
    soften(world, () => SOFT / this.scale);

    const fixed = (shape: Box | Sphere, x: number, y: number, z: number) => {
      const body = new Body({ type: Body.STATIC, shape, material: mSolid, position: new Vec3(x, y, z) });
      world.addBody(body);
      return body;
    };
    const t = tub.wall;
    const h = tub.height;
    const x0 = tub.x - tub.w / 2;
    const x1 = tub.x + tub.w / 2;
    const z0 = tub.z - tub.d / 2;
    const z1 = tub.z + tub.d / 2;
    // the painted pile, under the live layer: only as wide as the tub, so what is pushed off its edge falls
    fixed(new Box(new Vec3(tub.w / 2, 0.5, tub.d / 2)), tub.x, layer - 0.5, tub.z);
    const walls: [number, number, number, number, number][] = [
      [tub.w + 2 * t, t, tub.x, z1 + t / 2, 0],
      [tub.w + 2 * t, t, tub.x, z0 - t / 2, 0],
      [t, tub.d, x0 - t / 2, tub.z, 0],
      [t, tub.d, x1 + t / 2, tub.z, 0],
    ];
    for (const [w, d, x, z] of walls) fixed(new Box(new Vec3(w / 2, h / 2, d / 2)), x, h / 2, z);
    for (const [x, z, side, top] of spec.posts) fixed(new Box(new Vec3(side / 2, (top - layer + 0.4) / 2, side / 2)), x, (top + layer - 0.4) / 2, z);
    for (const [x, y, z, length, r] of spec.bags) {
      const body = new Body({ type: Body.STATIC, material: mSolid, position: new Vec3(x, y, z) });
      const n = Math.max(2, Math.round((length - 2 * r) / r) + 1);
      for (let i = 0; i < n; i++) body.addShape(new Sphere(r), new Vec3(0, -length / 2 + r + (i * (length - 2 * r)) / (n - 1), 0));
      world.addBody(body);
    }

    // The hand: a ball just under the surface of the pile, so what it sweeps through rides up over it.
    this.hand = { body: new Body({ type: Body.KINEMATIC, material: mHand, allowSleep: false, shape: new Sphere(1) }), on: false, r: 0, R: piece * (ball ? 1.5 : 0.8), at: new Vec3() };
    world.addEventListener('postStep', () => this.rules());

    // ------------------------------------------------------------ picture

    const scene = this.scene;
    scene.environment = env;
    // the hall's ceiling lights, from above and a little in front
    const sun = new DirectionalLight('#ffffff', 1.1);
    sun.position.set(tub.x - 1.2, layer + 6, tub.z + 2.6);
    sun.target.position.set(tub.x, layer, tub.z);
    scene.add(sun, sun.target);
    if (shadows) {
      sun.castShadow = true;
      const reach = Math.max(tub.w, tub.d) / 2 + 1.2;
      Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: 16 });
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.02;
      sun.shadow.radius = 4;
      // the live pieces cast their shadows on the painted pile under them
      const catcher = new Mesh(new PlaneGeometry(tub.w, tub.d), new ShadowMaterial({ opacity: 0.22 }));
      catcher.rotation.x = -Math.PI / 2;
      catcher.position.set(tub.x, layer + 0.004, tub.z);
      catcher.receiveShadow = true;
      scene.add(catcher);
    }

    // What stands in front of the pile in the picture hides it: drawn first, into depth only.
    const hide = new MeshBasicMaterial({ colorWrite: false });
    const screen = (geometry: BoxGeometry | CapsuleGeometry | RoundedBoxGeometry, x: number, y: number, z: number) => {
      const mesh = new Mesh(geometry, hide);
      mesh.position.set(x, y, z);
      mesh.renderOrder = -1;
      scene.add(mesh);
    };
    for (const [w, d, x, z] of walls) screen(new RoundedBoxGeometry(w, h, d, 4, tub.round), x, h / 2, z);
    for (const [x, z, side, top] of spec.posts) screen(new BoxGeometry(side, top, side), x, top / 2, z);
    for (const [x, y, z, length, r] of spec.bags) screen(new CapsuleGeometry(r, length - 2 * r, 4, 14), x, y, z);

    const mesh = (this.mesh = new InstancedMesh(SHAPES[spec.kind], new MeshStandardMaterial({ roughness: 0.36 }), MAX[spec.kind]));
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = shadows;
    mesh.count = 0;
    scene.add(mesh);
  }

  /** How big a piece looks in the middle of the pile, px: what the page world makes its own the same size. */
  get size() {
    return this.spec.piece * this.scale;
  }

  /** The scene and its camera, to compile ahead of time. */
  get view() {
    return [this.scene, this.camera] as const;
  }

  // ------------------------------------------------------------ the picture on the page

  /** Where a point of the scene lands on the page, px. */
  private toPage(p: Vector3): [number, number] {
    v1.copy(p).project(this.camera);
    return [this.image.x + ((v1.x + 1) / 2) * this.image.w, this.image.y + ((1 - v1.y) / 2) * this.image.h];
  }

  /** The direction from the eye through a point of the page. */
  private ray(px: number, py: number, out = new Vector3()) {
    const { x, y, w, h } = this.image;
    return out.set(((px - x) / w) * 2 - 1, 1 - ((py - y) / h) * 2, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
  }

  /** The point of the page, carried into the scene down to height `y`. */
  private onPlane(px: number, py: number, y: number) {
    const dir = this.ray(px, py);
    const eye = this.camera.position;
    if (dir.y > -1e-3) return null;
    return dir.multiplyScalar((y - eye.y) / dir.y).add(eye);
  }

  /** Whether a point of the page is inside the frame (left of its slanted edge). */
  private over(px: number, py: number) {
    const { x, y, w, h, cut } = this.frame;
    return py >= y && py <= y + h && px >= x && px <= x + w - (cut * (py - y)) / h;
  }

  /** Whether a ball of radius r around p is in plain sight: inside the frame, clear of its edges. */
  private shows(p: Vector3, r: number) {
    const eye = this.camera.position;
    for (const n of this.inward) if (n.dot(v2.copy(p).sub(eye)) < r) return false;
    const [, py] = this.toPage(p);
    return py > this.frame.y && py < this.frame.y + this.frame.h;
  }

  layout() {
    const img = this.el.querySelector('img');
    const box = this.el.getBoundingClientRect();
    const nw = img ? img.naturalWidth || Number(img.getAttribute('width')) : 0;
    const nh = img ? img.naturalHeight || Number(img.getAttribute('height')) : 0;
    if (!nw || !nh || !box.width || !box.height) return;
    // the picture covers its frame (object-fit: cover, centred)
    const k = Math.max(box.width / nw, box.height / nh);
    const cut = ((parseFloat(getComputedStyle(this.el).getPropertyValue('--cut')) || 0) / 100) * box.width;
    Object.assign(this.frame, { x: box.left + scrollX, y: box.top + scrollY, w: box.width, h: box.height, cut });
    Object.assign(this.image, { x: this.frame.x + (box.width - nw * k) / 2, y: this.frame.y + (box.height - nh * k) / 2, w: nw * k, h: nh * k });

    const crop = [this.image.w, box.width, box.height, cut].map((n) => n.toFixed(1)).join();
    if (crop === this.crop) return; // only moved on the page: the scene is the same
    this.crop = crop;
    const { tub, layer } = this.spec;
    const mid = new Vector3(tub.x, layer, tub.z);
    const [ax, ay] = this.toPage(mid);
    const [bx, by] = this.toPage(mid.add(new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion)));
    this.scale = Math.hypot(bx - ax, by - ay);
    // on screen, things fall here as fast as anywhere on the page
    this.world.gravity.set(0, -GRAVITY / this.scale, 0);
    this.fence();
    if (this.open) {
      this.clear();
      this.populate(this.clock);
    }
  }

  /** Walls along the frame's left and right edges, so nothing goes where it can't be seen. */
  private fence() {
    for (const body of this.fences) this.world.removeBody(body);
    this.fences = [];
    this.inward = [];
    const { x, y, w, h, cut } = this.frame;
    const eye = this.camera.position;
    const inside = this.ray(x + w / 2, y + h / 2);
    for (const [ax, ay, bx, by] of [
      [x, y, x, y + h],
      [x + w, y, x + w - cut, y + h],
    ]) {
      const n = new Vector3().crossVectors(this.ray(ax, ay), this.ray(bx, by)).normalize();
      if (n.dot(inside) < 0) n.negate();
      const body = new Body({ type: Body.STATIC, shape: new Plane(), material: this.mSlick, position: new Vec3(eye.x, eye.y, eye.z) });
      body.quaternion.setFromVectors(new Vec3(0, 0, 1), new Vec3(n.x, n.y, n.z));
      this.world.addBody(body);
      this.fences.push(body);
      this.inward.push(n);
    }
  }

  private inView(margin: number) {
    const { y, h } = this.frame;
    return y < scrollY + innerHeight * (1 - margin) && y + h > scrollY + innerHeight * margin;
  }

  // ------------------------------------------------------------ pieces

  /** Lays the live layer over the whole pile, each piece at rest, popping in one after another. */
  private populate(at: number) {
    const { tub, piece, gap, layer } = this.spec;
    const m = piece / 2 + 0.02;
    const p = new Vector3();
    this.spots = scatter(tub.x - tub.w / 2 + m, tub.x + tub.w / 2 - m, tub.z - tub.d / 2 + m, tub.z + tub.d / 2 - m, gap)
      .filter(([x, z]) => this.shows(p.set(x, layer + piece / 2, z), piece / 2))
      .slice(0, MAX[this.kind] - 20)
      .map(([x, z]) => ({ x, z }));
    for (const { x, z } of this.spots) this.add(x, z, at + rand(0, 0.8), 0);
    this.popping = at + 1.1;
  }

  /** A piece on the pile at (x, z), resting, or dropped from `drop` metres above it. */
  private add(x: number, z: number, born: number, drop: number) {
    const { piece, layer } = this.spec;
    const ball = this.kind === 'balls';
    const body = new Body({
      mass: (ball ? 1.1 : 0.55) * piece ** 3,
      shape: ball ? new Sphere(piece / 2) : new Box(new Vec3(piece / 2, piece / 2, piece / 2)),
      material: this.mPiece,
      linearDamping: ball ? 0.1 : 0.18,
      angularDamping: ball ? 0.3 : 0.25,
      // cannon-es adds spin (rad/s) to speed (m/s) to decide who rests: a small rolling ball spins fast
      sleepSpeedLimit: clamp(0.12 / piece, 0.14, 0.45),
      sleepTimeLimit: 0.5,
    });
    let low = -piece / 2;
    if (ball) {
      body.quaternion.setFromEuler(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
    } else {
      // a little askew, like the painted ones, resting on its lowest corner
      body.quaternion.setFromEuler(rand(-0.16, 0.16), rand(-0.5, 0.5), rand(-0.16, 0.16));
      const corner = new Vec3();
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        low = Math.min(low, body.quaternion.vmult(corner.set((sx * piece) / 2, (sy * piece) / 2, (sz * piece) / 2)).y);
      }
    }
    body.position.set(x, layer - low + drop, z);
    body.previousPosition.copy(body.position);
    body.interpolatedPosition.copy(body.position);
    body.previousQuaternion.copy(body.quaternion);
    body.interpolatedQuaternion.copy(body.quaternion);
    this.world.addBody(body);
    if (!drop) body.sleep();
    this.pieces.push({ body, tint: paint(this.kind), born, loft: piece * rand(1.5, 4) });
  }

  private drop(index: number) {
    const [{ body }] = this.pieces.splice(index, 1);
    this.world.removeBody(body);
  }

  private clear() {
    this.release();
    while (this.pieces.length) this.drop(this.pieces.length - 1);
  }

  /** Hands a piece to the page world, as it is seen at this moment. */
  private toss(index: number) {
    const { body, tint } = this.pieces[index];
    const p = new Vector3(body.position.x, body.position.y, body.position.z);
    const v = body.velocity;
    const h = 1 / 60;
    const [x, y] = this.toPage(p);
    const [x2, y2] = this.toPage(v2.set(p.x + v.x * h, p.y + v.y * h, p.z + v.z * h));
    const [x3, y3] = this.toPage(v2.set(1, 0, 0).applyQuaternion(this.camera.quaternion).multiplyScalar(this.spec.piece).add(p));
    const q = body.quaternion;
    const w = body.angularVelocity;
    this.onThrow({
      kind: this.kind,
      tint,
      x,
      y,
      vx: (x2 - x) / h,
      vy: (y2 - y) / h,
      size: Math.hypot(x3 - x, y3 - y),
      turn: this.unturn.clone().multiply(new Quaternion(q.x, q.y, q.z, q.w)),
      spin: new Vector3(w.x, w.y, w.z).applyQuaternion(this.unturn),
    });
    this.drop(index);
    this.out = performance.now();
  }

  /** After each step: what has left the tub goes. */
  private sort() {
    const { tub, layer, piece } = this.spec;
    const half = piece / 2;
    const x0 = tub.x - tub.w / 2 - half;
    const x1 = tub.x + tub.w / 2 + half;
    const z1 = tub.z + tub.d / 2 + half;
    const p = new Vector3();
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const { body, loft } = this.pieces[i];
      if (body.sleepState === SLEEPING) continue;
      const { x, y, z } = body.position;
      if (y < layer - 1.2) {
        this.drop(i); // fell behind the tub, out of sight
        continue;
      }
      const thrown = y > layer + piece + loft;
      const over = z > z1 || x < x0 || x > x1; // over the front, or a side
      if (thrown || over || this.toPage(p.set(x, y, z))[1] < this.frame.y + half * this.scale) this.toss(i);
    }
  }

  // ------------------------------------------------------------ the hand (the pointer)

  private grip(radius: number) {
    const hand = this.hand;
    hand.r = radius;
    const sphere = hand.body.shapes[0] as Sphere;
    sphere.radius = radius;
    sphere.updateBoundingSphereRadius();
    hand.body.updateBoundingRadius();
    hand.body.aabbNeedsUpdate = true;
  }

  /** The pointer is at (px, py) on the page: the hand follows it across the pile. */
  aim(px: number, py: number) {
    if (!this.open || !this.over(px, py)) return this.release();
    const { tub, layer, piece } = this.spec;
    const y = layer + piece * (this.kind === 'balls' ? 0.35 : 0.4);
    const hit = this.onPlane(px, py, y);
    const margin = 0.4;
    if (!hit || hit.x < tub.x - tub.w / 2 - margin || hit.x > tub.x + tub.w / 2 + margin || hit.z < tub.z - tub.d / 2 - margin || hit.z > tub.z + tub.d / 2 + margin) {
      return this.release();
    }
    const hand = this.hand;
    hand.at.set(hit.x, y, hit.z);
    if (!hand.on) {
      // it arrives small and swells, so landing in the middle of the pile parts it instead of blasting it
      hand.on = true;
      hand.body.position.copy(hand.at);
      hand.body.velocity.setZero();
      this.grip(hand.R * 0.12);
      this.world.addBody(hand.body);
    }
  }

  release() {
    if (!this.hand.on) return;
    this.hand.on = false;
    this.world.removeBody(this.hand.body);
  }

  /** A press or a tap at (px, py): what lies around it jumps up. True if it landed on this pit. */
  pop(px: number, py: number) {
    if (!this.open || !this.over(px, py)) return false;
    const { layer, piece } = this.spec;
    const hit = this.onPlane(px, py, layer + piece / 2);
    if (!hit) return false;
    const reach = piece * (this.kind === 'balls' ? 3.4 : 2.6);
    const up = 560 / this.scale;
    const out = 260 / this.scale;
    for (const { body } of this.pieces) {
      const dx = body.position.x - hit.x;
      const dz = body.position.z - hit.z;
      const far = Math.hypot(dx, dz) || 1e-3;
      if (far > reach) continue;
      const push = 1 - far / reach;
      body.wakeUp();
      body.velocity.x += (dx / far) * out * push + rand(-0.3, 0.3) * out * push;
      body.velocity.z += (dz / far) * out * push + rand(-0.3, 0.3) * out * push;
      body.velocity.y += up * push * rand(0.75, 1.1);
      body.angularVelocity.set(rand(-9, 9) * push, rand(-9, 9) * push, rand(-9, 9) * push);
    }
    return true;
  }

  /** Once per step: the hand chases its target, and nothing goes too fast. */
  private rules() {
    const hand = this.hand;
    if (hand.on) {
      const at = hand.body.position;
      const most = GRASP / this.scale;
      let vx = (hand.at.x - at.x) * FOLLOW;
      let vz = (hand.at.z - at.z) * FOLLOW;
      const speed = Math.hypot(vx, vz);
      if (speed > most) {
        vx *= most / speed;
        vz *= most / speed;
      }
      hand.body.velocity.set(vx, 0, vz);
      at.y = hand.at.y;
    }
    const fling = FLING / this.scale;
    const calm = CALM / this.scale;
    for (const { body } of this.pieces) if (body.sleepState !== SLEEPING) tame(body, fling, calm);
  }

  /** Wakes what lies between the hand and where the pointer went; swells the hand once it has arrived. */
  private steer(dt: number) {
    const hand = this.hand;
    if (!hand.on) return;
    const at = hand.body.position;
    const swelling = hand.r < hand.R;
    if (!swelling && Math.abs(hand.at.x - at.x) + Math.abs(hand.at.z - at.z) < 0.004) return;
    const reach = hand.R + this.spec.piece;
    const x0 = Math.min(at.x, hand.at.x) - reach;
    const x1 = Math.max(at.x, hand.at.x) + reach;
    const z0 = Math.min(at.z, hand.at.z) - reach;
    const z1 = Math.max(at.z, hand.at.z) + reach;
    let near = false;
    for (const { body } of this.pieces) {
      const p = body.position;
      if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1 || Math.abs(p.y - at.y) > reach) continue;
      near = true;
      body.wakeUp();
    }
    if (!near) {
      // nothing within reach: the hand just goes where the pointer is
      at.copy(hand.at);
      hand.body.velocity.setZero();
      this.grip(hand.R);
    } else if (swelling) {
      this.grip(Math.min(hand.R, hand.r + hand.R * dt * 7));
    }
  }

  /** Advances the pit if anything in it is awake. True if it did. */
  step(dt: number) {
    if (!this.open) return false;
    this.steer(dt);
    if (!this.pieces.some(({ body }) => body.sleepState !== SLEEPING)) return false;
    this.world.step(STEP, dt, 3);
    this.sort();
    return true;
  }

  // ------------------------------------------------------------ over time

  /** Opens the pit once its stop has made its entrance, and keeps it stocked. True while something animates. */
  tend(now: number, clock: number) {
    this.clock = clock;
    if (!this.openAt) {
      if (!this.scale || !this.inView(0.1)) return false;
      // its stop slides the picture in first (motion.ts adds .is-in): wait for that, but not forever
      this.seenAt ||= now;
      const stop = this.el.closest('.stop');
      if (stop && !stop.classList.contains('is-in') && now - this.seenAt < 3000) return true;
      this.openAt = now + 1300;
      return true;
    }
    if (!this.open) {
      if (now < this.openAt) return true;
      this.open = true;
      this.populate(clock);
      return true;
    }
    if (now >= this.due) {
      this.due = now + 400;
      const watched = this.inView(0);
      // refilled at once while nobody looks, and after a pause in plain view
      if (this.pieces.length < this.spots.length * 0.6 && (now - this.out > 3000 || !watched)) this.restock(clock, watched);
    }
    return clock < this.popping;
  }

  /** Puts a piece back on every spot left bare: dropped in where it can be seen, quietly where it can't. */
  private restock(clock: number, watched: boolean) {
    const { piece, gap, layer } = this.spec;
    const near = gap * 0.75;
    for (const { x, z } of this.spots) {
      const taken = this.pieces.some(({ body: { position: p } }) => Math.abs(p.x - x) < near && Math.abs(p.z - z) < near && p.y < layer + piece * 2);
      if (!taken) this.add(x, z, watched ? clock : clock + rand(0, 0.5), watched ? rand(0.25, 1.1) : 0);
    }
    this.popping = clock + 0.8;
  }

  // ------------------------------------------------------------ drawing

  /** Draws the pit into its picture's place on the canvas, which shows the page from `top` down, `height` px tall. */
  render(renderer: WebGLRenderer, top: number, height: number) {
    const { frame, image } = this;
    if (!this.pieces.length || frame.y > top + height || frame.y + frame.h < top) return 0;
    const mesh = this.mesh;
    let n = 0;
    for (const { body, tint, born } of this.pieces) {
      const age = this.clock - born;
      if (age < 0) continue;
      const k = (age < 0.25 ? 1 - (1 - age / 0.25) ** 3 : 1) * this.spec.piece; // pops in
      const p = body.interpolatedPosition;
      const q = body.interpolatedQuaternion;
      mesh.setMatrixAt(n, matrix.compose(v1.set(p.x, p.y, p.z), turn.set(q.x, q.y, q.z, q.w), grow.set(k, k, k)));
      mesh.setColorAt(n++, tint);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (!n) return 0;
    // the camera sees the whole picture; only the frame's part of it is drawn
    renderer.setViewport(image.x, height - (image.y - top) - image.h, image.w, image.h);
    const y0 = Math.max(frame.y, top);
    const y1 = Math.min(frame.y + frame.h, top + height);
    renderer.setScissor(frame.x, height - (y1 - top), frame.w, y1 - y0);
    renderer.setScissorTest(true);
    renderer.render(this.scene, this.camera);
    return n;
  }

  /** What is going on in here (for testing in dev). */
  get stats() {
    return {
      kind: this.kind,
      open: this.open,
      spots: this.spots.length,
      pieces: this.pieces.length,
      awake: this.pieces.filter(({ body }) => body.sleepState !== SLEEPING).length,
      scale: +this.scale.toFixed(1),
      hand: this.hand.on,
    };
  }
}
