// The Jumping Center kid: cap, teal tee with the J print, blue joggers, lime sneakers.
// Smooth primitives on a small joint rig; a pose is a set of joint rotations.
import { THREE, rbox, canvasTexture, loadImage } from './kit.js';
import printUrl from '../mark-print.svg?url';

const SKIN = '#efbf9b';
const TEAL = '#1aa6d8';
const std = (color, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });
const mat = {
  skin: std(SKIN, 0.55),
  hair: std('#5d3417', 0.6),
  brow: std('#4b2a14', 0.7),
  cap: std('#8ed322', 0.55),
  capDark: std('#79bb1b', 0.55),
  tee: std(TEAL, 0.82),
  pants: std('#2443cc', 0.68),
  cuff: std('#1a2f9a', 0.7),
  shoe: std('#c4f020', 0.42),
  sole: std('#fbfbf8', 0.5),
  lace: std('#1a2f9a', 0.5),
  sclera: std('#fbf8f3', 0.32),
  iris: std('#6a4220', 0.22),
  pupil: std('#120b07', 0.18),
  glint: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.3, roughness: 1 }),
  lip: std('#c8605a', 0.5),
  mouth: std('#6e1820', 0.6),
  teeth: std('#fffdf7', 0.3),
  tongue: std('#ef6f7d', 0.45),
};

const R = 0.17; // head radius; the kid is ~1.1 units tall
const HEAD_SCALE = new THREE.Vector3(1, 0.96, 0.95);

const capsule = (r, len, material, radial = 40) => new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 16, radial), material);
const sphere = (r, material, w = 64, h = 48) => new THREE.Mesh(new THREE.SphereGeometry(r, w, h), material);

/** Point on the scaled head surface along `dir`, lifted `lift` outward. */
function onHead(dir, lift = 0) {
  const d = dir.clone().normalize();
  const p = d.clone().multiply(HEAD_SCALE).multiplyScalar(R);
  const n = d.clone().divide(HEAD_SCALE).normalize();
  return p.add(n.multiplyScalar(lift));
}

/**
 * Decal that hugs the head: a dense grid in the tangent plane at `center`, keeping only the
 * cells where inside(s, t) holds (s right, t up, in radians), projected onto the surface.
 */
function faceDecal(center, inside, [s0, s1, t0, t1], material, lift, res = 90) {
  const c = center.clone().normalize();
  const right = new THREE.Vector3(1, 0, 0).sub(c.clone().multiplyScalar(c.x)).normalize();
  const up = new THREE.Vector3().crossVectors(c, right).normalize();
  const pos = [];
  const at = (s, t) => onHead(c.clone().add(right.clone().multiplyScalar(s)).add(up.clone().multiplyScalar(t)), lift);
  for (let i = 0; i < res; i++) {
    for (let j = 0; j < res; j++) {
      const sa = s0 + ((s1 - s0) * i) / res;
      const sb = s0 + ((s1 - s0) * (i + 1)) / res;
      const ta = t0 + ((t1 - t0) * j) / res;
      const tb = t0 + ((t1 - t0) * (j + 1)) / res;
      if (!inside((sa + sb) / 2, (ta + tb) / 2)) continue;
      const a = at(sa, ta), b = at(sb, ta), d = at(sb, tb), e = at(sa, tb);
      pos.push(...a.toArray(), ...b.toArray(), ...d.toArray(), ...a.toArray(), ...d.toArray(), ...e.toArray());
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

function mouth() {
  const g = new THREE.Group();
  const C = new THREE.Vector3(0, -0.41, 0.91);
  const halfW = 0.37;
  const top = (s) => 0.04 + 0.5 * s * s;
  const depth = (s) => 0.3 * Math.sqrt(Math.max(0, 1 - (s / halfW) ** 2));
  const inMouth = (s, t, grow = 0) => Math.abs(s) < halfW + grow && t < top(s) + grow * 0.6 && t > top(s) - depth(s) - grow;
  const bounds = [-0.46, 0.46, -0.36, 0.2];
  g.add(faceDecal(C, (s, t) => inMouth(s, t, 0.022), bounds, mat.lip, 0.0006));
  g.add(faceDecal(C, (s, t) => inMouth(s, t), bounds, mat.mouth, 0.0012));
  g.add(faceDecal(C, (s, t) => inMouth(s, t) && t > top(s) - 0.07, bounds, mat.teeth, 0.0018));
  const tongueY = top(0) - depth(0) + 0.08;
  g.add(faceDecal(C, (s, t) => inMouth(s, t) && (s / 0.19) ** 2 + ((t - tongueY) / 0.085) ** 2 < 1, bounds, mat.tongue, 0.0018));
  return g;
}

/** Skin texture with soft blush, painted in the sphere's equirect UV space. */
function blushTexture() {
  return canvasTexture(1024, 512, (ctx, W, H) => {
    ctx.fillStyle = SKIN;
    ctx.fillRect(0, 0, W, H);
    for (const sx of [-1, 1]) {
      const d = new THREE.Vector3(sx * 0.58, -0.24, 0.78).normalize();
      const theta = Math.acos(d.y);
      let phi = Math.atan2(d.z, -d.x);
      if (phi < 0) phi += Math.PI * 2;
      const x = (phi / (Math.PI * 2)) * W;
      const y = (theta / Math.PI) * H;
      const r = H * 0.07;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1 / Math.sin(theta), 1);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, 'rgba(240,120,112,0.55)');
      grad.addColorStop(1, 'rgba(240,120,112,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
}

function eye(x, look) {
  const g = new THREE.Group();
  const r = 0.052;
  g.add(sphere(r, mat.sclera));
  const cap = (theta, m, k) => {
    const c = new THREE.Mesh(new THREE.SphereGeometry(r * k, 48, 24, 0, Math.PI * 2, 0, theta), m);
    c.rotation.x = Math.PI / 2;
    return c;
  };
  g.add(cap(0.6, mat.iris, 1.004), cap(0.29, mat.pupil, 1.008));
  // painted-on catchlight: reads at any size without a glossy (noisy) eyeball
  const glint = sphere(r * 0.17, mat.glint, 16, 12);
  glint.position.set(-r * 0.3, r * 0.32, r * 0.93);
  g.add(glint);
  // lower lid pushed up by the smile
  const lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 48, 24, 0, Math.PI * 2, Math.PI - 0.72, 0.72), mat.skin);
  lid.rotation.x = -0.12;
  g.add(lid);
  const surface = onHead(new THREE.Vector3(x / R, -0.02 / R, 0.86));
  g.position.copy(surface).multiplyScalar(0.835);
  g.rotation.set(-look.x, look.y + x * 1.6, 0);
  return g;
}

function brow(x, lift) {
  const pts = [-1, -0.5, 0, 0.5, 1].map((t) => {
    const px = x + t * 0.04;
    const py = 0.074 + lift - t * t * 0.016 + Math.sign(x) * t * 0.006;
    return onHead(new THREE.Vector3(px / R, py / R, 0.8), 0.004);
  });
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0105, 10), mat.brow);
}

function head({ look, browLift, capTilt }) {
  const g = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), new THREE.MeshStandardMaterial({ map: blushTexture(), roughness: 0.55 }));
  skull.scale.copy(HEAD_SCALE);
  g.add(skull);
  g.add(eye(-0.058, look), eye(0.058, look));
  g.add(brow(-0.066, browLift), brow(0.066, browLift));
  g.add(mouth());
  const nose = sphere(0.021, mat.skin);
  nose.position.copy(onHead(new THREE.Vector3(0, -0.2, 1), -0.006));
  nose.scale.set(1.25, 0.9, 1);
  g.add(nose);
  for (const s of [-1, 1]) {
    const ear = sphere(0.04, mat.skin);
    ear.position.set(s * R * 0.97, -0.012, -0.01);
    ear.scale.set(0.55, 1, 0.85);
    g.add(ear);
  }

  // hair under the cap: back volume, sideburns, a bang swooping out from under the brim
  const hairBack = sphere(R * 1.02, mat.hair);
  hairBack.position.set(0, 0.03, -0.03);
  hairBack.scale.set(1.0, 0.9, 0.96);
  g.add(hairBack);
  const tuft = (pos, rot, len = 0.06, r = 0.03) => {
    const m = capsule(r, len, mat.hair, 24);
    m.position.set(...pos);
    m.rotation.set(...rot);
    g.add(m);
  };
  for (const s of [-1, 1]) {
    tuft([s * 0.152, 0.03, 0.0], [0.15, 0, s * 0.25], 0.05, 0.03);
    tuft([s * 0.14, 0.05, -0.07], [0.5, 0, s * 0.45], 0.06, 0.035);
  }

  const cap = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 96, 48, 0, Math.PI * 2, 0, Math.PI * 0.5), mat.cap);
  dome.scale.set(1, 0.84, 1.03);
  cap.add(dome);
  const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.065, 0.011, 12, 96), mat.capDark);
  band.rotation.x = Math.PI / 2;
  cap.add(band);
  const button = sphere(0.016, mat.capDark, 24, 16);
  button.position.y = R * 0.9;
  cap.add(button);
  const brimShape = new THREE.Shape();
  brimShape.absellipse(0, 0, R * 0.95, R * 0.66, 0, Math.PI, false);
  brimShape.lineTo(-R * 0.95, 0);
  const brim = new THREE.Mesh(
    new THREE.ExtrudeGeometry(brimShape, { depth: 0.007, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 4, curveSegments: 64 }),
    mat.capDark,
  );
  brim.rotation.x = Math.PI / 2 + 0.32;
  brim.position.set(0, 0.004, R * 0.84);
  cap.add(brim);
  cap.position.set(0, 0.09, -0.01);
  cap.rotation.set(-0.06, 0, capTilt);
  g.add(cap);
  return g;
}

/** Joint with a capsule hanging along -y; child joint at its end. */
function segment(length, radius, material, radiusEnd = radius) {
  const joint = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry((radius + radiusEnd) / 2, length, 16, 40), material);
  mesh.position.y = -length / 2;
  joint.add(mesh);
  const end = new THREE.Group();
  end.position.y = -length;
  joint.add(end);
  joint.userData.end = end;
  return joint;
}

function hand(side, open = 1) {
  const g = new THREE.Group();
  const palm = sphere(0.04, mat.skin, 32, 24);
  palm.scale.set(1, 1.1, 0.62);
  palm.position.y = -0.036;
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = capsule(0.0115, 0.03, mat.skin, 16);
    const a = (i - 1.5) * 0.2 * open;
    f.position.set((i - 1.5) * 0.019 + Math.sin(a) * 0.02, -0.078, 0);
    f.rotation.z = a;
    g.add(f);
  }
  const thumb = capsule(0.0125, 0.026, mat.skin, 16);
  thumb.position.set(side * 0.036, -0.03, 0.014);
  thumb.rotation.set(0.3, 0, side * 0.95);
  g.add(thumb);
  return g;
}

function shoe() {
  const g = new THREE.Group();
  const upper = rbox(0.1, 0.075, 0.19, 0.026, mat.shoe, 6);
  upper.position.set(0, 0.04, 0.03);
  g.add(upper);
  const toe = sphere(0.05, mat.shoe, 32, 24);
  toe.scale.set(1, 0.72, 1.05);
  toe.position.set(0, 0.03, 0.09);
  g.add(toe);
  const sole = rbox(0.1, 0.03, 0.19, 0.012, mat.sole, 4);
  sole.position.set(0, 0.012, 0.032);
  g.add(sole);
  for (let i = 0; i < 3; i++) {
    const lace = rbox(0.06, 0.008, 0.012, 0.004, mat.lace, 2);
    lace.position.set(0, 0.078 - i * 0.004, 0.05 + i * 0.028);
    lace.rotation.x = -0.35;
    g.add(lace);
  }
  return g;
}

/** Tee: lathe body (front at u = 0.5) with the J print on the chest. */
async function tee() {
  const print = await loadImage(printUrl);
  const map = canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = TEAL;
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.4;
    const r = w * 0.075;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.drawImage(print, cx - r * 0.8, cy - r * 0.8 * 1.25, r * 1.6, r * 1.6 * 1.25);
  });
  const profile = [
    [0.0, -0.02], [0.128, -0.02], [0.134, 0.0], [0.126, 0.06], [0.13, 0.13], [0.142, 0.2], [0.14, 0.26], [0.115, 0.31], [0.065, 0.335], [0.0, 0.335],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(profile, 96, Math.PI, Math.PI * 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, roughness: 0.82 }));
  m.scale.set(1, 1, 0.76);
  return m;
}

const POSES = {
  jump: {
    root: [-0.08, -0.32, 0.04], spine: [-0.06, 0, -0.02], head: [-0.1, 0.12, 0.1], capTilt: 0.16,
    armL: [0.1, 0, -1.95], elbowL: [0, 0, -0.45], wristL: [0.15, 0, -0.25],
    armR: [-0.15, 0, 1.85], elbowR: [0, 0, 0.5], wristR: [0.15, 0, 0.25],
    legL: [-0.85, 0, -0.14], kneeL: [1.5, 0, 0], ankleL: [0.1, 0, 0],
    legR: [0.45, 0, 0.12], kneeR: [1.65, 0, 0], ankleR: [0.3, 0, 0],
    look: { x: -0.04, y: 0.12 }, browLift: 0.016, open: 1.2,
  },
  welcome: {
    root: [0, 0.32, 0], spine: [0.03, 0, 0.06], head: [0.05, -0.22, -0.1], capTilt: -0.14,
    armL: [0.12, 0, -0.32], elbowL: [0, 0, -0.3], wristL: [0, 0, -0.1],
    armR: [-0.3, 0, 1.38], elbowR: [0, 0, 0.25], wristR: [0, -1.3, 0.1],
    legL: [0.05, 0, -0.07], kneeL: [0.06, 0, 0], ankleL: [-0.04, 0, 0],
    legR: [-0.12, 0, 0.1], kneeR: [0.22, 0, 0], ankleR: [-0.08, 0, 0],
    look: { x: -0.02, y: -0.32 }, browLift: 0.014, open: 1,
  },
};

export async function kid(pose = 'jump') {
  const p = POSES[pose];
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.52;
  hips.rotation.set(...p.root);
  root.add(hips);

  const pelvis = sphere(0.125, mat.pants);
  pelvis.scale.set(1.06, 0.72, 0.84);
  hips.add(pelvis);

  const spine = new THREE.Group();
  spine.rotation.set(...p.spine);
  hips.add(spine);
  spine.add(await tee());

  const neck = capsule(0.054, 0.02, mat.skin, 24);
  neck.position.y = 0.335;
  spine.add(neck);
  const headPivot = new THREE.Group();
  headPivot.position.y = 0.345;
  headPivot.rotation.set(...p.head);
  spine.add(headPivot);
  const h = head(p);
  h.position.y = R * 0.92;
  headPivot.add(h);

  for (const side of [-1, 1]) {
    const L = side < 0 ? 'L' : 'R';
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.145, 0.265, 0);
    shoulder.rotation.set(...p[`arm${L}`]);
    spine.add(shoulder);
    const sleeve = capsule(0.06, 0.06, mat.tee, 32);
    sleeve.position.y = -0.035;
    shoulder.add(sleeve);
    const upper = segment(0.13, 0.04, mat.skin, 0.037);
    shoulder.add(upper);
    const elbow = upper.userData.end;
    elbow.rotation.set(...p[`elbow${L}`]);
    const fore = segment(0.115, 0.036, mat.skin, 0.032);
    elbow.add(fore);
    const wrist = fore.userData.end;
    wrist.rotation.set(...p[`wrist${L}`]);
    wrist.add(hand(-side, p.open));

    const hip = new THREE.Group();
    hip.position.set(side * 0.068, -0.02, 0);
    hip.rotation.set(...p[`leg${L}`]);
    hips.add(hip);
    const thigh = segment(0.17, 0.068, mat.pants, 0.06);
    hip.add(thigh);
    const knee = thigh.userData.end;
    knee.rotation.set(...p[`knee${L}`]);
    const shin = segment(0.15, 0.058, mat.pants, 0.05);
    knee.add(shin);
    const ankle = shin.userData.end;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.04, 32), mat.cuff);
    cuff.position.y = 0.02;
    ankle.add(cuff);
    ankle.rotation.set(...p[`ankle${L}`]);
    const foot = shoe();
    foot.position.set(0, -0.06, 0);
    ankle.add(foot);
  }
  return root;
}
