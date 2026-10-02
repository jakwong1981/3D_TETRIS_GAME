import { NOISE_GLSL } from './common.glsl';

export const CUBE_VERTEX = /* glsl */ `
attribute vec3 aColor;
attribute float aMaterial;
attribute float aClearing;
attribute float aRecent;
uniform float uSquash;
uniform float uTime;
varying vec3 vLocal;
varying vec3 vFaceNormal;
varying vec3 vWorld;
varying vec3 vColor;
varying float vMaterial;
varying float vClearing;

void main() {
  vec3 p = position;
  // Jelly squash from the sim's damped spring: shrink y, bulge xz, keep the cell bottom planted.
  float s = uSquash * aRecent;
  p.y = p.y * (1.0 - s) - s * 0.5;
  p.xz *= 1.0 + 0.5 * s;
  if (aMaterial > 1.5) p.xz += sin(p.y * 6.0 + uTime * 18.0) * 0.06 * abs(s);
  vLocal = position;
  vFaceNormal = normal;
  vColor = aColor;
  vMaterial = aMaterial;
  vClearing = aClearing;
  vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const CUBE_FRAGMENT = /* glsl */ `
uniform sampler2D uSceneColor;
uniform vec2 uResolution;
uniform samplerCube uEnv;
uniform float uEnvMaxLod;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform float uTime;
uniform float uClearT;
uniform float uRim;
uniform float uOpacity;
uniform vec3 uFogColor;
uniform float uFogFar;
varying vec3 vLocal;
varying vec3 vFaceNormal;
varying vec3 vWorld;
varying vec3 vColor;
varying float vMaterial;
varying float vClearing;

const float PI = 3.14159265;
const float BEVEL = 0.08;

${NOISE_GLSL}

float saturate(float x) { return clamp(x, 0.0, 1.0); }

// Schlick: F = F0 + (1 − F0)(1 − cosθ)^5
vec3 fresnelSchlick(float cosTheta, vec3 f0) {
  return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

// GGX / Trowbridge-Reitz: D = α² / (π((n·h)²(α² − 1) + 1)²)
float distributionGGX(float nh, float a) {
  float a2 = a * a;
  float d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

// Anisotropic GGX (Burley): stretches the lobe along the brushed tangent.
float distributionAnisoGGX(vec3 h, vec3 n, vec3 t, vec3 b, float ax, float ay) {
  float th = dot(t, h) / ax;
  float bh = dot(b, h) / ay;
  float nh = dot(n, h);
  float d = th * th + bh * bh + nh * nh;
  return 1.0 / (PI * ax * ay * d * d);
}

// Smith-Schlick-GGX geometry term, k = (r + 1)² / 8 for direct light.
float geometrySmith(float nv, float nl, float roughness) {
  float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  float gv = nv / (nv * (1.0 - k) + k);
  float gl = nl / (nl * (1.0 - k) + k);
  return gv * gl;
}

// Rounded-box SDF normal: q = max(|p| − (½ − r), 0); n = normalize(sign(p)·q).
// On a flat face only one component of q is non-zero, so n is the face normal; near edges it bends.
vec3 bevelNormal(vec3 p, out float edge) {
  vec3 q = max(abs(p) - (0.5 - BEVEL), 0.0);
  vec3 sorted = vec3(min(q.x, min(q.y, q.z)), q.x + q.y + q.z - min(q.x, min(q.y, q.z)) - max(q.x, max(q.y, q.z)), max(q.x, max(q.y, q.z)));
  edge = smoothstep(0.0, BEVEL, sorted.y);
  if (dot(q, q) < 1e-6) return vFaceNormal;
  return normalize(sign(p) * q);
}

// Triplanar weights w = |n|^k / Σ|n|^k: projects noise without UV seams.
float triplanarNoise(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  return valueNoise(p.yz * 9.0) * w.x + valueNoise(p.xz * 9.0) * w.y + valueNoise(p.xy * 9.0) * w.z;
}

// Thin-film interference: path difference Δ = 2·n_f·d·cosθ_t; per-wavelength intensity ∝ cos²(πΔ/λ).
vec3 thinFilm(float cosTheta, float thicknessNm) {
  float nf = 1.33;
  float sinT = sqrt(saturate(1.0 - cosTheta * cosTheta)) / nf;
  float cosT = sqrt(saturate(1.0 - sinT * sinT));
  float delta = 2.0 * nf * thicknessNm * cosT;
  vec3 lambda = vec3(650.0, 532.0, 450.0);
  vec3 phase = cos(PI * delta / lambda);
  return phase * phase;
}

vec3 envSample(vec3 dir, float roughness) {
  return textureLod(uEnv, dir, roughness * uEnvMaxLod).rgb;
}

vec3 directSpecular(vec3 n, vec3 v, vec3 l, vec3 f0, float roughness, float nl, float nv) {
  vec3 h = normalize(v + l);
  float D = distributionGGX(saturate(dot(n, h)), roughness * roughness);
  float G = geometrySmith(nv, nl, roughness);
  vec3 F = fresnelSchlick(saturate(dot(h, v)), f0);
  return D * G * F / max(4.0 * nv * nl, 1e-4);
}

// Snell refraction into screen space, with a separate IOR per channel (chromatic dispersion).
vec3 screenRefraction(vec3 n, vec3 v, float strength) {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 iors = vec3(1.47, 1.50, 1.53);
  vec3 col;
  for (int i = 0; i < 3; i++) {
    vec3 r = refract(-v, n, 1.0 / iors[i]);
    vec2 offset = r.xy * strength;
    col[i] = texture2D(uSceneColor, uv + offset)[i];
  }
  return col;
}

vec3 shadeGlass(vec3 n, vec3 v, vec3 l, float nl, float nv) {
  float ior = 1.5;
  float f0s = pow((ior - 1.0) / (ior + 1.0), 2.0); // F0 = ((n−1)/(n+1))² ≈ 0.04
  vec3 F = fresnelSchlick(nv, vec3(f0s));
  // Beer–Lambert: T = e^(−σd); σ derived from the tint so the colour deepens with thickness.
  float thickness = 0.6 / max(nv, 0.25);
  vec3 sigma = (1.0 - vColor) * 2.2 + 0.05;
  vec3 transmitted = screenRefraction(n, v, 0.06) * exp(-sigma * thickness) + vColor * 0.06;
  vec3 iridescence = thinFilm(nv, 380.0 + 120.0 * sin(uTime * 0.3));
  vec3 reflected = envSample(reflect(-v, n), 0.05) * mix(vec3(1.0), iridescence, 0.6);
  vec3 spec = directSpecular(n, v, l, vec3(f0s), 0.06, nl, nv) * uLightColor * nl;
  return mix(transmitted, reflected, F) + spec;
}

vec3 shadeMetal(vec3 n, vec3 v, vec3 l, float nl, float nv) {
  float roughness = 0.22 + 0.18 * triplanarNoise(vLocal + vWorld * 0.1, n);
  vec3 f0 = vColor;
  vec3 t = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(n, t);
  vec3 h = normalize(v + l);
  float a = roughness * roughness;
  float D = distributionAnisoGGX(h, n, t, b, a * 1.8, a * 0.45);
  float G = geometrySmith(nv, nl, roughness);
  vec3 F = fresnelSchlick(saturate(dot(h, v)), f0);
  vec3 spec = D * G * F / max(4.0 * nv * nl, 1e-4) * uLightColor * nl;
  vec3 ibl = envSample(reflect(-v, n), roughness) * fresnelSchlick(nv, f0);
  return spec + ibl * 1.4 + f0 * uAmbient * 0.15;
}

vec3 shadeJelly(vec3 n, vec3 v, vec3 l, float nl, float nv) {
  // Wrap lighting (n·l + w)/(1 + w) lets light bleed past the terminator like a soft body.
  float wrap = 0.5;
  float diffuse = saturate((dot(n, l) + wrap) / (1.0 + wrap));
  // Subsurface back-light: light exiting towards the viewer, attenuated by e^(−d/ℓ).
  vec3 lt = l + n * 0.3;
  float back = pow(saturate(dot(v, -lt)), 3.0) * exp(-0.6 / 0.45);
  vec3 body = vColor * (diffuse * uLightColor * 0.85 + uAmbient) + vColor * back * 2.0;
  vec3 transmitted = screenRefraction(n, v, 0.025) * vColor * 0.55;
  vec3 F = fresnelSchlick(nv, vec3(0.03));
  vec3 spec = directSpecular(n, v, l, vec3(0.03), 0.18, nl, nv) * uLightColor * nl;
  vec3 reflected = envSample(reflect(-v, n), 0.15);
  return mix(mix(body, transmitted, 0.35), reflected, F) + spec;
}

void main() {
  if (vClearing > 0.5) {
    float noise = valueNoise3(vWorld * 4.0);
    if (noise < uClearT) discard;
  }
  float edge;
  vec3 n = bevelNormal(vLocal, edge);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 l = normalize(uLightDir);
  float nl = saturate(dot(n, l));
  float nv = max(dot(n, v), 1e-3);

  vec3 col;
  if (vMaterial < 0.5) col = shadeGlass(n, v, l, nl, nv);
  else if (vMaterial < 1.5) col = shadeMetal(n, v, l, nl, nv);
  else col = shadeJelly(n, v, l, nl, nv);

  col += vColor * edge * 0.25;
  // Fresnel rim (1 − |n·v|)^p keeps the falling piece readable against the busy city.
  col += vColor * pow(1.0 - abs(dot(n, v)), 3.0) * uRim * 1.8;

  if (vClearing > 0.5) {
    float noise = valueNoise3(vWorld * 4.0);
    float burn = smoothstep(uClearT, uClearT + 0.08, noise) - smoothstep(uClearT + 0.08, uClearT + 0.16, noise);
    col += vec3(3.0, 2.2, 1.2) * burn * step(0.01, uClearT);
  }

  float fog = saturate(length(cameraPosition - vWorld) / uFogFar);
  col = mix(col, uFogColor, fog * fog * 0.6);
  gl_FragColor = vec4(col, uOpacity);
}
`;
