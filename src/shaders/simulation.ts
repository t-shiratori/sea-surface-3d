/* All simulation passes render a full-screen triangle pair into float targets. */

export const fullscreenVertex = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const common = /* glsl */ `
precision highp float;
precision highp int;

const float PI = 3.141592653589793;
const float GRAVITY = 9.81;

vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// Multiplies by i.
vec2 mulI(vec2 a) {
  return vec2(-a.y, a.x);
}
`;

/**
 * Evolves h0(k) to time t and writes the eight spectra we need, packed two
 * real-valued signals per complex number (X + iY), four complex per two targets.
 */
export const timeSpectrumFragment = /* glsl */ `
${common}
uniform sampler2D uH0;
uniform float uTime;
uniform float uLengthScale;
uniform float uDepth;
uniform int uSize;

layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 n = vec2(
    p.x < uSize / 2 ? p.x : p.x - uSize,
    p.y < uSize / 2 ? p.y : p.y - uSize
  );
  vec2 k = n * 2.0 * PI / uLengthScale;
  float kLength = max(length(k), 1e-6);
  float invK = 1.0 / kLength;

  vec4 h0 = texelFetch(uH0, p, 0);
  float omega = sqrt(GRAVITY * kLength * tanh(min(kLength * uDepth, 20.0)));
  float phase = omega * uTime;
  vec2 e = vec2(cos(phase), sin(phase));
  vec2 h = cmul(h0.xy, e) + cmul(h0.zw, vec2(e.x, -e.y));
  vec2 ih = mulI(h);

  // Horizontal displacement points towards crests (choppy waves).
  vec2 dx = ih * k.x * invK;
  vec2 dz = ih * k.y * invK;
  vec2 dy = h;
  vec2 dxz = -h * k.x * k.y * invK;
  vec2 dyx = ih * k.x;
  vec2 dyz = ih * k.y;
  vec2 dxx = -h * k.x * k.x * invK;
  vec2 dzz = -h * k.y * k.y * invK;

  outA = vec4(dx + mulI(dz), dy + mulI(dxz));
  outB = vec4(dyx + mulI(dyz), dxx + mulI(dzz));
}
`;

/** One radix-2 Stockham pass of an inverse FFT along one axis, on two targets at once. */
export const fftFragment = /* glsl */ `
${common}
uniform sampler2D uInputA;
uniform sampler2D uInputB;
uniform int uSize;
uniform int uSubSize;
uniform bool uHorizontal;

layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int index = uHorizontal ? p.x : p.y;
  int halfSub = uSubSize / 2;
  int evenIndex = (index / uSubSize) * halfSub + (index % halfSub);
  int oddIndex = evenIndex + uSize / 2;
  ivec2 pe = uHorizontal ? ivec2(evenIndex, p.y) : ivec2(p.x, evenIndex);
  ivec2 po = uHorizontal ? ivec2(oddIndex, p.y) : ivec2(p.x, oddIndex);

  float angle = 2.0 * PI * float(index % uSubSize) / float(uSubSize);
  vec2 twiddle = vec2(cos(angle), sin(angle));

  vec4 evenA = texelFetch(uInputA, pe, 0);
  vec4 oddA = texelFetch(uInputA, po, 0);
  vec4 evenB = texelFetch(uInputB, pe, 0);
  vec4 oddB = texelFetch(uInputB, po, 0);

  outA = vec4(evenA.xy + cmul(twiddle, oddA.xy), evenA.zw + cmul(twiddle, oddA.zw));
  outB = vec4(evenB.xy + cmul(twiddle, oddB.xy), evenB.zw + cmul(twiddle, oddB.zw));
}
`;

/**
 * Unpacks the IFFT result into displacement and derivative maps and integrates
 * a foam "turbulence" value from the Jacobian of the horizontal displacement.
 */
export const assembleFragment = /* glsl */ `
${common}
uniform sampler2D uInputA;
uniform sampler2D uInputB;
uniform sampler2D uPrevious;
uniform float uChoppiness;
uniform float uDeltaTime;
uniform float uFoamDecay;

layout(location = 0) out vec4 outDisplacement;
layout(location = 1) out vec4 outDerivatives;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uInputA, p, 0);
  vec4 b = texelFetch(uInputB, p, 0);

  float dx = a.x;
  float dz = a.y;
  float dy = a.z;
  float dxz = a.w;
  float dyx = b.x;
  float dyz = b.y;
  float dxx = b.z;
  float dzz = b.w;

  float l = uChoppiness;
  float jacobian = (1.0 + l * dxx) * (1.0 + l * dzz) - l * l * dxz * dxz;

  // Turbulence relaxes back towards 1 and is pulled down wherever the surface folds.
  float previous = texelFetch(uPrevious, p, 0).a;
  float turbulence = previous + uDeltaTime * uFoamDecay / max(jacobian, 0.5);
  turbulence = min(jacobian, turbulence);

  outDisplacement = vec4(l * dx, dy, l * dz, turbulence);
  outDerivatives = vec4(dyx, dyz, l * dxx, l * dzz);
}
`;
