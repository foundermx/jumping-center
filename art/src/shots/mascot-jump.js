import { THREE, studioEnv } from '../kit.js';
import { kid } from '../mascot.js';

// Transparent cut-out of the mascot mid-jump, composited and animated on the page.
export default async function build(pose = 'jump') {
  const scene = new THREE.Scene();
  scene.environment = await studioEnv('#ffffff', '#cfd8e8');
  scene.environmentIntensity = 0.9;
  scene.background = null;

  const k = await kid(pose);
  scene.add(k);
  const key = new THREE.RectAreaLight('#fff6ec', 9, 1.4, 1.4);
  key.position.set(-1.2, 1.9, 1.8);
  key.lookAt(0, 0.7, 0);
  scene.add(key);
  const rim = new THREE.RectAreaLight('#e6f0ff', 12, 0.8, 1.6);
  rim.position.set(1.3, 1.2, -1.4);
  rim.lookAt(0, 0.7, 0);
  scene.add(rim);

  const box = new THREE.Box3().setFromObject(k);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(24, 0.8, 0.1, 50);
  const dist = (size.y * 0.62) / Math.tan((24 * Math.PI) / 360);
  camera.position.set(center.x + dist * 0.18, center.y + 0.08, center.z + dist);
  camera.lookAt(center);
  return { scene, camera, width: 1000, height: 1250, exposure: 0.95, bounces: 5 };
}
