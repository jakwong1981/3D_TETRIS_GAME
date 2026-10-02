/**
 * Full-screen photo backdrop. Drawn at the far plane (z = w) so the well always renders in front.
 * "Cover" fit: scale UVs so the image fills the screen without stretching, cropping the long side.
 */
export const PHOTO_SCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

export const PHOTO_SCREEN_FRAGMENT = /* glsl */ `
uniform sampler2D uImage;
uniform float uImageAspect;
uniform float uScreenAspect;
uniform float uPan;
uniform float uExposure;
varying vec2 vUv;
void main() {
  vec2 uv = vUv - 0.5;
  float ratio = uScreenAspect / uImageAspect;
  if (ratio > 1.0) uv.y /= ratio; else uv.x *= ratio;
  // Small horizontal pan with camera yaw gives a hint of parallax when orbiting.
  uv.x += uPan;
  gl_FragColor = vec4(texture2D(uImage, uv + 0.5).rgb * uExposure, 1.0);
}
`;

/** The same photo wrapped as an equirectangular dome, only for baking the reflection cube map. */
export const PHOTO_DOME_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

export const PHOTO_DOME_FRAGMENT = /* glsl */ `
uniform sampler2D uImage;
uniform float uExposure;
varying vec3 vDir;
const float PI = 3.14159265;
void main() {
  vec3 d = normalize(vDir);
  vec2 uv = vec2(atan(d.z, d.x) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  gl_FragColor = vec4(texture2D(uImage, uv).rgb * uExposure, 1.0);
}
`;
