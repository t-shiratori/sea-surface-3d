import { GUI } from 'lil-gui';
import {
  ACESFilmicToneMapping,
  HalfFloatType,
  PerspectiveCamera,
  Scene,
  Timer,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OceanSimulation, type OceanSettings } from './ocean/OceanSimulation';
import { OceanSurface, type SurfaceLook } from './ocean/OceanSurface';
import type { WaveSystem } from './ocean/spectrum';
import { PRESETS, type PresetName } from './presets';
import { HighlightCompressShader } from './shaders/post';
import { SkyEnvironment, type SkySettings } from './sky/SkyEnvironment';

const canvas = document.querySelector<HTMLCanvasElement>('#app');
if (!canvas) throw new Error('Canvas #app not found');

const renderer = new WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = ACESFilmicToneMapping;

const scene = new Scene();
const camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 50000);
camera.position.set(0, 7, 34);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 3, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 4;
controls.maxDistance = 600;
controls.maxPolarAngle = Math.PI * 0.495;
controls.enablePan = false;

// ---------------------------------------------------------------- settings

const skySettings: SkySettings = {
  elevation: 3,
  azimuth: 188,
  turbidity: 3,
  rayleigh: 2,
  mieCoefficient: 0.004,
  mieDirectionalG: 0.8,
  cloudCoverage: 0.4,
  cloudDensity: 0.45,
  sunIntensity: 14,
};

const windSea: WaveSystem = {
  scale: 1,
  windSpeed: 11,
  direction: -80,
  fetch: 120,
  spreadBlend: 0.85,
  swell: 0.2,
  peakEnhancement: 3.3,
  shortWavesFade: 0.02,
};

const swell: WaveSystem = {
  scale: 0.7,
  windSpeed: 6,
  direction: -120,
  fetch: 600,
  spreadBlend: 1,
  swell: 1,
  peakEnhancement: 3.3,
  shortWavesFade: 0.05,
};

const oceanSettings: OceanSettings = {
  depth: 500,
  choppiness: 0.9,
  foamDecay: 0.35,
  systems: [windSea, swell],
};

const look: SurfaceLook = {
  waterColor: '#021824',
  scatterColor: '#0b5563',
  bubbleColor: '#1f6f6a',
  scatterStrength: 0.2,
  wavePeakScatter: 1.4,
  roughness: 0.07,
  foamBias: 0.82,
  foamScale: 3.2,
  foamCoverage: 0.65,
  fogDensity: 0.00006,
};

const postSettings = {
  exposure: 0.45,
  bloomStrength: 0.4,
  bloomRadius: 0.4,
  bloomThreshold: 70,
};

// ---------------------------------------------------------------- world

const skyEnvironment = new SkyEnvironment(skySettings);
scene.add(skyEnvironment.sky);

const simulation = new OceanSimulation(renderer, oceanSettings);
const ocean = new OceanSurface(simulation, skyEnvironment.environment, skyEnvironment.cubeSize);
scene.add(ocean);

// ---------------------------------------------------------------- post-processing

const size = renderer.getDrawingBufferSize(new Vector2());
const composer = new EffectComposer(
  renderer,
  new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 }),
);
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass(HighlightCompressShader));
const bloom = new UnrealBloomPass(
  new Vector2(window.innerWidth, window.innerHeight),
  postSettings.bloomStrength,
  postSettings.bloomRadius,
  postSettings.bloomThreshold,
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- state sync

const applySky = () => {
  skyEnvironment.apply();
  ocean.setSun(skyEnvironment.sunDirection, skyEnvironment.sunColor);
};
const applySpectrum = () => simulation.updateSpectrum();
const applyLook = () => ocean.applyLook(look);
const applyPost = () => {
  renderer.toneMappingExposure = postSettings.exposure;
  bloom.strength = postSettings.bloomStrength;
  bloom.radius = postSettings.bloomRadius;
  bloom.threshold = postSettings.bloomThreshold;
};

applySky();
applyLook();
applyPost();

// ---------------------------------------------------------------- GUI

const gui = new GUI({ title: 'Sea Surface' });
const presetState = { preset: 'Golden Hour' as PresetName };
gui.add(presetState, 'preset', Object.keys(PRESETS)).onChange((name: PresetName) => {
  const preset = PRESETS[name];
  Object.assign(skySettings, preset.sky);
  Object.assign(windSea, preset.wind);
  Object.assign(swell, preset.swell);
  Object.assign(oceanSettings, preset.ocean);
  Object.assign(look, preset.look);
  postSettings.exposure = preset.exposure;
  applySky();
  applySpectrum();
  applyLook();
  applyPost();
  for (const controller of gui.controllersRecursive()) controller.updateDisplay();
});

const sunFolder = gui.addFolder('Sun & Sky');
sunFolder.add(skySettings, 'elevation', -4, 70, 0.1).onChange(applySky);
sunFolder.add(skySettings, 'azimuth', 0, 360, 0.1).onChange(applySky);
sunFolder.add(skySettings, 'turbidity', 1, 20, 0.1).onChange(applySky);
sunFolder.add(skySettings, 'rayleigh', 0, 4, 0.01).onChange(applySky);
sunFolder.add(skySettings, 'mieDirectionalG', 0, 0.99, 0.001).onChange(applySky);
sunFolder.add(skySettings, 'cloudCoverage', 0, 1, 0.01).onChange(applySky);
sunFolder.add(skySettings, 'cloudDensity', 0, 1, 0.01).onChange(applySky);
sunFolder.add(skySettings, 'sunIntensity', 0, 40, 0.1).onChange(applySky);

for (const [name, system] of [
  ['Wind Sea', windSea],
  ['Swell', swell],
] as const) {
  const folder = gui.addFolder(name);
  folder.add(system, 'scale', 0, 3, 0.01).onChange(applySpectrum);
  folder.add(system, 'windSpeed', 0.5, 30, 0.1).name('wind [m/s]').onChange(applySpectrum);
  folder.add(system, 'direction', -180, 180, 1).onChange(applySpectrum);
  folder.add(system, 'fetch', 1, 1000, 1).name('fetch [km]').onChange(applySpectrum);
  folder.add(system, 'spreadBlend', 0, 1, 0.01).onChange(applySpectrum);
  folder.add(system, 'swell', 0, 1, 0.01).onChange(applySpectrum);
  folder.add(system, 'shortWavesFade', 0, 1, 0.01).onChange(applySpectrum);
  folder.close();
}

const waterFolder = gui.addFolder('Water');
waterFolder.add(oceanSettings, 'choppiness', 0, 2, 0.01);
waterFolder.add(oceanSettings, 'foamDecay', 0.05, 2, 0.01).name('foam recovery');
waterFolder.addColor(look, 'waterColor').onChange(applyLook);
waterFolder.addColor(look, 'scatterColor').onChange(applyLook);
waterFolder.addColor(look, 'bubbleColor').onChange(applyLook);
waterFolder.add(look, 'scatterStrength', 0, 2, 0.01).onChange(applyLook);
waterFolder.add(look, 'wavePeakScatter', 0, 4, 0.01).onChange(applyLook);
waterFolder.add(look, 'roughness', 0.02, 0.5, 0.001).onChange(applyLook);
waterFolder.add(look, 'foamBias', 0, 1.5, 0.01).onChange(applyLook);
waterFolder.add(look, 'foamScale', 0, 10, 0.01).onChange(applyLook);
waterFolder.add(look, 'foamCoverage', 0, 1, 0.01).onChange(applyLook);
waterFolder.add(look, 'fogDensity', 0, 0.001, 0.000001).onChange(applyLook);
waterFolder.close();

const postFolder = gui.addFolder('Post');
postFolder.add(postSettings, 'exposure', 0.05, 2, 0.01).onChange(applyPost);
postFolder.add(postSettings, 'bloomStrength', 0, 2, 0.01).onChange(applyPost);
postFolder.add(postSettings, 'bloomRadius', 0, 1, 0.01).onChange(applyPost);
postFolder.add(postSettings, 'bloomThreshold', 0, 200, 0.1).onChange(applyPost);
postFolder.close();

sunFolder.close();
if (window.innerWidth < 700) gui.close();

// ---------------------------------------------------------------- loop

window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
});

const timer = new Timer();
timer.connect(document);
let elapsed = 0;

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const delta = Math.min(timer.getDelta(), 1 / 20);
  elapsed += delta;

  controls.update();
  camera.position.y = Math.max(camera.position.y, 2.5);

  simulation.update(elapsed, delta);
  skyEnvironment.update(renderer, elapsed);
  ocean.update(camera, elapsed);
  composer.render(delta);
});

if (import.meta.env.DEV) {
  // Exposed for tweaking from the devtools console.
  Object.assign(window, {
    sea: { camera, controls, renderer, simulation, ocean, skyEnvironment, bloom, gui },
  });
}
