# Physics & Shader Formulas

Every formula used by the game, where it lives, and what to tune. Units: 1 cell = 1 world unit; time in seconds.

## 1. Game logic (discrete, `src/game/domain`)

| Topic | Formula | Code | Tuning |
|---|---|---|---|
| Grid index | `i = x + W·(y + D·z)` | `grid.ts › index` | — |
| 90° rotation | Rx: `(x, −s·z, s·y)`, Ry: `(s·z, y, −s·x)`, Rz: `(−s·y, s·x, z)`, s = ±1. Exact integers (cos 90° = 0, sin = ±1), so there is no drift | `rotation.ts › rotateOffset` | — |
| Pivot rotation | `p' = R(p − c) + c`, c = the piece's pivot cell | `rotation.ts › rotateCells` | `pivotIndex` per piece |
| Wall kicks | First fitting offset from `KICK_OFFSETS` (±1, ±2 on x/y, then +1 up) | `active-piece.ts › tryRotate` | Order of offsets |
| Ghost / hard drop | `d = max{k : piece fits at z − k}`, `z_ghost = z − d` | `dropDistance` | — |
| Layer full | `Σ occupied(z) = W·D` | `grid.ts › isLayerFull` | — |
| Compaction | Each kept layer moves down by the number of removed layers below it | `removeLayers` | — |
| Fall speed | `t(n) = (0.8 − 0.007·(n−1))^(n−1)` seconds per cell; soft drop divides by 20 | `scoring.ts › secondsPerCell` | `softDropFactor`, `maxLevel` 15 |
| Level | `n = min(start + ⌊layers/10⌋, 15)` | `levelFor` | `layersPerLevel`, difficulty `startLevel` |
| Clear score | `(base[k] + 50·combo)·n`, base = [0, 100, 300, 500, 800], extended by +400 per layer above 4 | `layerClearPoints` | — |
| Drop score | soft +1 per cell, hard +2 per cell | `game-session.ts` | — |
| Randomizer | Bag = 5 classic pieces + each 3D-only piece with probability p; Fisher–Yates shuffle with mulberry32 | `randomizer.ts`, `random.ts` | `specialPieceChance` 0.1 / 0.35 / 0.7 |
| Lock delay | Lock when grounded for ≥ 0.5 s; a move or rotation resets the timer, at most 15 times | `updateFalling` | `lockDelay`, `maxLockResets` |
| Server plausibility | `layers·W·D ≤ pieces·4 + prefill`; `score ≤ pieces·330 + layers·(400 + 50·layers)·15`; `duration ≥ pieces·60 ms` | `server/services/plausibility.ts` | Constants at the top of the file |

## 2. Cosmetic physics (fixed 60 Hz step, `presentation/feedback-motion.ts`, `camera-rig.ts`)

- **Fixed timestep loop:** the frame `dt` is clamped to 0.05 s and fed into an accumulator, which runs as many 1/60 s steps as fit. This keeps the feel identical at 30 or 144 fps (`main.ts › frame`).
- **Semi-implicit Euler:** `v ← v + a·dt`, then `x ← x + v·dt`. It is stable for stiff springs at 60 Hz, where explicit Euler would gain energy.
- **Jelly squash spring:** `a = −k·x − c·v`, with k = 300 and c = 18.
  - Natural frequency `ω₀ = √k ≈ 17.3 rad/s`, which is about 2.8 Hz.
  - Damping ratio `ζ = c/(2√k) ≈ 0.52`, so the motion is underdamped and overshoots once or twice.
  - Locking adds a velocity impulse (0.8 for a normal lock, 1.4 for a hard drop).
  - In the shader, the cell's height scales by `(1 − s)`, its width by `(1 + s/2)` (volume roughly preserved), and the bottom stays planted with a `−s/2` offset.
- **Camera smoothing:** `x ← x + (target − x)(1 − e^(−dt/τ))`, with τ = 0.12 s. This is the exact solution of the first-order lag ODE `ẋ = (target − x)/τ`, so it does not depend on frame rate.
- **Camera orbit:** `pos = (r·cosφ·sinθ, h + r·sinφ, r·cosφ·cosθ)`, with pitch φ clamped to 15°–75°.
- **Screen-relative input:** the camera quadrant is `q = ⌊θ / 90°⌋`; screen right maps to `(cos qπ/2, −sin qπ/2)` and "away" maps to `(−sin qπ/2, −cos qπ/2)` in grid (x, y).
- **Screen shake:** offset `= A·(sin 1.3ωt, sin(1.7ωt + 1.1), sin(1.1ωt + 2.3))`, where A decays as `A ← A·e^(−λ·dt)` with λ = 7. The three incommensurate sine frequencies stand in for noise without repeating visibly.
- **GPU particles:** analytic solution of `v̇ = g − βv` with drag β = 1.6.
  - `v(t) = g/β + (v₀ − g/β)e^(−βt)`
  - `x(t) = x₀ + g·t/β + (v₀ − g/β)(1 − e^(−βt))/β`
  - The y position is clamped to the well floor.
  - Size scales as `90/(−z_view)` for perspective. The sprite falls off as a Gaussian `e^(−18d²)`.

## 3. Rendering pipeline (`presentation/post-pipeline.ts`, `game-renderer.ts`)

1. The cube environment map is baked from the backdrop shader only when the preset changes (`HongKongBackdrop.updateEnvironment`).
2. **Opaque pass:** the backdrop and well are rendered into a half-float target, `uSceneColor`, which glass and jelly refraction sample.
3. **Main pass:** the full scene is rendered in linear HDR.
4. **Bloom:** UnrealBloom, with luminance threshold `max(L − 0.82, 0)` and a mip-chain Gaussian blur `G(x) = e^(−x²/2σ²)`.
5. **OutputPass:** ACES filmic tone mapping (the Narkowicz/Hill fit), then sRGB encoding (≈ `c^(1/2.2)`), done once. Custom shaders therefore output linear colour and set no `lights`.
6. **FXAA:** luma-edge anti-aliasing.
7. **Grade:** vignette `1 − 0.35·2.2·|uv − ½|²` and hash film grain ±0.0175.

`?lowfx` keeps only steps 1–3 and 5.

## 4. Cube shader (`shaders/cube.glsl.ts`)

| Technique | Formula | Uniform / tuning |
|---|---|---|
| Rounded-box SDF normal | `q = max(|p| − (½ − r), 0)`, `n = normalize(sign(p)·q)`. On flat faces only one component of q is non-zero, so n equals the face normal; near edges the normal bends | `BEVEL` 0.08 |
| Schlick Fresnel | `F = F₀ + (1 − F₀)(1 − cosθ)⁵` | — |
| GGX distribution | `D = α²/(π((n·h)²(α² − 1) + 1)²)`, α = roughness² | — |
| Smith–Schlick G | `G = G₁(v)·G₁(l)`, `G₁ = n·x/((n·x)(1 − k) + k)`, k = (r + 1)²/8 | — |
| Cook–Torrance | `f_s = D·G·F / (4(n·v)(n·l))` | Light colour 2.6 × warm |
| Glass F₀ | `F₀ = ((n − 1)/(n + 1))² = 0.04` at IOR 1.5 | — |
| Snell refraction + dispersion | `refract(−v, n, 1/IOR)` per channel, with IOR (1.47, 1.50, 1.53); the refracted xy offsets the screen UV | Strength 0.06 (glass), 0.025 (jelly) |
| Beer–Lambert tint | `T = e^(−σd)`, σ = (1 − albedo)·2.2 + 0.05, d ≈ 0.6/max(n·v, 0.25) | — |
| Thin-film iridescence | Snell inside the film (n_f = 1.33); path difference `Δ = 2·n_f·d·cosθ_t`; intensity per wavelength ∝ `cos²(πΔ/λ)` with λ = 650/532/450 nm; thickness d = 380 ± 120 nm over time | — |
| Anisotropic GGX (metal) | `D = 1/(π·αx·αy·((t·h/αx)² + (b·h/αy)² + (n·h)²)²)`, with αx = 1.8α and αy = 0.45α for brushed metal | — |
| Triplanar noise roughness | `w = |n|⁴/Σ|n|⁴`, noise = Σ wᵢ·noise(projection i) | Roughness 0.22 + 0.18·noise |
| IBL | `textureLod(env, reflect(−v, n), roughness·log₂(256))` | `ENV_SIZE` 256 |
| Wrap lighting (jelly) | `(n·l + w)/(1 + w)`, w = 0.5 | — |
| Subsurface back-light | `(v · −(l + 0.3n))³ · e^(−d/ℓ)` | d = 0.6, ℓ = 0.45 |
| Fresnel rim (active piece) | `(1 − |n·v|)³ · 1.8` | `uRim` |
| Noise dissolve (layer clear) | `discard` if `noise(p·4) < t`; glowing band where `smoothstep(t, t + 0.08, n) − smoothstep(t + 0.08, t + 0.16, n)` | `clearAnimSeconds` 0.45 |
| Distance fog | `mix(col, fog, clamp(d/60)²·0.6)` | `uFogFar` |
| Vertex jelly wobble | `xz += sin(6y + 18t)·0.06·|s|` | Spring state `uSquash` |

## 5. Well shader (`shaders/well.glsl.ts`)

- **Back-face-only walls:** the near walls are culled, so they never cover the stack.
- **Anti-aliased grid:** `line = 1 − clamp(min(|fract(c − ½) − ½| / fwidth(c)) / w)`. Dividing by the screen-space derivative keeps lines about 1 px wide at any distance, with no shimmer.
- **Active-piece projection:** each floor or wall texel lights up if its cell matches the piece cell projected orthographically onto that plane, using (x, y), (y, z) or (x, z). This is the main depth cue.
- **Layer band:** edge glow `smoothstep(0.12, 0, |z − z_edge|)·(0.6 + 0.4 sin 6t)`.
- **Clear flash:** a bitmask `(mask >> z) & 1` marks the layers being cleared, with pulse `sin(πt)`.
- **Height fog:** `f = clamp(z/H)²·0.85`. The top of the well fades into the backdrop horizon colour, and the same colour is used as the cube fog, so there is no visible seam.

## 6. Ghost, particles and grade (`shaders/effects.glsl.ts`)

- **Ghost hologram:**
  - Alpha = `(0.12 + 0.55·F)(0.6 + 0.4·scan)·flicker`.
  - Fresnel term `F = (1 − |n·v|)²`.
  - Scanlines `scan = ½ + ½ sin(40y − 6t)`.
  - Additive blending, no depth write.
- **Particles:** see §2. Additive blending, no depth write.

## 7. Hong Kong backdrop (`shaders/hong-kong-backdrop.glsl.ts`)

The view direction is mapped to azimuth `u = atan2(z, x)/2π + ½` and elevation `e = asin(y)/(π/2)`. The dome is pinned to the far plane with `gl_Position.z = w`.

| Technique | Formula | Presets |
|---|---|---|
| Hashes | Dave Hoskins' `fract`-based hash11/21/31 | All |
| Value noise | `mix` of corner hashes with smoothstep weights `3f² − 2f³` | All |
| FBM | `Σ 0.5ⁱ·noise(2.03ⁱ·p)`, 5 octaves | Ridges, ripples, clouds |
| Sky gradient | `mix(horizon, zenith, √e)`. The square root approximates the longer optical path near the horizon (stronger Rayleigh `β ∝ λ⁻⁴` reddening) | All |
| Mie sun glow | Henyey–Greenstein `p(θ) = (1 − g²)/(4π(1 + g² − 2g·cosθ)^{3/2})`, g = 0.76 | Peak, Lion Rock |
| Skyline | 3 parallax layers, each with `columns = 70 + 55·layer`; height = `h²·amp` from hash(cell) | All |
| Windows | Grid `floor(local·5, e·(220 + 60·layer))`, lit when hash > 0.62 | Night presets bright, dawn dimmed |
| IFC tower | Height override near u = 0.62 | Victoria Harbour |
| Lion Rock silhouette | Ridge FBM plus two Gaussians `0.16·e^(−900(u − 0.27)²)` and `0.08·e^(−500(u − 0.305)²)` | Lion Rock |
| Neon signs | Box SDF `|max(|p| − b, 0)| + min(max(d), 0)`, glow `e^(−d/0.035)`, hash flicker at 12 Hz | Mong Kok |
| Symphony of Lights | 6 beams; distance to a rotated line, glow `e^(−900·dist)·e^(−4·along)` | Victoria Harbour |
| Planar water reflection | Mirrored elevation `e' = 2·e_h − e`, u perturbed by `(fbm − ½)·0.012`, ×0.45 | Harbour, Typhoon |
| Domain-warped clouds | `q = (fbm(p + t), fbm(p + c − t))`, `f = fbm(p + 4q)` | Typhoon |
| Lightning | Poisson trigger with probability `0.25·dt` per frame, decaying `e^(−6t)`. It also brightens the cube key light | Typhoon |
| Rain | Thresholded hash on `(260u, 14e + 9t)` | Mong Kok, Typhoon |
| Beer–Lambert mist | `mix(mist, col, e^(−0.35·d))`, `d = 1/(12|e − e_h| + 0.3)` | Lion Rock |
| Readability | Saturation reduced by 40% (`mix(c, luma, 0.4)`), brightness ×0.9 | All |

Presets are drawn at random per round (and on reset): Typhoon has a 5% chance, and the other four share the rest equally.

### Deviations from the plan

- **Environment pre-filtering:** a cube render target with hardware mips and `textureLod` replaces PMREM. It is the same idea (roughness → mip level) and works directly in a raw `ShaderMaterial`.
- **Bloom:** Three's `UnrealBloomPass` is used instead of a hand-written bloom; it is the same threshold-plus-mip-Gaussian technique.
- **Soft particles:** there is no depth fade against the scene; particles are clamped to the floor instead.
- **Backdrop blur:** there is no half-resolution blur. Readability comes from the reduced saturation and brightness.
