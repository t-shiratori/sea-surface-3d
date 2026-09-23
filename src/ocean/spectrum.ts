/**
 * CPU-side generation of the initial wave spectrum h0(k).
 *
 * The spectrum is an empirical JONSWAP spectrum with TMA depth attenuation and
 * a frequency-dependent cos-2s directional spreading, following
 * Horvath, "Empirical directional wave spectra for computer graphics" (2015).
 */

export const GRAVITY = 9.81;

export interface WaveSystem {
  /** Overall energy multiplier. */
  scale: number;
  /** Wind speed at 10 m above sea level [m/s]. */
  windSpeed: number;
  /** Direction the waves travel towards [deg]. */
  direction: number;
  /** Distance over which the wind has blown [km]. */
  fetch: number;
  /** 0 = omnidirectional, 1 = fully aligned with the wind. */
  spreadBlend: number;
  /** 0 = young wind sea, 1 = long-crested swell. */
  swell: number;
  /** JONSWAP peak enhancement factor. */
  peakEnhancement: number;
  /** Suppresses very short waves [m]. */
  shortWavesFade: number;
}

export interface CascadeRange {
  lengthScale: number;
  cutoffLow: number;
  cutoffHigh: number;
}

interface PreparedSystem extends WaveSystem {
  angle: number;
  alpha: number;
  peakOmega: number;
}

function prepare(system: WaveSystem): PreparedSystem {
  const fetch = system.fetch * 1000;
  const wind = Math.max(system.windSpeed, 0.1);
  return {
    ...system,
    angle: (system.direction * Math.PI) / 180,
    alpha: 0.076 * Math.pow((GRAVITY * fetch) / (wind * wind), -0.22),
    peakOmega: 22 * Math.pow((wind * fetch) / (GRAVITY * GRAVITY), -0.33),
  };
}

function frequency(k: number, depth: number): number {
  return Math.sqrt(GRAVITY * k * Math.tanh(Math.min(k * depth, 20)));
}

function frequencyDerivative(k: number, depth: number): number {
  const th = Math.tanh(Math.min(k * depth, 20));
  const ch = Math.cosh(Math.min(k * depth, 20));
  return (GRAVITY * ((depth * k) / ch / ch + th)) / frequency(k, depth) / 2;
}

function tmaCorrection(omega: number, depth: number): number {
  const omegaH = omega * Math.sqrt(depth / GRAVITY);
  if (omegaH <= 1) return 0.5 * omegaH * omegaH;
  if (omegaH < 2) return 1 - 0.5 * (2 - omegaH) * (2 - omegaH);
  return 1;
}

function jonswap(omega: number, depth: number, s: PreparedSystem): number {
  const sigma = omega <= s.peakOmega ? 0.07 : 0.09;
  const d = omega - s.peakOmega;
  const r = Math.exp(-(d * d) / (2 * sigma * sigma * s.peakOmega * s.peakOmega));
  const ratio = s.peakOmega / omega;
  return (
    s.scale *
    tmaCorrection(omega, depth) *
    s.alpha *
    GRAVITY *
    GRAVITY *
    Math.pow(omega, -5) *
    Math.exp(-1.25 * ratio ** 4) *
    Math.pow(Math.abs(s.peakEnhancement), r)
  );
}

// Lanczos approximation of ln(Γ(x)).
const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905,
  -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7,
];
function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  const z = x - 1;
  let a = 0.9999999999998099;
  const t = z + 7.5;
  for (const [i, c] of LANCZOS.entries()) a += c / (z + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Normalisation so that ∫ N(s) cos^{2s}(θ/2) dθ over [-π, π] equals 1. */
function cos2sNormalisation(s: number): number {
  return Math.exp(logGamma(s + 1) - logGamma(s + 0.5)) / (2 * Math.sqrt(Math.PI));
}

function spreadPower(omega: number, peakOmega: number): number {
  const ratio = omega / peakOmega;
  return ratio > 1 ? 9.77 * Math.pow(ratio, -2.5) : 6.97 * Math.pow(ratio, 5);
}

function angleDifference(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function directionSpectrum(theta: number, omega: number, s: PreparedSystem): number {
  const power =
    spreadPower(omega, s.peakOmega) +
    16 * Math.tanh(Math.min(omega / s.peakOmega, 20)) * s.swell * s.swell;
  const delta = angleDifference(theta, s.angle);
  const cos2s = cos2sNormalisation(power) * Math.pow(Math.abs(Math.cos(0.5 * delta)), 2 * power);
  const uniform = 1 / (2 * Math.PI);
  return uniform + (cos2s - uniform) * s.spreadBlend;
}

/** Deterministic PRNG so the sea state is stable when parameters change. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pre-generated unit complex Gaussian noise; kept fixed so tweaking parameters morphs the sea. */
export function createGaussianNoise(size: number, seed: number): Float32Array {
  const random = mulberry32(seed);
  const noise = new Float32Array(size * size * 2);
  for (let i = 0; i < size * size; i++) {
    const u1 = Math.max(random(), 1e-12);
    const u2 = random();
    const r = Math.sqrt(-2 * Math.log(u1));
    noise[i * 2] = r * Math.cos(2 * Math.PI * u2);
    noise[i * 2 + 1] = r * Math.sin(2 * Math.PI * u2);
  }
  return noise;
}

/**
 * Builds an RGBA float texture holding (h0(k), conj(h0(-k))) for one cascade.
 */
export function buildInitialSpectrum(
  size: number,
  range: CascadeRange,
  systems: readonly WaveSystem[],
  depth: number,
  noise: Float32Array,
): Float32Array {
  const prepared = systems.map(prepare);
  const deltaK = (2 * Math.PI) / range.lengthScale;
  const amplitude = new Float32Array(size * size * 2);

  for (let y = 0; y < size; y++) {
    const ny = y < size / 2 ? y : y - size;
    for (let x = 0; x < size; x++) {
      const nx = x < size / 2 ? x : x - size;
      const kx = nx * deltaK;
      const kz = ny * deltaK;
      const k = Math.hypot(kx, kz);
      const index = y * size + x;
      if (k <= range.cutoffLow || k > range.cutoffHigh) continue;

      const theta = Math.atan2(kz, kx);
      const omega = frequency(k, depth);
      const dOmegaDk = frequencyDerivative(k, depth);
      let spectrum = 0;
      for (const system of prepared) {
        const fade = Math.exp(-system.shortWavesFade * system.shortWavesFade * k * k);
        spectrum += jonswap(omega, depth, system) * directionSpectrum(theta, omega, system) * fade;
      }
      // S(kx, kz) = S(ω) D(θ) dω/dk / k. E|h0|² = S Δk² / 2 because h(k) and h(-k) both contribute.
      const variance = (spectrum * dOmegaDk * deltaK * deltaK) / k;
      const a = Math.sqrt(Math.max(variance, 0) / 4);
      amplitude[index * 2] = (noise[index * 2] ?? 0) * a;
      amplitude[index * 2 + 1] = (noise[index * 2 + 1] ?? 0) * a;
    }
  }

  const data = new Float32Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const mirror = ((size - y) % size) * size + ((size - x) % size);
      data[index * 4] = amplitude[index * 2] ?? 0;
      data[index * 4 + 1] = amplitude[index * 2 + 1] ?? 0;
      data[index * 4 + 2] = amplitude[mirror * 2] ?? 0;
      data[index * 4 + 3] = -(amplitude[mirror * 2 + 1] ?? 0);
    }
  }
  return data;
}
