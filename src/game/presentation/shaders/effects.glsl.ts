export const GHOST_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normal;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const GHOST_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec3 v = normalize(cameraPosition - vWorld);
  float fresnel = pow(1.0 - abs(dot(normalize(vNormalW), v)), 2.0);
  // Hologram scanlines: 0.5 + 0.5·sin(y·ω + t·s), scrolling upward.
  float scan = 0.5 + 0.5 * sin(vWorld.y * 40.0 - uTime * 6.0);
  float flicker = 0.9 + 0.1 * sin(uTime * 37.0);
  float alpha = (0.12 + 0.55 * fresnel) * (0.6 + 0.4 * scan) * flicker;
  gl_FragColor = vec4(uColor * (0.6 + fresnel * 1.6), alpha);
}
`;

/**
 * Particles are fully analytic on the GPU. With linear drag β and gravity g:
 *   v(t) = (v0 + g/β)·e^(−βt) − g/β
 *   x(t) = x0 + (v0 + g/β)(1 − e^(−βt))/β − g·t/β
 * so no per-frame CPU integration or buffer upload is needed after a burst is spawned.
 */
export const PARTICLE_VERTEX = /* glsl */ `
attribute vec3 aVelocity;
attribute vec3 aColor;
attribute float aStart;
uniform float uTime;
uniform float uGravity;
uniform float uDrag;
uniform float uLife;
uniform float uFloorY;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vAge;
void main() {
  float t = uTime - aStart;
  vAge = t / uLife;
  vec3 g = vec3(0.0, -uGravity, 0.0);
  vec3 term = (aVelocity - g / uDrag) * (1.0 - exp(-uDrag * t)) / uDrag;
  vec3 p = position + term + g * t / uDrag;
  p.y = max(p.y, uFloorY); // particles rest on the well floor instead of sinking through it
  vColor = aColor;
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  float alive = step(0.0, t) * step(t, uLife);
  gl_PointSize = alive * (90.0 / -mv.z) * uPixelRatio * (1.0 - vAge * 0.7);
  gl_Position = projectionMatrix * mv;
}
`;

export const PARTICLE_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAge;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float glow = exp(-d * d * 18.0);
  float fade = 1.0 - clamp(vAge, 0.0, 1.0);
  gl_FragColor = vec4(vColor * glow * 3.0 * fade, glow * fade);
}
`;

/** Final screen pass: FXAA is handled by the dedicated pass; this adds vignette and film grain. */
export const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.035 },
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
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      vec2 c = vUv - 0.5;
      float vignette = 1.0 - uVignette * dot(c, c) * 2.2;
      float grain = (hash(vUv * 1024.0 + fract(uTime) * 91.0) - 0.5) * uGrain;
      gl_FragColor = vec4(col.rgb * vignette + grain, col.a);
    }
  `,
};
