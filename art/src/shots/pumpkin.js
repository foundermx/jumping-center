import { THREE, studioEnv } from '../kit.js';

// Pumpkin Day Pass: a happy pumpkin cut-out (transparent background).
const orange = new THREE.MeshStandardMaterial({ color: '#ff8616', roughness: 0.42 });
const dark = new THREE.MeshStandardMaterial({ color: '#3b1406', roughness: 0.55 });
const toothM = new THREE.MeshStandardMaterial({ color: '#ffb347', roughness: 0.45 });
const stemM = new THREE.MeshStandardMaterial({ color: '#6b7a1e', roughness: 0.7 });
const leafM = new THREE.MeshStandardMaterial({ color: '#7fbf1f', roughness: 0.6, side: THREE.DoubleSide });

const SQUASH = 0.8;

/** Grid decal on the unit sphere (scaled by SQUASH in y), lifted off the surface. */
function decal(center, inside, [s0, s1, t0, t1], material, radius, res = 120) {
  const c = center.clone().normalize();
  const right = new THREE.Vector3(1, 0, 0).sub(c.clone().multiplyScalar(c.x)).normalize();
  const up = new THREE.Vector3().crossVectors(c, right).normalize();
  const at = (s, t) => c.clone().add(right.clone().multiplyScalar(s)).add(up.clone().multiplyScalar(t)).normalize().multiply(new THREE.Vector3(radius, radius * SQUASH, radius));
  const pos = [];
  for (let i = 0; i < res; i++) for (let j = 0; j < res; j++) {
    const sa = s0 + ((s1 - s0) * i) / res, sb = s0 + ((s1 - s0) * (i + 1)) / res;
    const ta = t0 + ((t1 - t0) * j) / res, tb = t0 + ((t1 - t0) * (j + 1)) / res;
    if (!inside((sa + sb) / 2, (ta + tb) / 2)) continue;
    const a = at(sa, ta), b = at(sb, ta), d = at(sb, tb), e = at(sa, tb);
    pos.push(...a.toArray(), ...b.toArray(), ...d.toArray(), ...a.toArray(), ...d.toArray(), ...e.toArray());
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

export default async function build() {
  const scene = new THREE.Scene();
  scene.environment = await studioEnv('#fff4e6', '#5b1a2a');
  scene.environmentIntensity = 0.9;
  scene.background = null;

  const g = new THREE.Group();
  const body = new THREE.SphereGeometry(1, 160, 120);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const phi = Math.atan2(v.z, v.x);
    const rib = 1 - 0.095 * Math.pow(0.5 - 0.5 * Math.cos(9 * phi), 1.8) * (1 - Math.abs(v.y) ** 3);
    const dip = 1 - 0.22 * Math.exp(-Math.pow((1 - Math.abs(v.y)) * 7, 2));
    v.x *= rib;
    v.z *= rib;
    v.y *= SQUASH * dip;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  body.computeVertexNormals();
  g.add(new THREE.Mesh(body, orange));

  const R = 1.012;
  const face = new THREE.Vector3(0.12, 0.14, 1);
  // closed happy eyes: thick arcs
  for (const sx of [-1, 1]) {
    const cx = sx * 0.34;
    g.add(decal(face, (s, t) => {
      const d = Math.hypot((s - cx) / 1.0, (t - 0.12) / 0.9);
      return d > 0.11 && d < 0.18 && t > 0.12;
    }, [cx - 0.22, cx + 0.22, 0.0, 0.36], dark, R));
  }
  // grin with one tooth
  const top = (s) => -0.1 + 0.55 * s * s;
  const halfW = 0.5;
  const depth = (s) => 0.36 * Math.sqrt(Math.max(0, 1 - (s / halfW) ** 2));
  const inMouth = (s, t) => Math.abs(s) < halfW && t < top(s) && t > top(s) - depth(s);
  g.add(decal(face, inMouth, [-0.55, 0.55, -0.55, 0.1], dark, R));
  g.add(decal(face, (s, t) => inMouth(s, t) && Math.abs(s - 0.12) < 0.07 && t > top(s) - 0.12, [-0.55, 0.55, -0.55, 0.1], toothM, R + 0.004));

  // stem + leaf
  const stemCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(0.02, 0.85, 0.02), new THREE.Vector3(0.12, 1.02, 0.04), new THREE.Vector3(0.24, 1.08, 0.02)]);
  const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 48, 0.085, 24, false), stemM);
  g.add(stem);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), stemM);
  cap.position.copy(stemCurve.getPoint(1));
  g.add(cap);
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.15, 0.12, 0.35, 0.12, 0.5, 0);
  leafShape.bezierCurveTo(0.35, -0.12, 0.15, -0.12, 0, 0);
  const leaf = new THREE.Mesh(new THREE.ShapeGeometry(leafShape, 24), leafM);
  leaf.position.set(-0.05, 0.72, 0.05);
  leaf.rotation.set(-0.5, 0.4, 2.6);
  g.add(leaf);

  g.rotation.set(0.1, -0.22, 0.05);
  scene.add(g);

  const key = new THREE.RectAreaLight('#fff1dd', 10, 2, 2);
  key.position.set(-2.2, 3, 3.2);
  key.lookAt(0, 0, 0);
  scene.add(key);
  const rim = new THREE.RectAreaLight('#ffd2a6', 14, 1.2, 2.4);
  rim.position.set(2.6, 1.4, -2.2);
  rim.lookAt(0, 0, 0);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(26, 1.1, 0.1, 50);
  camera.position.set(0.4, 1.0, 5.6);
  camera.lookAt(0, 0.12, 0);
  return { scene, camera, width: 1100, height: 1000, exposure: 0.95 };
}
