// What the page world and the pits have in common: units, limits and the look of a piece.
import type { Body, World } from 'cannon-es';
import {
  BackSide,
  BufferAttribute,
  Color,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export type Kind = 'cubes' | 'balls';

/** Page px per metre of the page world: there, 1 px = 1 cm. */
export const U = 100;
export const STEP = 1 / 120;

// On-screen limits, the same in every world whatever its scale: each converts them with its px per metre.
/** Gravity as it looks on screen, px/s². */
export const GRAVITY = 982;
/** Fastest anything may travel, px/s: a throw clears a screen, a fall ends in a bounce. */
export const FLING = 1300;
/** Below this, px/s, pieces are damped hard, so piles settle and sleep instead of jittering. */
export const CALM = 30;
/** Slower touches than this, px/s, don't bounce. */
export const SOFT = 60;
/** Fastest spin, rad/s. */
export const SPIN = 30;

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

const COLORS: Record<Kind, Color[]> = {
  cubes: ['#bff01a', '#1d37d2'].map((c) => new Color(c)),
  balls: ['#bff01a', '#1d37d2', '#19c6e6'].map((c) => new Color(c)),
};

/** One of the kind's colours, a touch lighter or darker than the next one. */
export const paint = (kind: Kind) => COLORS[kind][Math.floor(Math.random() * COLORS[kind].length)].clone().offsetHSL(0, 0, rand(-0.025, 0.025));

/** Unit-sized pieces, as built for the renders (rbox with a 0.06 corner on a 0.36 cube). */
export const SHAPES = { cubes: new RoundedBoxGeometry(1, 1, 1, 3, 0.167), balls: new SphereGeometry(0.5, 22, 14) };

/**
 * Nothing bounces off a slow touch. cannon-es applies restitution to every contact, even the tiny
 * speed gravity adds in one step, so a resting pile would tremble forever and never sleep.
 */
export function soften(world: World, slow: () => number) {
  const narrow = world.narrowphase;
  const contact = narrow.createContactEquation.bind(narrow);
  narrow.createContactEquation = (bi, bj, si, sj, a, b) => {
    const equation = contact(bi, bj, si, sj, a, b);
    if (bi.velocity.distanceSquared(bj.velocity) < slow() ** 2) equation.restitution = 0;
    return equation;
  };
}

/** Caps speed and spin, and damps the slow so they come to rest (speeds in the world's own units). */
export function tame(body: Body, fling: number, calm: number) {
  const v = body.velocity;
  const w = body.angularVelocity;
  const speed = v.length();
  if (speed > fling) v.scale(fling / speed, v);
  else if (speed < calm) {
    v.scale(0.94, v);
    w.scale(0.9, w);
  }
  const spin = w.length();
  if (spin > SPIN) w.scale(SPIN / spin, w);
}

/** The light of the renders: a white-to-warm-grey sky (studioEnv in art/src/kit.js), as an environment map. */
export function studio(renderer: WebGLRenderer): Texture {
  const geometry = new SphereGeometry(1, 48, 24);
  const top = new Color('#ffffff');
  const bottom = new Color('#e4e1da');
  const tint = new Color();
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    tint.lerpColors(bottom, top, ((position.getY(i) + 1) / 2) ** 1.5).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const sky = new Scene();
  sky.add(new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(sky, 0.02).texture;
  pmrem.dispose();
  geometry.dispose();
  return env;
}
