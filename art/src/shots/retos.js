import { THREE, foamPit, at, hall, studioEnv } from '../kit.js';
import { ninja } from '../props.js';

// 02 / 04 — under the ninja frame: rings, bags and cargo net over the foam pit.
export default async function build() {
  const scene = new THREE.Scene();
  scene.environment = await studioEnv('#ffffff', '#e4e1da');
  scene.environmentIntensity = 1.0;
  scene.background = new THREE.Color('#eef3fa');

  scene.add(await hall({ width: 24, back: -6, front: 10, sides: ['left'], lightIntensity: 55, seed: 11 }));
  const course = ninja({ length: 6.4, depth: 2.6, height: 3.4 });
  scene.add(at(course, 0, 0, -1.6));
  scene.add(at(foamPit({ w: 6.6, d: 3.6, cube: 0.36, seed: 12 }), 0, 0, -1.4));

  const camera = new THREE.PerspectiveCamera(50, 1.45, 0.1, 200);
  camera.position.set(-1.1, 2.05, 3.9);
  camera.lookAt(0.3, 1.95, -2.0);
  return { scene, camera, width: 1600, height: 1100, exposure: 0.85 };
}
