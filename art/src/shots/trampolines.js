import { THREE, court, foamPit, at, hall, logoPanel, studioEnv } from '../kit.js';
import { ninja, softPlay } from '../props.js';

// 01 / 04 — low camera across the court: logo wall left, ninja frame and soft play right.
export default async function build() {
  const scene = new THREE.Scene();
  scene.environment = await studioEnv('#ffffff', '#e4e1da');
  scene.environmentIntensity = 0.8;
  scene.background = new THREE.Color('#eef3fa');

  scene.add(await hall({ width: 30, back: -10, front: 10, sides: ['left', 'right'], lightIntensity: 48 }));

  const logo = await logoPanel(4.2);
  scene.add(at(logo, -6.4, 0.3 + logo.userData.height / 2, -9.86));

  scene.add(at(court({ cols: 5, rows: 4, cell: 2.3, height: 0.42 }), -3.2, 0, 0.2));
  scene.add(at(ninja({ length: 6, depth: 2.6, height: 3.4 }), 5.6, 0, -6.4));
  scene.add(at(foamPit({ w: 6.2, d: 2.8, seed: 21 }), 5.6, 0, -6.4));
  scene.add(at(softPlay({ cols: 3, rows: 2, bay: 1.25, level: 1.2, levels: 2 }), 11.2, 0, -6.6));

  const camera = new THREE.PerspectiveCamera(50, 2, 0.1, 200);
  camera.position.set(-4.6, 1.45, 7.9);
  camera.lookAt(0.2, 2.1, -4.5);

  return { scene, camera, width: 2000, height: 1000, exposure: 0.9 };
}
