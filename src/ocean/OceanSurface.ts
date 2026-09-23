import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  GLSL3,
  Mesh,
  ShaderMaterial,
  Uint32BufferAttribute,
  Vector2,
  Vector3,
  type Camera,
  type CubeTexture,
} from 'three';
import { oceanFragment, oceanVertex } from '../shaders/ocean';
import { CASCADE_LENGTHS, type OceanSimulation } from './OceanSimulation';

const ANGULAR_SEGMENTS = 512;
const ANGULAR_STEP = (2 * Math.PI) / ANGULAR_SEGMENTS;

/**
 * Radial grid centred on the camera: vertex spacing grows with distance so
 * detail is spent where the viewer can see it, reaching all the way to the horizon.
 */
function createRadialGrid(innerRadius: number, outerRadius: number): BufferGeometry {
  const radii = [0];
  let radius = innerRadius;
  while (radius < outerRadius) {
    radii.push(radius);
    // Keep cells roughly square; grow faster once far beyond visible wave detail.
    radius *= radius < 4000 ? 1 + ANGULAR_STEP : 1.08;
  }
  radii.push(outerRadius);

  const positions: number[] = [];
  for (const r of radii) {
    for (let s = 0; s < ANGULAR_SEGMENTS; s++) {
      const angle = s * ANGULAR_STEP;
      positions.push(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    }
  }

  const indices: number[] = [];
  for (let ring = 0; ring < radii.length - 1; ring++) {
    const inner = ring * ANGULAR_SEGMENTS;
    const outer = (ring + 1) * ANGULAR_SEGMENTS;
    for (let s = 0; s < ANGULAR_SEGMENTS; s++) {
      const next = (s + 1) % ANGULAR_SEGMENTS;
      // Counter-clockwise when seen from above.
      indices.push(inner + s, outer + next, outer + s);
      indices.push(inner + s, inner + next, outer + next);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new Uint32BufferAttribute(indices, 1));
  return geometry;
}

export interface SurfaceLook {
  waterColor: string;
  scatterColor: string;
  bubbleColor: string;
  scatterStrength: number;
  wavePeakScatter: number;
  roughness: number;
  foamBias: number;
  foamScale: number;
  foamCoverage: number;
  fogDensity: number;
}

export class OceanSurface extends Mesh<BufferGeometry, ShaderMaterial> {
  constructor(
    private readonly simulation: OceanSimulation,
    environment: CubeTexture,
    environmentSize: number,
  ) {
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: oceanVertex,
      fragmentShader: oceanFragment,
      uniforms: {
        uDisplacement0: { value: null },
        uDisplacement1: { value: null },
        uDisplacement2: { value: null },
        uDerivatives0: { value: null },
        uDerivatives1: { value: null },
        uDerivatives2: { value: null },
        uLengthScales: { value: new Vector3(...CASCADE_LENGTHS) },
        uCenter: { value: new Vector2() },
        uTexelsPerSide: { value: simulation.size },
        uAngularStep: { value: ANGULAR_STEP },
        uEnvironment: { value: environment },
        uEnvironmentMaxLod: { value: Math.log2(environmentSize) },
        uSunDirection: { value: new Vector3(0, 1, 0) },
        uSunColor: { value: new Color() },
        uWaterColor: { value: new Color() },
        uScatterColor: { value: new Color() },
        uBubbleColor: { value: new Color() },
        uScatterStrength: { value: 0 },
        uWavePeakScatter: { value: 0 },
        uRoughness: { value: 0.1 },
        uFoamBias: { value: 0 },
        uFoamScale: { value: 0 },
        uFoamCoverage: { value: 0 },
        uFogDensity: { value: 0 },
        uTime: { value: 0 },
      },
    });
    super(createRadialGrid(0.25, 60000), material);
    this.frustumCulled = false;
  }

  applyLook(look: SurfaceLook): void {
    const u = this.material.uniforms;
    (u.uWaterColor!.value as Color).set(look.waterColor);
    (u.uScatterColor!.value as Color).set(look.scatterColor);
    (u.uBubbleColor!.value as Color).set(look.bubbleColor);
    u.uScatterStrength!.value = look.scatterStrength;
    u.uWavePeakScatter!.value = look.wavePeakScatter;
    u.uRoughness!.value = look.roughness;
    u.uFoamBias!.value = look.foamBias;
    u.uFoamScale!.value = look.foamScale;
    u.uFoamCoverage!.value = look.foamCoverage;
    u.uFogDensity!.value = look.fogDensity;
  }

  setSun(direction: Vector3, color: Color): void {
    (this.material.uniforms.uSunDirection!.value as Vector3).copy(direction);
    (this.material.uniforms.uSunColor!.value as Color).copy(color);
  }

  update(camera: Camera, time: number): void {
    const u = this.material.uniforms;
    (u.uCenter!.value as Vector2).set(camera.position.x, camera.position.z);
    u.uTime!.value = time;
    for (let i = 0; i < 3; i++) {
      u[`uDisplacement${i}`]!.value = this.simulation.displacement(i);
      u[`uDerivatives${i}`]!.value = this.simulation.derivatives(i);
    }
  }
}
