import { COLOR_GLSL, NOISE_GLSL } from './common.glsl';

export const HK_PRESETS = [
  'Victoria Harbour · Night',
  'Mong Kok · Neon Rain',
  'The Peak · Dusk',
  'Lion Rock · Dawn',
  'Typhoon Signal No. 8',
] as const;

export type HongKongPreset = (typeof HK_PRESETS)[number];

/** Horizon colours per preset, linear RGB. Fog uses these so the well and backdrop share one horizon. */
export const HK_HORIZON_COLORS: readonly (readonly [number, number, number])[] = [
  [0.95, 0.35, 0.6],
  [0.9, 0.2, 0.75],
  [1.0, 0.55, 0.25],
  [1.0, 0.75, 0.55],
  [0.3, 0.75, 0.75],
];

export const HK_BACKDROP_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
  gl_Position.z = gl_Position.w; // pin to far plane so the dome never clips the well
}
`;

export const HK_BACKDROP_FRAGMENT = /* glsl */ `
uniform int uPreset;
uniform float uSeed;
uniform float uTime;
uniform float uFlash;
uniform float uDim;
uniform float uDesat;
uniform vec3 uSunDir;
varying vec3 vDir;

const float PI = 3.14159265;
// The gameplay camera looks ~45° down, so the city horizon sits below eye level to stay in frame.
const float HORIZON = -0.3;

${NOISE_GLSL}
${COLOR_GLSL}

// Henyey–Greenstein phase: forward-scattered glow around the sun (Mie approximation).
float henyeyGreenstein(float cosTheta, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

vec3 skyGradient(float e, vec3 dir) {
  vec3 zenith, horizon;
  if (uPreset == 0) { zenith = vec3(0.15, 0.2, 0.85); horizon = vec3(0.95, 0.35, 0.6); }
  else if (uPreset == 1) { zenith = vec3(0.35, 0.1, 0.9); horizon = vec3(0.9, 0.2, 0.75); }
  else if (uPreset == 2) { zenith = vec3(0.45, 0.25, 0.85); horizon = vec3(1.0, 0.55, 0.25); }
  else if (uPreset == 3) { zenith = vec3(0.25, 0.65, 1.0); horizon = vec3(1.0, 0.75, 0.55); }
  else { zenith = vec3(0.2, 0.3, 0.65); horizon = vec3(0.3, 0.75, 0.75); }
  // sqrt falloff mimics the thicker optical path (stronger Rayleigh reddening) near the horizon.
  vec3 sky = mix(horizon, zenith, sqrt(clamp((e - HORIZON) / (1.0 - HORIZON), 0.0, 1.0)));
  if (uPreset == 2 || uPreset == 3) {
    float mie = henyeyGreenstein(dot(dir, uSunDir), 0.76);
    vec3 sunTint = uPreset == 2 ? vec3(1.0, 0.45, 0.18) : vec3(1.0, 0.7, 0.55);
    sky += sunTint * mie * 0.35;
  }
  return sky;
}

float ridgeHeight(float u) {
  float h = HORIZON + 0.08 + fbm(vec2(u * 9.0 + uSeed, 0.0)) * 0.4;
  if (uPreset == 3) {
    // Lion Rock: a crouching head silhouette at a fixed azimuth.
    float d = u - 0.27;
    h += 0.35 * exp(-d * d * 900.0) + 0.18 * exp(-(d - 0.035) * (d - 0.035) * 500.0);
  }
  return h;
}

vec3 neonPalette(float k);

// Pastel candy facades, in the spirit of the Choi Hung estate: every building gets its own hue.
vec3 facadeColor(float k) {
  if (k < 0.2) return vec3(1.0, 0.55, 0.65);
  if (k < 0.4) return vec3(0.5, 0.9, 0.7);
  if (k < 0.6) return vec3(1.0, 0.85, 0.4);
  if (k < 0.8) return vec3(0.5, 0.75, 1.0);
  return vec3(0.8, 0.6, 1.0);
}
vec3 neonSign(float local, float height, float cell);

struct SkylineHit { float mask; vec3 color; };

SkylineHit skyline(float u, float e, float layer) {
  float columns = 70.0 + layer * 55.0;
  float cell = floor(u * columns);
  float local = fract(u * columns);
  float h = hash11(cell * 1.37 + uSeed * 11.0 + layer * 91.0);
  float height = HORIZON + 0.04 + h * h * (0.22 + 0.17 * layer);
  if (uPreset == 0 && layer > 1.5) {
    float ifc = abs(u - 0.62) * columns;
    if (ifc < 1.5) height = HORIZON + 0.75;
  }
  float gap = step(0.06, local) * step(local, 0.94);
  SkylineHit hit;
  hit.mask = step(HORIZON, e) * step(e, height) * gap;
  vec3 body = facadeColor(hash11(cell * 2.3 + layer * 17.0 + uSeed)) * (0.32 + 0.12 * layer) * (0.75 + 0.5 * local);
  vec2 win = vec2(local * 5.0, (e - HORIZON) * (90.0 + layer * 30.0));
  float lit = step(0.66 - 0.1 * float(uPreset == 1), hash21(floor(win) + cell * 7.0 + layer));
  float frame = step(0.35, fract(win.x)) * step(fract(win.x), 0.75) * step(0.45, fract(win.y));
  vec3 warm = mix(vec3(1.0, 0.95, 0.75), neonPalette(hash11(cell * 4.1 + layer)), 0.35);
  float nightFactor = (uPreset == 3 || uPreset == 2) ? 0.4 : 0.8;
  hit.color = body + warm * lit * frame * 0.75 * nightFactor;
  if (uPreset == 1 && layer > 1.5) hit.color += neonSign(local, e - HORIZON, cell);
  return hit;
}

vec3 neonPalette(float k) {
  if (k < 0.25) return vec3(1.0, 0.1, 0.35);
  if (k < 0.5) return vec3(0.1, 0.9, 1.0);
  if (k < 0.75) return vec3(1.0, 0.75, 0.1);
  return vec3(0.6, 0.25, 1.0);
}

float sdBox2(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Hanging Mong Kok signboard: SDF rectangle outline with exponential glow e^(−d/r) and hash flicker.
vec3 neonSign(float local, float height, float cell) {
  float pick = hash11(cell * 3.1 + uSeed);
  if (pick < 0.45) return vec3(0.0);
  vec2 p = vec2(local - 0.5, height - (0.03 + 0.05 * hash11(cell * 5.7)));
  float d = abs(sdBox2(p * vec2(1.0, 6.0), vec2(0.32, 0.12)));
  float flicker = 0.75 + 0.25 * step(0.08, hash11(floor(uTime * 12.0) + cell));
  return neonPalette(hash11(cell * 9.3)) * exp(-d / 0.035) * 1.6 * flicker;
}

vec3 cityCarpet(float u, float e) {
  float below = HORIZON - e;
  vec2 p = vec2(u * 600.0, below * 260.0 / max(below + 0.05, 0.05));
  float light = step(0.9, hash21(floor(p) + uSeed));
  vec3 tint = facadeColor(hash21(floor(p) * 1.7));
  vec3 roofs = facadeColor(hash21(floor(p * 0.25) + 3.0)) * 0.3;
  float fade = exp(-below * 4.0);
  return roofs + tint * light * fade * 0.5;
}

vec3 harbourBeams(float u, float e) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float base = 0.5 + fi * 0.045;
    float angle = sin(uTime * 0.6 + fi * 1.7) * 0.6;
    vec2 d = vec2(u - base, e - HORIZON - 0.12);
    float dist = abs(d.x * cos(angle) - d.y * sin(angle));
    float along = d.x * sin(angle) + d.y * cos(angle);
    col += neonPalette(fract(fi * 0.27)) * exp(-dist * 900.0) * step(0.0, along) * exp(-along * 4.0) * 0.6;
  }
  return col;
}

vec3 typhoonClouds(vec2 p, vec3 base) {
  // Domain warping: f(p + 4·q(p)) bends the noise into swirling storm bands.
  vec2 q = vec2(fbm(p + uTime * 0.03), fbm(p + vec2(5.2, 1.3) - uTime * 0.02));
  float f = fbm(p + 4.0 * q);
  return mix(base, vec3(0.35, 0.3, 0.7), f * f * 1.4) + vec3(0.7, 0.75, 1.0) * uFlash * f;
}

float rainStreaks(float u, float e) {
  vec2 p = vec2(u * 260.0, e * 14.0 + uTime * 9.0);
  return step(0.985, hash21(floor(p))) * 0.25;
}

vec3 aboveHorizon(float u, float e, vec3 dir) {
  vec3 col = skyGradient(e, dir);
  if (uPreset == 4) col = typhoonClouds(vec2(u * 6.0, e * 3.0), col);
  if (uPreset == 0) col += harbourBeams(u, e);
  if (uPreset >= 2) {
    float ridge = ridgeHeight(u);
    // Hong Kong hills are green; distance haze blends them into the sky.
    if (e < ridge) col = mix(vec3(0.2, 0.55, 0.35) * (0.6 + 0.4 * fbm(vec2(u * 40.0, e * 20.0))), col, 0.3);
  }
  for (int l = 0; l < 3; l++) {
    SkylineHit hit = skyline(u, e, float(l));
    col = mix(col, hit.color, hit.mask);
  }
  return col;
}

void main() {
  vec3 dir = normalize(vDir);
  float u = atan(dir.z, dir.x) / (2.0 * PI) + 0.5;
  float e = asin(clamp(dir.y, -1.0, 1.0)) / (0.5 * PI);
  vec3 col;
  if (e >= HORIZON) {
    col = aboveHorizon(u, e, dir);
  } else if (uPreset == 0 || uPreset == 4) {
    // Planar reflection: mirror the elevation about the waterline, ripple u with FBM.
    float ripple = (fbm(vec2(u * 120.0, e * 40.0 + uTime * 0.4)) - 0.5) * 0.012;
    float mirrored = 2.0 * HORIZON - e;
    col = aboveHorizon(u + ripple, mirrored, vec3(dir.x, -dir.y, dir.z)) * 0.55;
    col += vec3(0.05, 0.3, 0.45);
  } else {
    col = cityCarpet(u, e);
  }
  // Streaks only near eye level: towards the nadir the azimuth cells collapse into wide bars.
  if ((uPreset == 1 || uPreset == 4) && e > HORIZON - 0.1) col += vec3(0.6, 0.65, 0.8) * rainStreaks(u, e);
  if (uPreset == 3) {
    // Beer–Lambert mist: transmittance e^(−σ·d) with d growing towards the horizon.
    float depth = 1.0 / (abs(e - HORIZON) * 12.0 + 0.3);
    col = mix(vec3(1.0, 0.8, 0.85), col, exp(-0.35 * depth));
  }
  // Negative uDesat extrapolates away from grey (vivid); the cap keeps only neon and beams exceed the bloom threshold; the city stays detailed, not blown out.
  col = min(desaturate(col, uDesat) * uDim, vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}
`;
