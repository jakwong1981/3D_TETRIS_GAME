export const WELL_VERTEX = /* glsl */ `
uniform vec3 uWellSize; // (width, depth, height) in cells
varying vec3 vGrid;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vGrid = vec3(world.x + uWellSize.x * 0.5, world.z + uWellSize.y * 0.5, world.y);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const WELL_FRAGMENT = /* glsl */ `
uniform vec3 uWellSize;
uniform vec3 uActive[4];
uniform int uHasActive;
uniform vec2 uActiveLayers;  // min z, max z of the falling piece
uniform int uClearMask;      // bit z set = layer z is being cleared
uniform float uClearPulse;
uniform float uTime;
uniform vec3 uFogColor;
uniform vec3 uLineColor;
uniform vec3 uHighlightColor;
uniform float uBaseAlpha;
uniform float uLineAlpha;
varying vec3 vGrid;
varying vec3 vNormalW;
varying vec3 vWorld;

// Anti-aliased grid: distance to the nearest integer line, divided by its screen-space
// derivative (fwidth), so lines stay ~1px wide at any distance and never shimmer.
float gridLine(vec2 coord, float widthPx) {
  vec2 d = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
  return 1.0 - clamp(min(d.x, d.y) / widthPx, 0.0, 1.0);
}

void main() {
  vec3 n = abs(vNormalW);
  vec2 planeCoord;
  int face; // 0 floor, 1 wall facing x, 2 wall facing y(depth)
  if (n.y > 0.5) { planeCoord = vGrid.xy; face = 0; }
  else if (n.x > 0.5) { planeCoord = vGrid.yz; face = 1; }
  else { planeCoord = vGrid.xz; face = 2; }

  // Neutral smoked-glass panel + soft white lines: no hue of its own, so it never fights the
  // backdrop photo or the coloured cubes. The floor is a touch denser than the walls to anchor it.
  vec3 base = vec3(0.02);
  float line = gridLine(planeCoord, 1.0);
  vec3 col = mix(base, uLineColor, line);
  float panelAlpha = face == 0 ? uBaseAlpha * 1.4 : uBaseAlpha;
  float alpha = mix(panelAlpha, uLineAlpha, line);

  // Orthographic projection of the falling piece onto the floor and walls: the strongest depth cue.
  if (uHasActive == 1) {
    for (int i = 0; i < 4; i++) {
      vec3 c = uActive[i];
      vec2 target = face == 0 ? c.xy : (face == 1 ? c.yz : c.xz);
      vec2 cellCoord = floor(planeCoord);
      if (all(equal(cellCoord, target))) { col = mix(col, uHighlightColor, 0.35); alpha = max(alpha, 0.6); }
    }
    if (face != 0) {
      float z = vGrid.z;
      float inBand = step(uActiveLayers.x, z) * step(z, uActiveLayers.y + 1.0);
      float edge = smoothstep(0.12, 0.0, min(abs(z - uActiveLayers.x), abs(z - uActiveLayers.y - 1.0)));
      float pulse = 0.5 + 0.5 * sin(uTime * 6.0);
      col += uHighlightColor * (inBand * 0.05 + edge * (0.6 + 0.4 * pulse));
      alpha = max(alpha, edge);
    }
  }

  int layer = int(floor(vGrid.z));
  if (face != 0 && layer >= 0 && layer < 30 && ((uClearMask >> layer) & 1) == 1) {
    col += vec3(1.0, 0.95, 0.85) * uClearPulse * 1.5;
    alpha = max(alpha, uClearPulse);
  }

  // Height fog: f = clamp(h / H)², the top of the well melts into the backdrop horizon.
  float f = clamp(vGrid.z / uWellSize.z, 0.0, 1.0);
  // Fades toward transparent instead of into a fog tint, so the top never shows a coloured band.
  alpha *= 1.0 - f * f * 0.6;
  gl_FragColor = vec4(col, alpha);
}
`;
