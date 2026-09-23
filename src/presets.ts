import type { OceanSettings } from './ocean/OceanSimulation';
import type { SurfaceLook } from './ocean/OceanSurface';
import type { WaveSystem } from './ocean/spectrum';
import type { SkySettings } from './sky/SkyEnvironment';

export interface PostSettings {
  exposure: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
}

export interface Preset {
  sky: Partial<SkySettings>;
  wind: Partial<WaveSystem>;
  swell: Partial<WaveSystem>;
  ocean: Partial<Omit<OceanSettings, 'systems'>>;
  look: Partial<SurfaceLook>;
  /** Unspecified values fall back to the defaults in main.ts. */
  post: Partial<PostSettings>;
}

export const PRESETS = {
  'Golden Hour': {
    sky: {
      elevation: 3,
      azimuth: 188,
      turbidity: 3,
      rayleigh: 1.5,
      mieCoefficient: 0.004,
      mieDirectionalG: 0.5,
      cloudCoverage: 0.4,
      cloudDensity: 0.45,
      sunIntensity: 14,
    },
    wind: { scale: 1, windSpeed: 11, direction: -80, fetch: 120 },
    swell: { scale: 0.7, windSpeed: 6, direction: -120, fetch: 600 },
    ocean: { choppiness: 0.9 },
    look: { scatterColor: '#0b5563', roughness: 0.07, fogDensity: 0.00006 },
    post: { exposure: 0.45, bloomStrength: 0.03, bloomRadius: 0.4, bloomThreshold: 20 },
  },
  Midday: {
    sky: {
      elevation: 20,
      azimuth: 235,
      turbidity: 2,
      rayleigh: 0.6,
      mieCoefficient: 0.003,
      mieDirectionalG: 0.4,
      cloudCoverage: 0.45,
      cloudDensity: 0.5,
      sunIntensity: 33,
    },
    wind: { scale: 1, windSpeed: 9, direction: -70, fetch: 200 },
    swell: { scale: 0.8, windSpeed: 7, direction: -110, fetch: 800 },
    ocean: { choppiness: 0.85 },
    look: { scatterColor: '#0a5d6e', roughness: 0.08, fogDensity: 0.00004 },
    post: { exposure: 0.38, bloomStrength: 0.05, bloomRadius: 0.4, bloomThreshold: 70 },
  },
  Sunset: {
    sky: {
      elevation: 0.4,
      azimuth: 185,
      turbidity: 6,
      rayleigh: 2,
      mieCoefficient: 0.005,
      mieDirectionalG: 0.2,
      cloudCoverage: 0.5,
      cloudDensity: 0.45,
      sunIntensity: 22,
    },
    wind: { scale: 1, windSpeed: 7, direction: -85, fetch: 100 },
    swell: { scale: 1, windSpeed: 7, direction: -100, fetch: 900 },
    ocean: { choppiness: 0.8 },
    look: { scatterColor: '#0b5563', roughness: 0.06, fogDensity: 0.00008 },
    post: { exposure: 0.9, bloomStrength: 0.03, bloomRadius: 0.4, bloomThreshold: 10 },
  },
  Storm: {
    sky: {
      elevation: 20,
      azimuth: 110,
      turbidity: 2,
      rayleigh: 0.5,
      mieCoefficient: 0.001,
      mieDirectionalG: 0.7,
      cloudCoverage: 0.9,
      cloudDensity: 0.95,
      sunIntensity: 30,
    },
    wind: { scale: 1, windSpeed: 19, direction: -75, fetch: 300 },
    swell: { scale: 1, windSpeed: 12, direction: -110, fetch: 900 },
    ocean: { choppiness: 1.1 },
    look: { scatterColor: '#1a5a58', roughness: 0.12, fogDensity: 0.00025 },
    post: { exposure: 0.2, bloomStrength: 0.02, bloomRadius: 0.4, bloomThreshold: 15 },
  },
} satisfies Record<string, Preset>;

export type PresetName = keyof typeof PRESETS;
