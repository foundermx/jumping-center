import { THREE, at, hall, studioEnv } from '../kit.js';
import { softPlay, ballPit } from '../props.js';

// 03 / 04 — soft play: nets, padded tubes, purple arch and the two-tone slide into the ball pit.
export default async function build() {
  const scene = new THREE.Scene();
  scene.environment = await studioEnv('#ffffff', '#e4e1da');
  scene.environmentIntensity = 1.0;
  scene.background = new THREE.Color('#eef3fa');

  scene.add(await hall({ width: 20, back: -5, front: 10, sides: ['right'], lightIntensity: 55, seed: 21 }));
  scene.add(at(softPlay({ cols: 3, rows: 2, bay: 1.25, level: 1.2, levels: 2 }), -0.6, 0, -2.2));
  scene.add(at(ballPit({ w: 3.4, d: 2.0, seed: 5 }), 1.9, 0, 0.75));

  const camera = new THREE.PerspectiveCamera(48, 1.45, 0.1, 200);
  camera.position.set(-0.6, 1.85, 4.5);
  camera.lookAt(0.55, 1.35, -1.4);
  return { scene, camera, width: 1600, height: 1100, exposure: 0.85 };
}
