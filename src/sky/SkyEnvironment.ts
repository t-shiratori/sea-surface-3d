import {
  Color,
  CubeCamera,
  HalfFloatType,
  LinearMipmapLinearFilter,
  Scene,
  Vector3,
  WebGLCubeRenderTarget,
  type CubeTexture,
  type WebGLRenderer,
} from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export interface SkySettings {
  elevation: number;
  azimuth: number;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  cloudCoverage: number;
  cloudDensity: number;
  sunIntensity: number;
}

// Must match the constants in three's Sky shader so the sun agrees with the sky.
const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];

/**
 * The visible sky plus a sun-less copy rendered into a mip-mapped cube map
 * that the ocean samples for reflections and ambient light.
 */
export class SkyEnvironment {
  readonly sky = new Sky();
  readonly sunDirection = new Vector3();
  readonly sunColor = new Color();
  readonly cubeSize = 256;

  private readonly reflectionSky = new Sky();
  private readonly reflectionScene = new Scene();
  private readonly cubeTarget: WebGLCubeRenderTarget;
  private readonly cubeCamera: CubeCamera;

  constructor(private readonly settings: SkySettings) {
    this.sky.scale.setScalar(20000);
    this.sky.frustumCulled = false;
    this.reflectionSky.scale.setScalar(20000);
    this.reflectionSky.frustumCulled = false;
    this.reflectionSky.material.uniforms.showSunDisc!.value = 0;
    this.reflectionScene.add(this.reflectionSky);

    this.cubeTarget = new WebGLCubeRenderTarget(this.cubeSize, {
      type: HalfFloatType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
    });
    this.cubeCamera = new CubeCamera(1, 50000, this.cubeTarget);
    this.apply();
  }

  get environment(): CubeTexture {
    return this.cubeTarget.texture;
  }

  apply(): void {
    const s = this.settings;
    const phi = ((90 - s.elevation) * Math.PI) / 180;
    const theta = (s.azimuth * Math.PI) / 180;
    this.sunDirection.setFromSphericalCoords(1, phi, theta);

    for (const sky of [this.sky, this.reflectionSky]) {
      const u = sky.material.uniforms;
      u.turbidity!.value = s.turbidity;
      u.rayleigh!.value = s.rayleigh;
      u.mieCoefficient!.value = s.mieCoefficient;
      u.mieDirectionalG!.value = s.mieDirectionalG;
      u.cloudCoverage!.value = s.cloudCoverage;
      u.cloudDensity!.value = s.cloudDensity;
      (u.sunPosition!.value as Vector3).copy(this.sunDirection);
    }
    this.computeSunColor();
  }

  update(renderer: WebGLRenderer, time: number): void {
    this.sky.material.uniforms.time!.value = time;
    this.reflectionSky.material.uniforms.time!.value = time;
    this.cubeCamera.update(renderer, this.reflectionScene);
  }

  /** Direct sunlight after travelling through the same Preetham atmosphere as the sky. */
  private computeSunColor(): void {
    const s = this.settings;
    const y = this.sunDirection.y;
    const zenith = Math.acos(Math.max(0, y));
    const zenithDeg = (zenith * 180) / Math.PI;
    const airMass =
      1 / (Math.cos(zenith) + 0.15 * Math.pow(Math.max(93.885 - zenithDeg, 1e-3), -1.253));
    // oxlint-disable-next-line oxc/approx-constant -- Preetham's Mie constant, not log10(e)
    const mie = 0.434 * (0.2 * s.turbidity * 10e-18) * s.mieCoefficient;
    const transmittance = TOTAL_RAYLEIGH.map((beta, i) =>
      Math.exp(-(beta * s.rayleigh * 8400 + mie * (MIE_CONST[i] ?? 0) * 1250) * airMass),
    );
    // Soft fade as the sun sinks below the horizon.
    const horizon = Math.min(Math.max((y + 0.02) / 0.06, 0), 1);
    const k = s.sunIntensity * horizon;
    this.sunColor.setRGB(
      (transmittance[0] ?? 0) * k,
      (transmittance[1] ?? 0) * k,
      (transmittance[2] ?? 0) * k,
    );
  }
}
