import { THREE, M, court, foamPit, at, box, rbox, rod, logoPanel, canvasTexture, wallArt, studioEnv } from '../kit.js';
import { ninja, softPlay, ballPit, partyTable } from '../props.js';

// Hero: the whole park as a cut-away diorama floating on the cream page (transparent background).
export default async function build() {
  const scene = new THREE.Scene();
  scene.environment = await studioEnv('#ffffff', '#ddd6cc');
  scene.environmentIntensity = 1.05;
  scene.background = null;

  const W = 17, D = 11.5, H = 5.2;
  // slab
  scene.add(at(rbox(W + 0.6, 0.55, D + 0.6, 0.18, new THREE.MeshStandardMaterial({ color: '#b9bdc6', roughness: 0.6 })), 0, -0.275, 0));
  scene.add(at(box(W, 0.02, D, M.floor), 0, 0.01, 0));

  // walls: back (z-) and left (x-), painted band + windows + logo
  const paint = 2.1;
  const art = (len, seed) => new THREE.MeshStandardMaterial({ map: canvasTexture(2048, Math.round((2048 * paint) / len), (ctx, w, h) => wallArt(ctx, w, h, { seed })), roughness: 0.9 });
  const wall = (len, seed) => {
    const g = new THREE.Group();
    const t = 0.22;
    g.add(at(box(len, H, t, M.wall), 0, H / 2, 0));
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, paint), art(len, seed));
    p.position.set(0, paint / 2, t / 2 + 0.003);
    g.add(p);
    const n = Math.floor(len / 2.4);
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + (i + 0.5) * (len / n);
      const win = box(len / n - 0.7, 1.05, 0.02, M.sky);
      win.position.set(x, H - 1.1, t / 2 + 0.004);
      g.add(win);
      for (const f of [-0.33, 0, 0.33]) g.add(at(box(0.04, 1.05, 0.03, M.steel), x + f * (len / n - 0.7), H - 1.1, t / 2 + 0.01));
    }
    return g;
  };
  const back = wall(W, 5);
  back.position.set(0, 0, -D / 2);
  scene.add(back);
  const right = wall(D, 8);
  right.rotation.y = -Math.PI / 2;
  right.position.set(W / 2, 0, 0);
  scene.add(right);
  const logo = await logoPanel(3.2);
  logo.rotation.y = -Math.PI / 2;
  scene.add(at(logo, W / 2 - 0.115, 0.25 + logo.userData.height / 2, 1.6, -Math.PI / 2));

  // roof trusses + light strips (no roof slab: the diorama stays open)
  for (let z = -D / 2 + 1.2; z < D / 2 - 3; z += 2.6) {
    scene.add(rod([-W / 2 + 4, H, z], [W / 2, H, z], 0.06, M.steel, 10));
    scene.add(rod([-W / 2 + 4, H - 0.55, z], [W / 2, H - 0.55, z], 0.05, M.steel, 10));
    for (let x = -W / 2 + 4; x < W / 2 - 0.5; x += 0.85) scene.add(rod([x, H, z], [x + 0.42, H - 0.55, z], 0.026, M.steel, 6));
  }

  // zones
  scene.add(at(court({ cols: 4, rows: 2, cell: 2.1, height: 0.42 }), -2.6, 0, 2.4));
  scene.add(at(ninja({ length: 5.6, depth: 2.3, height: 3.1 }), -2.4, 0, -3.1));
  scene.add(at(foamPit({ w: 5.6, d: 2.4, cube: 0.3, seed: 3 }), -2.4, 0, -3.1));
  scene.add(at(softPlay({ cols: 2, rows: 2, bay: 1.2, level: 1.15, levels: 2 }), 5.0, 0, -3.6));
  scene.add(at(ballPit({ w: 2.0, d: 1.5, seed: 4 }), 4.4, 0, -0.9));
  for (const z of [1.7, 3.9]) {
    const t = partyTable({ length: 2.4, width: 0.95, seats: 3 });
    t.rotation.y = Math.PI / 2;
    scene.add(at(t, 6.0, 0, z));
  }

  const camera = new THREE.PerspectiveCamera(33, 4 / 3, 0.1, 200);
  camera.position.set(-17, 12.5, 19.5);
  camera.lookAt(0.2, 0.7, -0.8);
  return { scene, camera, width: 2000, height: 1500, exposure: 0.92 };
}
