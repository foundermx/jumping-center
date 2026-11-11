// The hero's drone flight: from the hero camera down into the park, across the trampolines, past
// the ninja course and low over the ball pit, then up and back out while the whole park comes into view.
// Both the renders (flight-main.js) and the site's mascot tracking (poses.json) come from here.
//
// Flown like a gimbal drone: its speed changes gently (set per keyframe by `pace` and spread by
// distance travelled and slowed where it turns, not by keyframe count), it never rolls, and where
// it looks is smoothed over time, so it turns at an even rate instead of whipping round.
import * as THREE from 'three';

/**
 * Keyframes: where the drone is, what it looks at, its vertical fov (that of the 16:10 band wide
 * screens show), and how fast it flies there (relative). Slow at the start (the zoom gathers
 * speed), quick down the dive, slow inside so what it passes is seen up close, quick out, and
 * settling on the last view.
 */
export const KEYS = [
  { at: [-17, 12.5, 19.5], look: [0.2, 0.7, -0.8], fov: 33, pace: 0.5 }, // = shots/hero.js
  { at: [-11.5, 7.6, 13.2], look: [-1.4, 0.9, 0.2], fov: 38, pace: 1.5 },
  { at: [-6.6, 3.1, 8.4], look: [-2.6, 0.9, -1.2], fov: 46, pace: 1.25 },
  { at: [-5.0, 1.75, 4.6], look: [-2.2, 1.2, -3.0], fov: 52, pace: 0.85 },
  { at: [-3.2, 1.95, 0.7], look: [1.0, 1.5, -3.0], fov: 54, pace: 0.75 },
  { at: [-0.2, 1.95, -0.3], look: [4.6, 0.9, -1.4], fov: 54, pace: 0.7 },
  // to the ball pit, low over its front corner
  { at: [2.0, 1.8, 0.0], look: [5.2, 0.4, -1.8], fov: 54, pace: 0.6 },
  { at: [3.3, 1.6, 0.5], look: [5.6, 0.5, -1.6], fov: 54, pace: 0.5 },
  // and back out, up and away, still facing it while the whole park comes into view
  { at: [1.9, 3.2, 1.75], look: [5.4, 0.4, -1.5], fov: 52, pace: 0.7 },
  { at: [-1.5, 6.8, 9.5], look: [2.6, 0.3, -1.4], fov: 44, pace: 1.3 },
  { at: [-6.0, 13.5, 22.0], look: [0.6, 0.2, -1.0], fov: 36, pace: 0.45 },
];

/** Where the mascot's feet are: the front bed the site puts him on, measured on hero.webp. */
export const KID = [-3.86, 0.39, 3.64];

const v3 = (a) => new THREE.Vector3(...a);
const path = new THREE.CatmullRomCurve3(KEYS.map((k) => v3(k.at)), false, 'centripetal');
const aim = new THREE.CatmullRomCurve3(KEYS.map((k) => v3(k.look)), false, 'centripetal');
const scalar = (key) => new THREE.CatmullRomCurve3(KEYS.map((k, i) => new THREE.Vector3(k[key], i, 0)));
const fovs = scalar('fov');
const paces = scalar('pace');

/** How many degrees of turning take as long as a metre of flight at pace 1. */
const TURN = 10;

// Time: each stretch of path takes its length over its pace, or longer where the drone turns a
// lot. `u` is the splines' own parameter (keyframe i at u = i / (keys − 1)); `time[k]` is when the
// drone is at u = k / M, from 0 to 1.
const M = 4000;
const time = new Float64Array(M + 1);
{
  const heading = (u) => aim.getPoint(u).sub(path.getPoint(u)).normalize();
  let prev = path.getPoint(0);
  let was = heading(0);
  for (let k = 1; k <= M; k++) {
    const u = k / M;
    const p = path.getPoint(u);
    const h = heading(u);
    const pace = Math.max(0.2, paces.getPoint(u - 0.5 / M).x);
    time[k] = time[k - 1] + Math.hypot(p.distanceTo(prev) / pace, THREE.MathUtils.radToDeg(h.angleTo(was)) / TURN);
    prev = p;
    was = h;
  }
  for (let k = 0; k <= M; k++) time[k] /= time[M];
}

/** The splines' parameter at flight time t. */
function param(t) {
  let lo = 0;
  let hi = M;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (time[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = time[hi] - time[lo] || 1;
  return (lo + (t - time[lo]) / span) / M;
}

// Where it looks, sampled evenly in time and smoothed over a window of about a twentieth of the
// flight (none at the very start, which must be the hero camera, nor at the very end).
const S = 1000;
const look = [];
{
  const raw = [];
  for (let k = 0; k <= S; k++) {
    const u = param(k / S);
    raw.push(aim.getPoint(u).sub(path.getPoint(u)).normalize());
  }
  const sigma = 0.022 * S;
  const reach = Math.ceil(sigma * 3);
  for (let k = 0; k <= S; k++) {
    const sum = new THREE.Vector3();
    for (let j = -reach; j <= reach; j++) {
      const q = raw[Math.min(S, Math.max(0, k + j))];
      sum.addScaledVector(q, Math.exp(-(j * j) / (2 * sigma * sigma)));
    }
    const t = k / S;
    const keep = 1 - Math.min(1, t / 0.05, (1 - t) / 0.05);
    look.push(sum.normalize().lerp(raw[k], Math.max(0, keep)).normalize());
  }
}

/**
 * Puts `camera` where the drone is at `t` (0..1). `band`: how much taller than the 16:10 band the
 * rendered frame is (a square frame is 1.6 bands tall, so it sees more above and below).
 */
export function pose(t, camera, band = 1) {
  t = Math.min(Math.max(t, 0), 1);
  const u = param(t);
  const fov = fovs.getPoint(u).x;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * band));
  camera.position.copy(path.getPoint(u));
  const k = t * S;
  const i = Math.min(Math.floor(k), S - 1);
  const dir = look[i].clone().lerp(look[i + 1], k - i).normalize();
  camera.up.set(0, 1, 0);
  camera.lookAt(camera.position.clone().add(dir));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}
