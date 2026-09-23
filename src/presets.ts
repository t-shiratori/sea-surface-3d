import type { OceanSettings } from './ocean/OceanSimulation';
import type { SurfaceLook } from './ocean/OceanSurface';
import type { WaveSystem } from './ocean/spectrum';
import type { SkySettings } from './sky/SkyEnvironment';

export interface Preset {
  sky: Partial<SkySettings>;
  wind: Partial<WaveSystem>;
  swell: Partial<WaveSystem>;
  ocean: Partial<Omit<OceanSettings, 'systems'>>;
  look: Partial<SurfaceLook>;
  exposure: number;
}

export const PRESETS = {
  'Golden Hour': {
    sky: {
      elevation: 3,
      azimuth: 188,
      turbidity: 3,
      rayleigh: 2,
      mieCoefficient: 0.004,
      mieDirectionalG: 0.8,
      cloudCoverage: 0.4,
      cloudDensity: 0.45,
      sunIntensity: 14,
    },
    wind: { scale: 1, windSpeed: 11, direction: -80, fetch: 120 },
    swell: { scale: 0.7, windSpeed: 6, direction: -120, fetch: 600 },
    ocean: { choppiness: 0.9 },
    look: { scatterColor: '#0b5563', roughness: 0.07, fogDensity: 0.00006 },
    exposure: 0.45,
  },
  Midday: {
    sky: {
      elevation: 38,
      azimuth: 235,
      turbidity: 2,
      rayleigh: 1,
      mieCoefficient: 0.003,
      mieDirectionalG: 0.8,
      cloudCoverage: 0.45,
      cloudDensity: 0.5,
      sunIntensity: 12,
    },
    wind: { scale: 1, windSpeed: 9, direction: -70, fetch: 200 },
    swell: { scale: 0.8, windSpeed: 7, direction: -110, fetch: 800 },
    ocean: { choppiness: 0.85 },
    look: { scatterColor: '#0a5d6e', roughness: 0.08, fogDensity: 0.00004 },
    exposure: 0.38,
  },
  Sunset: {
    sky: {
      elevation: 0.9,
      azimuth: 185,
      turbidity: 6,
      rayleigh: 3,
      mieCoefficient: 0.005,
      mieDirectionalG: 0.82,
      cloudCoverage: 0.5,
      cloudDensity: 0.45,
      sunIntensity: 22,
    },
    wind: { scale: 1, windSpeed: 7, direction: -85, fetch: 100 },
    swell: { scale: 1, windSpeed: 7, direction: -100, fetch: 900 },
    ocean: { choppiness: 0.8 },
    look: { scatterColor: '#0b5563', roughness: 0.06, fogDensity: 0.00008 },
    exposure: 0.55,
  },
  Storm: {
    sky: {
      elevation: 24,
      azimuth: 110,
      turbidity: 10,
      rayleigh: 0.5,
      mieCoefficient: 0.005,
      mieDirectionalG: 0.7,
      cloudCoverage: 0.9,
      cloudDensity: 0.95,
      sunIntensity: 4,
    },
    wind: { scale: 1, windSpeed: 19, direction: -75, fetch: 300 },
    swell: { scale: 1, windSpeed: 12, direction: -110, fetch: 900 },
    ocean: { choppiness: 1.1 },
    look: { scatterColor: '#1a5a58', roughness: 0.12, fogDensity: 0.00025 },
    exposure: 0.35,
  },
} satisfies Record<string, Preset>;

export type PresetName = keyof typeof PRESETS;
