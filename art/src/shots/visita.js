import { THREE } from '../kit.js';
import build from './trampolines.js';

// Planea tu visita — same hall, framed on the logo wall.
export default async () => {
  const shot = await build();
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 200);
  camera.position.set(-1.0, 2.6, 5.2);
  camera.lookAt(-4.2, 1.6, -9);
  return { ...shot, camera, width: 1600, height: 1000 };
};
