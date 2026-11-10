// The two pits as they were built for their renders, in the renders' own metres: the camera that
// took each picture and the geometry in front of it. Copied from art/src/shots/retos.js and
// infantil.js and the builders they use (foamPit in art/src/kit.js; ballPit and ninja in
// art/src/props.js). If a shot changes, change it here too.
import type { Kind } from './shared';

type V3 = readonly [number, number, number];

export interface PitScene {
  kind: Kind;
  /** Vertical field of view of the render camera, degrees. */
  fov: number;
  eye: V3;
  target: V3;
  /** Inside of the tub: centre (x, z) and size; its walls: thickness, height, corner radius. */
  tub: { x: number; z: number; w: number; d: number; wall: number; height: number; round: number };
  /** Top of the painted pile: the live layer lies on it, so the painted one shows wherever it is thinned out. */
  layer: number;
  /** Cube edge or ball diameter. */
  piece: number;
  /** Closest two pieces of the live layer may lie, centre to centre. */
  gap: number;
  /** Square posts standing in the tub: x, z, side, top. */
  posts: readonly (readonly [number, number, number, number])[];
  /** Hanging bags reaching into the pile: x, y (middle), z, length, radius. */
  bags: readonly (readonly [number, number, number, number, number])[];
}

/** Both pictures were rendered at 1600 × 1100. */
export const ASPECT = 1600 / 1100;

export const SCENES: Record<Kind, PitScene> = {
  // retos.js: foamPit({ w: 6.6, d: 3.6, cube: 0.36 }) at z -1.4, under ninja({ length: 6.4, depth: 2.6 }) at z -1.6.
  // The painted pile is three layers of cubes; the live one takes the place of the top layer.
  cubes: {
    kind: 'cubes',
    fov: 50,
    eye: [-1.1, 2.05, 3.9],
    target: [0.3, 1.95, -2.0],
    tub: { x: 0, z: -1.4, w: 6.6, d: 3.6, wall: 0.36, height: 0.82, round: 0.07 },
    layer: 0.95,
    piece: 0.36,
    gap: 0.49,
    posts: [-3.2, 0, 3.2].flatMap((x) => [-2.9, -0.3].map((z) => [x, z, 0.15, 3.4] as const)),
    bags: [
      [-0.55, 1.35, -1.35, 1.15, 0.17],
      [0.2, 1.3, -1.35, 1.15, 0.17],
      [2.75, 1.45, -1.35, 0.95, 0.15],
    ],
  },
  // infantil.js: ballPit({ w: 3.4, d: 2.0 }) at (1.9, 0.75): balls 0.15 across in two layers, walls 0.65 tall.
  balls: {
    kind: 'balls',
    fov: 48,
    eye: [-0.6, 1.85, 4.5],
    target: [0.55, 1.35, -1.4],
    tub: { x: 1.9, z: 0.75, w: 3.4, d: 2.0, wall: 0.3, height: 0.65, round: 0.1 },
    layer: 0.425,
    piece: 0.15,
    gap: 0.154,
    posts: [],
    bags: [],
  },
};
