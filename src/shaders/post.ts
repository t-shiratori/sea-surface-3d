/**
 * Softly compresses extreme HDR values (the sun disc is ~10⁴) before bloom so
 * that glare stays local. Anything this bright is white after tone mapping anyway.
 */
export const HighlightCompressShader = {
  name: 'HighlightCompressShader',
  uniforms: {
    tDiffuse: { value: null },
    uLimit: { value: 400 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uLimit;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      // Half-float targets can overflow to Inf on the sun disc; Inf/NaN would smear across the whole bloom.
      if (any(isnan(color.rgb))) color.rgb = vec3(0.0);
      color.rgb = min(color.rgb, vec3(6e4));
      float peak = max(max(color.r, color.g), color.b);
      float compressed = peak <= uLimit ? peak : uLimit + log(1.0 + peak - uLimit);
      gl_FragColor = vec4(color.rgb * (compressed / max(peak, 1e-6)), color.a);
    }
  `,
};
