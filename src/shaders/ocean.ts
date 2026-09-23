export const oceanVertex = /* glsl */ `
precision highp float;

uniform sampler2D uDisplacement0;
uniform sampler2D uDisplacement1;
uniform sampler2D uDisplacement2;
uniform vec3 uLengthScales;
uniform vec2 uCenter;
uniform float uTexelsPerSide;
uniform float uAngularStep;

out vec3 vWorldPosition;
out vec2 vSurfaceUV;
out float vHeight;

vec4 sampleCascade(sampler2D map, vec2 uv, float lengthScale, float spacing) {
  // Prefilter by the local vertex spacing so distant geometry does not alias.
  float texel = lengthScale / uTexelsPerSide;
  float lod = log2(max(spacing / texel, 1.0));
  return textureLod(map, uv / lengthScale, lod);
}

void main() {
  vec2 local = position.xz;
  vec2 surface = local + uCenter;
  float spacing = max(length(local) * uAngularStep, 0.001);

  vec3 displacement =
    sampleCascade(uDisplacement0, surface, uLengthScales.x, spacing).xyz +
    sampleCascade(uDisplacement1, surface, uLengthScales.y, spacing).xyz +
    sampleCascade(uDisplacement2, surface, uLengthScales.z, spacing).xyz;

  vec3 world = vec3(surface.x, 0.0, surface.y) + displacement;
  vWorldPosition = world;
  vSurfaceUV = surface;
  vHeight = displacement.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const oceanFragment = /* glsl */ `
precision highp float;

uniform sampler2D uDisplacement0;
uniform sampler2D uDisplacement1;
uniform sampler2D uDisplacement2;
uniform sampler2D uDerivatives0;
uniform sampler2D uDerivatives1;
uniform sampler2D uDerivatives2;
uniform vec3 uLengthScales;
uniform samplerCube uEnvironment;
uniform float uEnvironmentMaxLod;

uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uWaterColor;
uniform vec3 uScatterColor;
uniform vec3 uBubbleColor;
uniform float uScatterStrength;
uniform float uWavePeakScatter;
uniform float uRoughness;
uniform float uFoamBias;
uniform float uFoamScale;
uniform float uFoamCoverage;
uniform float uFogDensity;
uniform float uTime;

in vec3 vWorldPosition;
in vec2 vSurfaceUV;
in float vHeight;

layout(location = 0) out vec4 outColor;

const float PI = 3.141592653589793;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float foamPattern(vec2 p) {
  float n = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    n += amplitude * valueNoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.13;
    amplitude *= 0.5;
  }
  return n;
}

float ggx(float nDotH, float a) {
  float a2 = a * a;
  float d = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

float smithG1(float nDotX, float a) {
  float k = a * 0.5;
  return nDotX / (nDotX * (1.0 - k) + k);
}

vec3 sampleSky(vec3 direction, float lod) {
  return textureLod(uEnvironment, direction, lod).rgb;
}

void main() {
  vec2 uv = vSurfaceUV;
  vec4 d0 = texture(uDerivatives0, uv / uLengthScales.x);
  vec4 d1 = texture(uDerivatives1, uv / uLengthScales.y);
  vec4 d2 = texture(uDerivatives2, uv / uLengthScales.z);
  vec4 derivatives = d0 + d1 + d2;
  vec2 slope = vec2(derivatives.x / (1.0 + derivatives.z), derivatives.y / (1.0 + derivatives.w));
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

  vec3 toCamera = cameraPosition - vWorldPosition;
  float distance = length(toCamera);
  vec3 V = toCamera / distance;
  vec3 L = normalize(uSunDirection);

  // Distant pixels average many facets; widen the lobe instead of letting the surface turn into a mirror.
  float distanceRoughness = smoothstep(20.0, 3000.0, distance);
  float roughness = clamp(uRoughness + distanceRoughness * 0.18, 0.02, 1.0);
  float a = roughness * roughness;

  // Keep the shading normal facing the viewer to avoid black back-facing sparkles.
  float nDotVRaw = dot(N, V);
  if (nDotVRaw < 0.0) {
    N = normalize(N - V * nDotVRaw * 1.02);
  }
  float nDotV = max(dot(N, V), 1e-4);
  float nDotL = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float nDotH = max(dot(N, H), 0.0);
  float vDotH = max(dot(V, H), 0.0);

  // Fresnel for water (IOR 1.33), damped slightly by roughness.
  float F0 = 0.02;
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - nDotV, 5.0) / (1.0 + 22.7 * pow(a, 1.5));
  fresnel = clamp(fresnel, 0.0, 1.0);

  // Sky reflection
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 reflection = sampleSky(R, roughness * uEnvironmentMaxLod * 0.6);

  // Sun specular (Cook-Torrance)
  float fresnelSun = F0 + (1.0 - F0) * pow(1.0 - vDotH, 5.0);
  float specular = ggx(nDotH, a) * smithG1(nDotV, a) * smithG1(nDotL, a) * fresnelSun / (4.0 * nDotV + 1e-4);
  // Clamp so a single glint cannot flood the bloom pass.
  vec3 sunSpecular = min(uSunColor * specular * step(0.0, L.y), vec3(300.0));

  // Subsurface scattering through wave crests and body colour
  vec3 ambient = sampleSky(vec3(0.0, 1.0, 0.0), uEnvironmentMaxLod);
  float waveHeight = max(0.0, vHeight);
  float towardsSun = pow(max(dot(L, -V), 0.0), 4.0);
  float k1 = uWavePeakScatter * waveHeight * towardsSun * pow(0.5 - 0.5 * dot(L, N), 3.0);
  float k2 = uScatterStrength * pow(nDotV, 2.0);
  float k3 = 0.6 * nDotL;
  vec3 scatter = (k1 + k2) * uScatterColor * uSunColor;
  scatter += k3 * uWaterColor * uSunColor + 0.25 * uWaterColor * ambient;

  // Foam
  float t0 = texture(uDisplacement0, uv / uLengthScales.x).a;
  float t1 = texture(uDisplacement1, uv / uLengthScales.y).a;
  float t2 = texture(uDisplacement2, uv / uLengthScales.z).a;
  float turbulence = 1.0 + (t0 - 1.0) + (t1 - 1.0) * 0.8 + (t2 - 1.0) * 0.4;
  float foamAmount = clamp((uFoamBias - turbulence) * uFoamScale, 0.0, 1.0);
  float pattern = foamPattern(uv * 0.9 + vec2(uTime * 0.05, 0.0));
  pattern = mix(pattern, 0.6, smoothstep(50.0, 600.0, distance));
  float foam = smoothstep(1.0 - uFoamCoverage, 1.0, foamAmount * (0.55 + pattern));
  foam = clamp(foam + foamAmount * 0.15, 0.0, 1.0);

  vec3 bubbles = uBubbleColor * foamAmount * (uSunColor * 0.2 + ambient * 0.5);
  vec3 water = (1.0 - fresnel) * (scatter + bubbles) + fresnel * reflection + sunSpecular;

  vec3 foamLight = uSunColor * (0.25 + 0.75 * max(dot(N, L), 0.0)) * 0.35 + ambient * 0.9;
  vec3 color = mix(water, foamLight * 0.95, foam);

  // Aerial perspective: fade into the horizon colour of the sky.
  vec3 horizonDirection = normalize(vec3(-V.x, 0.0, -V.z));
  vec3 horizon = sampleSky(horizonDirection, 2.0);
  float fog = 1.0 - exp(-distance * uFogDensity);
  color = mix(color, horizon, clamp(fog, 0.0, 1.0));

  outColor = vec4(color, 1.0);
}
`;
