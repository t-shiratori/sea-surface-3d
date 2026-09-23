import {
  BufferGeometry,
  Color,
  DataTexture,
  Float32BufferAttribute,
  FloatType,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import {
  assembleFragment,
  fftFragment,
  fullscreenVertex,
  timeSpectrumFragment,
} from '../shaders/simulation';
import { buildInitialSpectrum, createGaussianNoise, type WaveSystem } from './spectrum';

export interface OceanSettings {
  depth: number;
  choppiness: number;
  foamDecay: number;
  systems: WaveSystem[];
}

interface Cascade {
  lengthScale: number;
  cutoffLow: number;
  cutoffHigh: number;
  h0: DataTexture;
  noise: Float32Array;
  /** Ping-pong pair so foam can be integrated over time. */
  outputs: [WebGLRenderTarget, WebGLRenderTarget];
  current: 0 | 1;
}

export const CASCADE_LENGTHS = [420, 61, 11] as const;

export class OceanSimulation {
  readonly size: number;
  readonly cascades: Cascade[];

  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly scene = new Scene();
  private readonly quad: Mesh;
  private readonly fftTargets: [WebGLRenderTarget, WebGLRenderTarget];
  private readonly timeMaterial: ShaderMaterial;
  private readonly fftMaterial: ShaderMaterial;
  private readonly assembleMaterial: ShaderMaterial;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly settings: OceanSettings,
    size = 256,
  ) {
    this.size = size;

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    this.quad = new Mesh(geometry);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    const makeFftTarget = () =>
      new WebGLRenderTarget(size, size, {
        count: 2,
        type: FloatType,
        format: RGBAFormat,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        depthBuffer: false,
        generateMipmaps: false,
      });
    this.fftTargets = [makeFftTarget(), makeFftTarget()];

    const anisotropy = renderer.capabilities.getMaxAnisotropy();
    const makeOutputTarget = () => {
      const target = new WebGLRenderTarget(size, size, {
        count: 2,
        type: HalfFloatType,
        format: RGBAFormat,
        minFilter: LinearMipmapLinearFilter,
        magFilter: LinearFilter,
        wrapS: RepeatWrapping,
        wrapT: RepeatWrapping,
        depthBuffer: false,
        generateMipmaps: true,
        anisotropy,
      });
      for (const texture of target.textures) {
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.minFilter = LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = anisotropy;
      }
      return target;
    };

    const boundaries = CASCADE_LENGTHS.map((length) => ((2 * Math.PI) / length) * 6);
    this.cascades = CASCADE_LENGTHS.map((lengthScale, i) => {
      const h0 = new DataTexture(
        new Float32Array(size * size * 4),
        size,
        size,
        RGBAFormat,
        FloatType,
      );
      h0.minFilter = NearestFilter;
      h0.magFilter = NearestFilter;
      return {
        lengthScale,
        cutoffLow: i === 0 ? 1e-4 : (boundaries[i] ?? 0),
        cutoffHigh: boundaries[i + 1] ?? Number.POSITIVE_INFINITY,
        h0,
        noise: createGaussianNoise(size, 1337 + i * 7919),
        outputs: [makeOutputTarget(), makeOutputTarget()],
        current: 0,
      };
    });

    const base = {
      glslVersion: GLSL3,
      vertexShader: fullscreenVertex,
      depthTest: false,
      depthWrite: false,
    };
    this.timeMaterial = new ShaderMaterial({
      ...base,
      fragmentShader: timeSpectrumFragment,
      uniforms: {
        uH0: { value: null },
        uTime: { value: 0 },
        uLengthScale: { value: 1 },
        uDepth: { value: settings.depth },
        uSize: { value: size },
      },
    });
    this.fftMaterial = new ShaderMaterial({
      ...base,
      fragmentShader: fftFragment,
      uniforms: {
        uInputA: { value: null },
        uInputB: { value: null },
        uSize: { value: size },
        uSubSize: { value: 2 },
        uHorizontal: { value: true },
      },
    });
    this.assembleMaterial = new ShaderMaterial({
      ...base,
      fragmentShader: assembleFragment,
      uniforms: {
        uInputA: { value: null },
        uInputB: { value: null },
        uPrevious: { value: null },
        uChoppiness: { value: settings.choppiness },
        uDeltaTime: { value: 0 },
        uFoamDecay: { value: settings.foamDecay },
      },
    });

    this.resetFoam();
    this.updateSpectrum();
  }

  /** Recomputes h0(k) for every cascade. Call after changing wave systems or depth. */
  updateSpectrum(): void {
    for (const cascade of this.cascades) {
      const data = buildInitialSpectrum(
        this.size,
        cascade,
        this.settings.systems,
        this.settings.depth,
        cascade.noise,
      );
      cascade.h0.image.data = data;
      cascade.h0.needsUpdate = true;
    }
  }

  displacement(index: number): Texture {
    const cascade = this.cascade(index);
    return cascade.outputs[cascade.current].textures[0] as Texture;
  }

  derivatives(index: number): Texture {
    const cascade = this.cascade(index);
    return cascade.outputs[cascade.current].textures[1] as Texture;
  }

  update(time: number, deltaTime: number): void {
    const previousTarget = this.renderer.getRenderTarget();
    const log2Size = Math.log2(this.size);

    this.timeMaterial.uniforms.uDepth!.value = this.settings.depth;
    this.assembleMaterial.uniforms.uChoppiness!.value = this.settings.choppiness;
    this.assembleMaterial.uniforms.uFoamDecay!.value = this.settings.foamDecay;
    this.assembleMaterial.uniforms.uDeltaTime!.value = deltaTime;

    for (const cascade of this.cascades) {
      let read: 0 | 1 = 0;
      this.timeMaterial.uniforms.uH0!.value = cascade.h0;
      this.timeMaterial.uniforms.uTime!.value = time;
      this.timeMaterial.uniforms.uLengthScale!.value = cascade.lengthScale;
      this.draw(this.timeMaterial, this.fftTargets[read]);

      for (const horizontal of [true, false]) {
        for (let stage = 0; stage < log2Size; stage++) {
          const source = this.fftTargets[read];
          const destination = this.fftTargets[read === 0 ? 1 : 0];
          this.fftMaterial.uniforms.uInputA!.value = source.textures[0];
          this.fftMaterial.uniforms.uInputB!.value = source.textures[1];
          this.fftMaterial.uniforms.uSubSize!.value = 2 << stage;
          this.fftMaterial.uniforms.uHorizontal!.value = horizontal;
          this.draw(this.fftMaterial, destination);
          read = read === 0 ? 1 : 0;
        }
      }

      const previous = cascade.outputs[cascade.current];
      const next = cascade.current === 0 ? 1 : 0;
      this.assembleMaterial.uniforms.uInputA!.value = this.fftTargets[read].textures[0];
      this.assembleMaterial.uniforms.uInputB!.value = this.fftTargets[read].textures[1];
      this.assembleMaterial.uniforms.uPrevious!.value = previous.textures[0];
      this.draw(this.assembleMaterial, cascade.outputs[next]);
      cascade.current = next;
    }

    this.renderer.setRenderTarget(previousTarget);
  }

  resetFoam(): void {
    const previousTarget = this.renderer.getRenderTarget();
    const clearColor = this.renderer.getClearColor(new Color());
    const clearAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 1);
    for (const cascade of this.cascades) {
      for (const target of cascade.outputs) {
        this.renderer.setRenderTarget(target);
        this.renderer.clear(true, false, false);
      }
    }
    this.renderer.setClearColor(clearColor, clearAlpha);
    this.renderer.setRenderTarget(previousTarget);
  }

  private cascade(index: number): Cascade {
    const cascade = this.cascades[index];
    if (!cascade) throw new Error(`No cascade ${index}`);
    return cascade;
  }

  private draw(material: ShaderMaterial, target: WebGLRenderTarget): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }
}
