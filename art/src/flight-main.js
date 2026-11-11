// Renders the hero's drone flight frame by frame and hands each PNG to render-flight.mjs.
// URL: /flight.html?mode=trace|preview&n=<frames>&from=<i>&to=<i>&w=<px>&h=<px>&spp=<samples>
//   preview: plain WebGL raster, instant, for working out the path.
//   trace:   path-traced like every other render (transparent background).
import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import build from './shots/hero.js';
import { pose, KID } from './flight.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'preview';
const n = Number(params.get('n') ?? 24);
/** Which frames, in this order (render-flight.mjs sends coarse ones first, so a partial run is usable). */
const list = (params.get('list') ?? '').split(',').filter(Boolean).map(Number);
if (!list.length) for (let i = Number(params.get('from') ?? 0); i <= Number(params.get('to') ?? n - 1); i++) list.push(i);
const width = Number(params.get('w') ?? 640);
const height = Number(params.get('h') ?? 400);
const spp = Number(params.get('spp') ?? 64);
const bounces = Number(params.get('bounces') ?? 5);
const tiles = Number(params.get('tiles') ?? 2);
/** 1: fovs as keyed (16:10); otherwise the frame is the 16:10 band plus what lies above and below it. */
const band = params.get('band') === '1' ? 1 : (1.6 * height) / width;
const clear = params.get('bg') === 'none';
const hud = document.getElementById('hud');

const shot = await build();
const { scene } = shot;
const camera = new THREE.PerspectiveCamera(33, width / height, 0.05, 200);

const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, alpha: true, antialias: mode === 'preview' });
renderer.setPixelRatio(1);
renderer.setSize(width, height);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = shot.exposure ?? 1;
renderer.setClearColor(0x000000, 0);
document.body.append(renderer.domElement);

/** Where the mascot's feet land in a frame (0..1 of its width/height) and how many px a metre there spans. */
function kidOnScreen() {
  const v = new THREE.Vector3(...KID).applyMatrix4(camera.matrixWorldInverse);
  const depth = -v.z;
  const ndc = new THREE.Vector3(...KID).project(camera);
  const focal = height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return { x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2, ppm: depth > 0.05 ? focal / depth : 0 };
}

let draw;
if (mode === 'preview') {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(scene.environment).texture;
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(-6, 14, 8);
  scene.add(sun);
  if (!clear) scene.background = new THREE.Color('#f8f2ec');
  draw = async () => renderer.render(scene, camera);
} else {
  const tracer = new WebGLPathTracer(renderer);
  tracer.renderDelay = 0;
  tracer.fadeDuration = 0;
  tracer.minSamples = 0;
  tracer.bounces = bounces;
  tracer.transmissiveBounces = 4;
  tracer.filterGlossyFactor = 0.4;
  tracer.multipleImportanceSampling = true;
  tracer.tiles.set(tiles, tiles);
  tracer.textureSize.set(2048, 2048);
  tracer._pathTracer.material.setDefine('RANDOM_TYPE', 1);
  pose(list[0] / (n - 1), camera, band);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  tracer.setScene(scene, camera);
  draw = () =>
    new Promise((resolve) => {
      tracer.updateCamera();
      const tick = () => {
        tracer.renderSample();
        if (tracer.samples >= spp) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
}

const t0 = performance.now();
for (const i of list) {
  pose(i / (n - 1), camera, band);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  const t = performance.now();
  await draw();
  await window.__save(i, renderer.domElement.toDataURL('image/png'), kidOnScreen());
  hud.textContent = `${mode} ${i} · ${((performance.now() - t) / 1000).toFixed(1)} s`;
  console.log(`frame ${i} ${((performance.now() - t) / 1000).toFixed(1)}s`);
}
window.__total = performance.now() - t0;
window.__done = true;
