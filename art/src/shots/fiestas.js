import { THREE, M, C, at, box, canvasTexture, logoPanel, lightStrip, rng, studioEnv } from '../kit.js';
import { partyTable, bunting, balloon, balloonMats } from '../props.js';

// 04 / 04 — the party room: lime tables, bunting, confetti wall and the logo.
export default async function build() {
  const scene = new THREE.Scene();
  scene.environment = await studioEnv('#ffffff', '#e6e1d8');
  scene.environmentIntensity = 1.0;
  scene.background = new THREE.Color('#eef3fa');

  scene.add(at(box(30, 0.1, 30, M.floor), 0, -0.05, 0));
  const confetti = canvasTexture(2048, 1024, (ctx, w, h) => {
    ctx.fillStyle = C.wall;
    ctx.fillRect(0, 0, w, h);
    const r = rng(17);
    const colors = ['#ff4f9a', '#ffc928', C.blue, C.lime, '#19c6e6'];
    ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h * 0.8;
      if (x > w * 0.32 && x < w * 0.68 && y > h * 0.18 && y < h * 0.62) continue; // keep the logo clear
      ctx.strokeStyle = colors[i % colors.length];
      ctx.lineWidth = 9 + r() * 8;
      ctx.beginPath();
      const a = r() * Math.PI;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * 30, y + 40, x + Math.cos(a) * 60, y + Math.sin(a) * 60);
      ctx.stroke();
    }
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshStandardMaterial({ map: confetti, roughness: 0.9 }));
  wall.position.set(0, 3.5, -4);
  scene.add(wall);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), M.wall);
  side.rotation.y = -Math.PI / 2;
  side.position.set(5.2, 3.5, 3);
  scene.add(side);
  const logo = await logoPanel(2.6);
  scene.add(at(logo, 0.2, 2.75, -3.98));
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 7, 48), M.royal);
  scene.add(at(column, 4.2, 3.5, -2.6));

  scene.add(bunting([-5, 4.4, -3.9], [5, 4.4, -3.9], { sag: 0.5, flags: 18, size: 0.42 }));
  scene.add(bunting([-5, 4.6, -1], [4, 4.6, -3.6], { sag: 0.6, flags: 14, size: 0.42, seed: 5 }));
  for (let i = 0; i < 3; i++) scene.add(lightStrip(-2 + i * 2.6, 5.6, -1.2, 0.3, 40, Math.PI / 2, 2.4));
  const roof = box(14, 0.1, 14, M.white);
  roof.position.set(0, 5.75, 2);
  scene.add(roof);

  const t1 = partyTable({ length: 3.2, width: 1.0, seats: 4 });
  t1.rotation.y = -0.32;
  scene.add(at(t1, 1.0, 0, 0.4));
  const t2 = partyTable({ length: 3.2, width: 1.0, seats: 4 });
  t2.rotation.y = -0.32;
  scene.add(at(t2, 2.4, 0, -2.2));

  const t3 = partyTable({ length: 2.6, width: 1.0, seats: 3 });
  t3.rotation.y = 1.25;
  scene.add(at(t3, -2.6, 0, -2.4));
  [[3.3, 2.7, -3.1], [3.65, 3.05, -3.3], [3.0, 3.15, -3.4], [3.5, 2.45, -2.9], [-3.6, 2.9, -3.4], [-3.25, 2.6, -3.2], [-3.9, 2.45, -3.0]].forEach(([x, y, z], i) =>
    scene.add(balloon(x, y, z, balloonMats[i % balloonMats.length], i + 3)));

  const camera = new THREE.PerspectiveCamera(46, 1.45, 0.1, 100);
  camera.position.set(-1.6, 1.7, 4.2);
  camera.lookAt(0.8, 1.45, -1.6);
  return { scene, camera, width: 1600, height: 1100, exposure: 0.9 };
}
