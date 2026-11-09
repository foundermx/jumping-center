// Path-traces one shot and exposes the PNG to render.mjs.
// URL: /?shot=<name>&spp=<samples>&scale=<0..1 preview factor>
import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot') ?? 'spike';
const spp = Number(params.get('spp') ?? 300);
const scale = Number(params.get('scale') ?? 1);
const hud = document.getElementById('hud');

const { default: build } = await import(`./shots/${shotName}.js`);
const shot = await build();
const { scene, camera } = shot;
const width = Math.round(shot.width * scale);
const height = Math.round(shot.height * scale);

const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, alpha: true, antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(width, height);
renderer.toneMapping = shot.toneMapping ?? THREE.NeutralToneMapping;
renderer.toneMappingExposure = shot.exposure ?? 1;
renderer.setClearColor(0x000000, 0);
document.body.append(renderer.domElement);

camera.aspect = width / height;
camera.updateProjectionMatrix();

const tracer = new WebGLPathTracer(renderer);
tracer.renderDelay = 0;
tracer.fadeDuration = 0;
tracer.minSamples = 0;
tracer.bounces = shot.bounces ?? 5;
tracer.transmissiveBounces = 4;
tracer.filterGlossyFactor = 0.4;
tracer.multipleImportanceSampling = true;
tracer.tiles.set(2, 2);
tracer.textureSize.set(shot.textureSize ?? 2048, shot.textureSize ?? 2048);
// RANDOM_TYPE: 0 = PCG, 1 = Sobol, 2 = stratified list (library default). The default's 64 px
// blue-noise offset leaves a fixed maze-like pattern in our renders that more samples never remove.
tracer._pathTracer.material.setDefine('RANDOM_TYPE', Number(params.get('rand') ?? 1));

const t0 = performance.now();
tracer.setScene(scene, camera);
const tBuild = performance.now() - t0;

console.log(`bvh ${Math.round(tBuild)} ms`);
let last = -1;
await new Promise((resolve) => {
  const tick = () => {
    tracer.renderSample();
    const s = Math.floor(tracer.samples);
    hud.textContent = `${shotName} ${width}×${height} · ${s}/${spp} spp · ${((performance.now() - t0) / 1000).toFixed(1)} s`;
    if (s !== last && (s % 25 === 0 || s === 1)) { last = s; console.log(`progress ${s}/${spp} ${((performance.now() - t0) / 1000).toFixed(1)}s`); }
    if (s >= spp) resolve();
    else requestAnimationFrame(tick);
  };
  tick();
});

window.__stats = { build: Math.round(tBuild), total: Math.round(performance.now() - t0), width, height };
window.__png = () => renderer.domElement.toDataURL('image/png');
window.__done = true;
