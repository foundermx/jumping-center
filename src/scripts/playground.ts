// Physics playground: the foam cubes of «Zona de retos» and the balls of «Zona infantil».
//
// Each pit is a real 3D scene (play/pit.ts): the tub and what stands in it, rebuilt from the
// render's own geometry and seen through the render's own camera, so the live pieces lie on the
// painted pile in the picture's perspective, across its whole surface. The painted pile stays
// underneath, for wherever the live one is thinned out.
//
// What is thrown out of a pit, or falls over its edge, moves into the page world (here): the whole
// document, 1 px = 1 cm, gravity down the page, the page edges as walls and the bottom of the
// footer as the floor, where everything ends up and can still be pushed around. The pointer is a
// solid hand in every world. Everything is drawn on one canvas laid over the page.
import { Body, ContactMaterial, type GSSolver, Material, Plane, SAPBroadphase, Box, Sphere, Vec3, World } from 'cannon-es';
import {
  type Color,
  DirectionalLight,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  NeutralToneMapping,
  OrthographicCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Pit, type Throw } from './play/pit';
import { SCENES } from './play/scenes';
import { CALM, clamp, FLING, type Kind, paint, rand, SHAPES, SOFT, soften, STEP, studio, tame, U } from './play/shared';

/** Toys already lying in the footer on arrival, so the floor is never empty (desktop, phone). */
const SEED = { cubes: [4, 2], balls: [7, 4] } as const;

/** The most pieces left loose on the page; past that the oldest ones go (desktop, phone). */
const LOOSE = { cubes: [16, 6], balls: [64, 28] } as const;

const FOLLOW = 45; // how eagerly the hand chases the pointer, 1/s
const GRASP = 10; // fastest the hand may move, m/s: a quicker pointer drags it along behind

interface Item {
  body: Body;
  kind: Kind;
  size: number;
  tint: Color;
  born: number;
  /** Scale it was handed over at: it grows or shrinks from there to its own size. */
  from: number;
  dying: number;
  freed: number;
}

/** Returns false when the browser cannot give us WebGL: the page then stays as it was. */
export function start(): boolean {
  const root = document.documentElement;
  const ground = document.querySelector('[data-play-floor]') ?? document.body;
  const canvas = document.createElement('canvas');
  const box = document.createElement('div');
  box.className = 'playground';
  box.setAttribute('aria-hidden', 'true');
  box.append(canvas);

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    return false;
  }
  document.body.append(box);
  renderer.autoClear = false;
  // as the renders were developed, so a live piece looks like the painted ones around it
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 0.85;

  const lite = matchMedia('(pointer: coarse), (width < 700px)').matches;
  const tier = lite ? 1 : 0;
  const env = studio(renderer);
  if (!lite) renderer.shadowMap.enabled = true;

  // ------------------------------------------------------------------ the page's picture

  const scene = new Scene();
  scene.environment = env;
  const camera = new OrthographicCamera(0, 1, 0, -1, 1, 40);
  camera.position.z = 20;
  const sun = new DirectionalLight('#ffffff', 1.1);
  scene.add(sun, sun.target);
  let sunReach = 10;
  if (!lite) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 3;
  }

  const MAX = { cubes: 120, balls: 200 };
  const meshes = {} as Record<Kind, InstancedMesh>;
  for (const kind of ['cubes', 'balls'] as const) {
    const mesh = new InstancedMesh(SHAPES[kind], new MeshStandardMaterial({ roughness: 0.36 }), MAX[kind]);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = !lite;
    mesh.count = 0;
    scene.add((meshes[kind] = mesh));
  }

  // ------------------------------------------------------------------ the page's world

  const world = new World({ gravity: new Vec3(0, -9.82, 0), allowSleep: true });
  world.broadphase = new SAPBroadphase(world);
  (world.solver as GSSolver).iterations = 8;

  const mBall = new Material();
  const mCube = new Material();
  const mSolid = new Material(); // the floor and the page edges
  const mSlick = new Material(); // the two panes that bound the depth: nothing sticks
  const mHand = new Material();
  const touch = (a: Material, b: Material, friction: number, restitution: number) =>
    world.addContactMaterial(new ContactMaterial(a, b, { friction, restitution }));
  touch(mBall, mBall, 0.2, 0.4);
  touch(mBall, mCube, 0.35, 0.3);
  touch(mCube, mCube, 0.6, 0.12);
  touch(mBall, mSolid, 0.3, 0.55);
  touch(mCube, mSolid, 0.65, 0.2);
  touch(mBall, mSlick, 0, 0.3);
  touch(mCube, mSlick, 0, 0.15);
  touch(mBall, mHand, 0.3, 0.15);
  touch(mCube, mHand, 0.45, 0.05);
  soften(world, () => SOFT / U);

  let width = 0; // page width, px
  let bottom = 0; // bottom of the page: the floor, px
  let height = 0; // canvas height, px
  let top = -1; // where the canvas window starts, px
  let depth = 1; // half the thickness of the world, m
  let clock = 0; // seconds the playground has been running
  let seeded = false;
  const sizes = { cubes: 0.5, balls: 0.3 }; // m: as big as a piece looks in its pit
  const items: Item[] = [];

  const pane = (rx: number, ry: number, material: Material) => {
    const body = new Body({ type: Body.STATIC, shape: new Plane(), material });
    body.quaternion.setFromEuler(rx, ry, 0);
    world.addBody(body);
    return body;
  };
  const edges = {
    floor: pane(-Math.PI / 2, 0, mSolid),
    roof: pane(Math.PI / 2, 0, mSolid),
    left: pane(0, Math.PI / 2, mSolid),
    right: pane(0, -Math.PI / 2, mSolid),
    back: pane(0, 0, mSlick),
    front: pane(0, Math.PI, mSlick),
  };

  function spawn(kind: Kind, size: number, x: number, y: number, z: number, tint = paint(kind), from = 1) {
    if (items.filter((it) => it.kind === kind).length >= MAX[kind]) return null;
    const ball = kind === 'balls';
    const body = new Body({
      mass: (ball ? 1.1 : 0.55) * size ** 3,
      shape: ball ? new Sphere(size / 2) : new Box(new Vec3(size / 2, size / 2, size / 2)),
      material: ball ? mBall : mCube,
      position: new Vec3(x, y, z),
      linearDamping: ball ? 0.1 : 0.18,
      angularDamping: ball ? 0.3 : 0.25,
      sleepSpeedLimit: clamp(0.12 / size, 0.14, 0.45),
      sleepTimeLimit: 0.5,
    });
    world.addBody(body);
    const item = { body, kind, size, tint, born: clock, from, dying: 0, freed: clock };
    items.push(item);
    request();
    return item;
  }

  /** A piece thrown out of a pit carries on here, from the same spot, at the same speed. */
  function adopt(t: Throw) {
    const size = sizes[t.kind];
    const item = spawn(t.kind, size, t.x / U, -t.y / U, rand(0.15, 0.85) * (depth - size * 0.9), t.tint, t.size / U / size);
    if (!item) return;
    const { body } = item;
    body.velocity.set(t.vx / U, -t.vy / U, 0);
    body.quaternion.set(t.turn.x, t.turn.y, t.turn.z, t.turn.w);
    body.angularVelocity.set(t.spin.x, t.spin.y, t.spin.z);
    for (const copy of [body.previousPosition, body.interpolatedPosition]) copy.copy(body.position);
    for (const copy of [body.previousQuaternion, body.interpolatedQuaternion]) copy.copy(body.quaternion);
  }

  const pits = [...document.querySelectorAll<HTMLElement>('[data-pit]')].flatMap((el) => {
    const spec = SCENES[el.dataset.pit as Kind];
    return spec ? [new Pit(spec, el, env, !lite, adopt)] : [];
  });
  // Every shader up front, off the main thread where the browser can: no hitch on the first throw.
  for (const [s, c] of [[scene, camera], ...pits.map((pit) => pit.view)] as const) renderer.compileAsync(s, c).catch(() => {});

  function remove(index: number) {
    const [item] = items.splice(index, 1);
    world.removeBody(item.body);
  }

  function nudge(body: Body, dy: number) {
    for (const point of [body.position, body.previousPosition, body.interpolatedPosition]) point.y += dy;
    body.aabbNeedsUpdate = true;
    body.wakeUp();
  }

  /** Wakes what rests around a spot: sleeping bodies don't notice their support leaving. */
  function stir(x: number, y: number, reach: number) {
    for (const { body } of items) {
      if (Math.abs(body.position.x - x) < reach && Math.abs(body.position.y - y) < reach) body.wakeUp();
    }
  }

  function scatter(kind: Kind, count: number, lift: number) {
    const size = sizes[kind];
    for (let i = 0; i < count; i++) {
      const s = size * rand(0.93, 1.05);
      spawn(kind, s, rand(0.06, 0.94) * (width / U), -bottom / U + s / 2 + lift + i * 0.3, rand(-1, 1) * (depth - s * 0.9));
    }
  }

  // ------------------------------------------------------------------ the hand (the pointer)

  // A row of spheres across the whole depth: under the flat camera it acts as a disc.
  const hand = { body: new Body({ type: Body.KINEMATIC, material: mHand }), on: false, x: 0, y: 0, r: 0, R: 0.45 };

  function grip(radius: number) {
    hand.r = radius;
    for (const shape of hand.body.shapes) {
      (shape as Sphere).radius = radius;
      shape.updateBoundingSphereRadius();
    }
    hand.body.updateBoundingRadius();
    hand.body.aabbNeedsUpdate = true;
  }

  function letGo() {
    for (const pit of pits) pit.release();
    if (!hand.on) return;
    hand.on = false;
    world.removeBody(hand.body);
  }

  function makeHand(radius: number) {
    letGo();
    const body = new Body({ type: Body.KINEMATIC, material: mHand, allowSleep: false });
    const count = Math.ceil((2 * depth) / radius) + 1;
    for (let i = 0; i < count; i++) body.addShape(new Sphere(radius), new Vec3(0, 0, -depth + (2 * depth * i) / (count - 1)));
    hand.body = body;
    hand.R = radius;
  }

  function aim(event: PointerEvent) {
    const px = event.clientX + scrollX;
    const py = event.clientY + scrollY;
    for (const pit of pits) pit.aim(px, py);
    hand.x = event.clientX / U;
    hand.y = -py / U;
    if (!hand.on) {
      // it arrives small and swells, so landing in the middle of a pile parts it instead of blasting it
      hand.on = true;
      hand.body.position.set(hand.x, hand.y, 0);
      hand.body.velocity.setZero();
      grip(hand.R * 0.12);
      world.addBody(hand.body);
    }
    request();
  }

  /** A press or a tap: everything around it jumps away. */
  function pop(event: PointerEvent) {
    const px = event.clientX + scrollX;
    const py = event.clientY + scrollY;
    for (const pit of pits) pit.pop(px, py);
    const x = px / U;
    const y = -py / U;
    const reach = 1.7;
    for (const { body } of items) {
      const dx = body.position.x - x;
      const dy = body.position.y - y;
      const far = Math.hypot(dx, dy);
      if (far > reach) continue;
      const push = 1 - far / reach;
      body.wakeUp();
      body.velocity.x += (dx / (far || 1)) * 5 * push + rand(-0.6, 0.6) * push;
      body.velocity.y += (dy / (far || 1)) * 5 * push + 4.5 * push;
      body.angularVelocity.set(rand(-9, 9) * push, rand(-9, 9) * push, rand(-9, 9) * push);
    }
    request();
  }

  world.addEventListener('postStep', () => {
    if (hand.on) {
      const at = hand.body.position;
      let vx = (hand.x - at.x) * FOLLOW;
      let vy = (hand.y - at.y) * FOLLOW;
      const speed = Math.hypot(vx, vy);
      if (speed > GRASP) {
        vx *= GRASP / speed;
        vy *= GRASP / speed;
      }
      hand.body.velocity.set(vx, vy, 0);
    }
    for (const { body } of items) if (body.sleepState !== Body.SLEEPING) tame(body, FLING / U, CALM / U);
  });

  // ------------------------------------------------------------------ layout

  let stale = true;
  let resized = 0;
  let sized = 0; // page width the renderer was last sized for

  function layout() {
    stale = false;
    for (const pit of pits) pit.layout();
    const page = root.clientWidth;
    const floor = ground.getBoundingClientRect().bottom + scrollY;
    const tall = canvas.clientHeight;

    if (page !== width) {
      // a different page: what lies loose comes back down where it was, once the window has stopped being dragged
      if (width && performance.now() - resized < 160) {
        stale = true;
        setTimeout(request, 170);
        return;
      }
      const loose = items.filter((it) => !it.dying).map((it) => ({ kind: it.kind, tint: it.tint, at: it.body.position.x / (width / U) }));
      while (items.length) remove(items.length - 1);
      width = page;
      bottom = floor;
      for (const kind of ['cubes', 'balls'] as const) {
        const pit = pits.find((p) => p.kind === kind && p.scale);
        sizes[kind] = pit ? pit.size / U : clamp(width * (kind === 'cubes' ? 0.04 : 0.022), kind === 'cubes' ? 28 : 16, kind === 'cubes' ? 64 : 34) / U;
      }
      depth = Math.max(1, sizes.cubes * 2); // room for a cube to tumble
      edges.floor.position.y = -bottom / U;
      edges.roof.position.y = 1;
      edges.right.position.x = width / U;
      edges.back.position.z = -depth;
      edges.front.position.z = depth;
      for (const edge of Object.values(edges)) edge.aabbNeedsUpdate = true;
      makeHand(sizes.cubes * 0.7);
      if (!seeded) {
        seeded = true;
        scatter('cubes', SEED.cubes[tier], 0.2);
        scatter('balls', SEED.balls[tier], 0.35);
      } else {
        loose.forEach(({ kind, tint, at }, i) => {
          const s = sizes[kind];
          spawn(kind, s, clamp(at, 0.04, 0.96) * (width / U), -bottom / U + s / 2 + 0.2 + i * 0.12, rand(-1, 1) * (depth - s * 0.9), tint);
        });
      }
    } else if (Math.abs(floor - bottom) > 0.2) {
      // the same page, longer or shorter (an answer opening, a late font): the floor moves, and what lies on it
      const drop = (bottom - floor) / U;
      const line = -bottom / U;
      for (const it of items) if (it.body.position.y < line + 6) nudge(it.body, drop);
      bottom = floor;
      edges.floor.position.y = -bottom / U;
      edges.floor.aabbNeedsUpdate = true;
      top = -1; // and the window goes where the new page has room for it
    }

    if (tall !== height || page !== sized) {
      height = tall;
      sized = page;
      // Sharp, but never more pixels than a mid-range GPU fills comfortably.
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2, Math.sqrt(5.5e6 / (page * tall))));
      renderer.setSize(page, tall, false);
      camera.right = page / U;
      sunReach = Math.hypot(page, tall) / U / 2 + depth;
      const lens = sun.shadow.camera;
      lens.left = lens.bottom = -sunReach;
      lens.right = lens.top = sunReach;
      lens.near = 1;
      lens.far = 2 * sunReach + 9;
      lens.updateProjectionMatrix();
      top = -1;
    }
  }

  /** Moves the canvas window to where the viewport is, when the viewport gets near its edge. True if it moved. */
  function place() {
    const end = Math.max(0, bottom - height);
    const lo = top <= 0 ? 0 : top + 40;
    const hi = top + height - (top >= end ? 0 : 40);
    if (top >= 0 && scrollY >= lo && scrollY + innerHeight <= hi) return false;
    const y = Math.round(clamp(scrollY - (height - innerHeight) / 2, 0, end));
    if (y === top) return false;
    top = y;
    canvas.style.transform = `translate3d(0, ${y}px, 0)`;
    camera.top = -y / U;
    camera.bottom = -(y + height) / U;
    camera.updateProjectionMatrix();
    const cx = width / U / 2;
    const cy = -(y + height / 2) / U;
    const far = sunReach + 5;
    sun.target.position.set(cx, cy, 0);
    sun.position.set(cx - 0.35 * far, cy + 0.78 * far, 0.52 * far); // from above, a little to the left and the front
    return true;
  }

  // ------------------------------------------------------------------ one frame

  /** Advances the page world if anything in it is awake. Asleep, it costs nothing. */
  function simulate(dt: number) {
    if (hand.on) {
      const at = hand.body.position;
      const swelling = hand.r < hand.R;
      if (swelling || Math.abs(hand.x - at.x) + Math.abs(hand.y - at.y) > 0.004) {
        // wake whatever lies between the hand and where the pointer went
        const reach = hand.R + 0.6;
        const x0 = Math.min(at.x, hand.x) - reach;
        const x1 = Math.max(at.x, hand.x) + reach;
        const y0 = Math.min(at.y, hand.y) - reach;
        const y1 = Math.max(at.y, hand.y) + reach;
        let near = false;
        for (const { body } of items) {
          const p = body.position;
          if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
          near = true;
          body.wakeUp();
        }
        if (!near) {
          at.set(hand.x, hand.y, 0);
          hand.body.velocity.setZero();
          grip(hand.R);
        } else if (swelling) {
          grip(Math.min(hand.R, hand.r + hand.R * dt * 7));
        }
      }
    }
    if (!items.some((it) => it.body.sleepState !== Body.SLEEPING)) return false;
    world.step(STEP, dt, 3);
    return true;
  }

  let due = 0;

  /** Keeps the floor from overflowing: past the limit the oldest loose pieces go, preferably unseen. */
  function tend(now: number) {
    if (now < due) return;
    due = now + 300;
    const hi = -top / U;
    const lo = -(top + height) / U;
    const shown = (it: Item) => (it.body.position.y < hi && it.body.position.y > lo ? 1 : 0);
    const loose = items.filter((it) => !it.dying).sort((a, b) => shown(a) - shown(b) || a.freed - b.freed);
    const room = { cubes: LOOSE.cubes[tier], balls: LOOSE.balls[tier] };
    for (let i = loose.length - 1; i >= 0; i--) if (room[loose[i].kind]-- <= 0) loose[i].dying = clock;
  }

  const matrix = new Matrix4();
  const at = new Vector3();
  const turn = new Quaternion();
  const grow = new Vector3();

  /** Copies the loose bodies in the window to the instanced meshes. Returns how many, and whether any still animates. */
  function draw() {
    const hi = -top / U;
    const lo = -(top + height) / U;
    let shown = 0;
    let busy = false;
    meshes.cubes.count = meshes.balls.count = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const p = it.body.interpolatedPosition;
      const q = it.body.interpolatedQuaternion;
      const age = clock - it.born;
      let k = 1;
      if (it.from !== 1) {
        // handed over from a pit: from the size it had there to its own
        const t = Math.min(1, age / 0.35);
        k = it.from + (1 - it.from) * (1 - (1 - t) ** 2);
        busy ||= t < 1;
      } else if (age < 0.22) {
        k = 1 - (1 - age / 0.22) ** 3; // pops in
        busy = true;
      }
      if (it.dying) {
        k *= 1 - (clock - it.dying) / 0.2; // and shrinks away
        if (k <= 0) {
          remove(i);
          stir(p.x, p.y, 1.5);
          continue;
        }
        busy = true;
      }
      if (p.y - it.size > hi || p.y + it.size < lo) continue;
      const mesh = meshes[it.kind];
      const n = mesh.count++;
      shown++;
      k *= it.size;
      mesh.setMatrixAt(n, matrix.compose(at.set(p.x, p.y, p.z), turn.set(q.x, q.y, q.z, q.w), grow.set(k, k, k)));
      mesh.setColorAt(n, it.tint);
    }
    for (const mesh of Object.values(meshes)) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    return { shown, busy };
  }

  let raf = 0;
  let before = 0;
  let visible = false;
  let frames = 0;
  let dirty = true;

  function request() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function frame(now: number) {
    raf = 0;
    frames++;
    const dt = Math.min((now - before) / 1000, 1 / 30);
    before = now;
    if (stale) {
      layout();
      dirty = true;
    }
    if (place()) dirty = true;
    let busy = simulate(dt);
    for (const pit of pits) busy = pit.step(dt) || busy;
    clock += dt;
    for (const pit of pits) busy = pit.tend(now, clock) || busy;
    tend(now);
    const loose = draw();
    busy ||= loose.busy;

    if (busy || dirty) {
      dirty = false;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.clear();
      let shown = loose.shown;
      for (const pit of pits) shown += pit.render(renderer, top, height);
      // loose pieces are in front of everything: over the pits, whatever their depth there
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.clearDepth();
      if (loose.shown) renderer.render(scene, camera);
      if (visible !== shown > 0) canvas.style.visibility = (visible = shown > 0) ? 'visible' : 'hidden';
    }
    if (busy) request();
  }

  // ------------------------------------------------------------------ wiring

  addEventListener('pointermove', (event) => event.pointerType !== 'touch' && aim(event), { passive: true });
  addEventListener(
    'pointerdown',
    (event) => {
      if ((event.target as Element).closest?.('[popover]')) return; // the open menu covers the page
      pop(event);
    },
    { passive: true },
  );
  // While the page scrolls under a resting pointer the hand lets go: scrolling past a pit must not plough through it.
  addEventListener(
    'scroll',
    () => {
      letGo();
      request();
    },
    { passive: true },
  );
  root.addEventListener('pointerleave', letGo);
  addEventListener('blur', letGo);

  const moved = () => {
    stale = true;
    request();
  };
  new ResizeObserver(moved).observe(document.body);
  addEventListener('resize', () => {
    resized = performance.now();
    moved();
  });
  canvas.addEventListener('webglcontextlost', (event) => event.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => {
    dirty = true;
    request();
  });

  if (import.meta.env.DEV) {
    Object.assign(window, { __play: { world, items, pits, frames: () => frames, request, sizes, renderer } });
  }

  request();
  return true;
}
