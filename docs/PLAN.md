# 3D Tetris – Approved-Pending Plan (resume point)

Status: IMPLEMENTED (D1–D9 approved with defaults, option 1). Went straight to Vite + TS (Phase B). See PROGRAM_SPEC, FUNCTION_SPEC, DEPLOYMENT, TESTING, PHYSICS_AND_SHADERS (incl. deviations).
Sources: `3d_tetris_game_design_document_traditional_chinese.md`, `~/.claude/CLAUDE.md` (§4 docs, §5 output, §7 Clean Code, §9 3D Game Vibe Coding).

## Open decisions (awaiting approval)
- D1 Stack: Phase A single `index.html` + Three.js 0.170.0 pinned (esm.sh); Phase B Vite + TS strict + Vitest + ESLint/Prettier, exact-pinned deps.
- D2 Pieces: 8 free tetracubes – I, O, L, T, S, Branch, Right Screw, Left Screw (J≡L, Z≡S in 3D).
- D3 Axes: logic grid z = height → Three.js world Y.
- D4 Keys: ←/→ X, ↑/↓ Y, Shift soft drop, Space hard drop, A/S/Z rotate about X/Y/Z, Shift+A/S/Z reverse, Q/E camera snap, R reset, Esc pause.
- D5 Camera: custom orbit (drag, pitch 15°–75°) + 4 snap angles; arrow input remapped to camera quadrant. No OrbitControls.
- D6 No physics library; grid logic is discrete, cosmetic motion uses semi-implicit Euler / springs in fixedUpdate (60 Hz).
- D7 HK background source: A procedural GLSL (recommended) / B local licensed photos in `assets/hk/` / C hybrid.
- D8 Score DB: MongoDB 7 (recommended, Docker for local) vs alternatives (DynamoDB, Firestore).
- D9 Player identity: v1 nickname only, no login (scores can be spoofed) vs v2 auth (OAuth / magic link). Recommend v1 + anti-cheat checks, flag clearly in UI as "casual ranking".

## Architecture
Domain (pure: Grid, Tetracube, Rotation, Collision, LayerClear, Scoring, Randomizer, GameState) → Application (GameSession) → Presentation (Three.js: Scene, CameraRig, renderers, shaders) → Infrastructure (Input, WebAudio, localStorage).
State machine: Menu → Spawning → Falling → Locking → Clearing → GameOver / Paused.

## Slices (one per pass)
- S1 Well 5×5×15, grid, lights, fog, legend, CameraRig, InstancedMesh + PMREM + opaque render target backbone
- S2 Falling I piece, gravity timer, move, collision, lock (0.5 s, 15 resets), DAS 0.17 / ARR 0.05
- S3 Rotation: integer 90° matrices, kick table
- S4 8 pieces, bag randomizer, layer clear + compaction
- S5 Ghost, layer highlight, next preview, hold
- S6 Top-out, R reset < 1 s, pause
- 30-second play test
- S7 Difficulty (Easy 3×3 / Normal 4×4 / Hard 5×5, speed, special-shape weight); Marathon, Sprint 20, Puzzle (5 presets)
- S8a Grid/well shader: fwidth AA lines, active-piece wall/floor shadow projection, height fog
- S8b Cube body: SDF rounded bevel, edge highlight, Fresnel rim
- S8c Glass: screen-space refraction, chromatic dispersion, Beer–Lambert, thin-film iridescence
- S8d Metal: anisotropic GGX, triplanar noise roughness, IBL by roughness
- S8e Jelly: vertex wobble from sim spring uniforms, wrap-light SSS, thickness
- S8f Random Hong Kong backdrop (per run/reset, seeded): Victoria Harbour night, Mong Kok neon rain, The Peak dusk, Lion Rock dawn, Typhoon signal (~5%). Hash/FBM skyline, window grids, water reflection, neon SDF glow, Rayleigh/Mie sky, Henyey–Greenstein, domain-warped clouds. Dimmed −40% saturation, half-res blur, fog = horizon color, baked to cube RT → PMREM for reflections.
- S9 Juice: hologram ghost, layer pulse, noise-dissolve clear, GPU instanced particles (soft), bloom/ACES/FXAA/vignette/grain, camera shake, WebAudio (after first click). `?lowfx` disables heavy FX.
- S10 Phase B port + Vitest domain tests
- S11 Docs

## Performance
60 fps with full 5×5×15 well (375 instances) on integrated GPU; single opaque RT reused; no discard on floor/walls.

## Deliverables after implementation (docs/)
PROGRAM_SPEC, FUNCTION_SPEC, DEPLOYMENT, DIAGRAMS (Mermaid sequence/class/state), TESTING (Vitest + test matrix), PHYSICS_AND_SHADERS:
- Math/logic: grid index, rotation matrices & pivot, kicks, gravity curve (0.8−0.007(n−1))^(n−1), layer clear, scoring, ghost drop.
- Physics: semi-implicit Euler, damped spring & ζ, exponential smoothing, ballistic particles + drag + restitution, decaying shake.
- Shaders: Cook-Torrance/GGX/Smith/Schlick, Snell, IOR→F₀, Beer–Lambert, thin-film interference, anisotropic GGX, triplanar, wrap lighting, SDF box, fwidth AA, Fresnel rim, fog, ACES + sRGB, bloom Gaussian, noise dissolve, soft particles, hash/FBM/domain warp, Rayleigh/Mie, Henyey–Greenstein, planar reflection.
Each with formula, short derivation, code location, uniforms and tuning range.

## Score Persistence & Ranking (added)
Every finished round (game over, Sprint complete, Puzzle solved/failed, or quit after ≥ 1 piece) is saved; players browse rankings.

Impact on stack: needs Phase B (Vite + TS) on the frontend plus a backend → this slice comes after S10. Game stays playable offline; unsent results queue in localStorage and retry.

### Backend (CLAUDE.md §2A)
Node 20 + Fastify + Zod + official MongoDB driver, TS strict, layered:
`routes/` (validation, status codes) → `services/` (ranking, anti-cheat) → `repositories/` (Mongo) → `dto/` (contracts shared with frontend via `shared/contracts.ts`). Central error middleware returning `ApiErrorResponse {code, message, data, timestamp}`, pino structured logs with traceId, env validated by Zod (`MONGO_URI`, `PORT`, `CORS_ORIGIN`).

### Contract-first API
- `POST /api/v1/rounds` – body `SubmitRoundRequest {playerName, mode, difficulty, score, layersCleared, piecesPlaced, durationMs, seed, clientVersion}` → `201 RoundResponse`
- `GET /api/v1/rankings?mode=&difficulty=&period=all|week|day&limit=20&cursor=` → `RankingPage {entries[{rank, playerName, score, layersCleared, durationMs, playedAt}], nextCursor}` (Sprint ranks by durationMs asc, others by score desc)
- `GET /api/v1/players/:playerName/rounds?limit=&cursor=` → player history + personal best

### Data model (collection `rounds`)
`{_id, playerName, playerNameLower, mode, difficulty, score, layersCleared, piecesPlaced, durationMs, seed, clientVersion, playedAt, flagged}`
Indexes: `{mode:1, difficulty:1, score:-1, playedAt:-1}`, `{mode:1, difficulty:1, durationMs:1}`, `{playerNameLower:1, playedAt:-1}`. Cursor pagination (no skip scans).

### Security / anti-cheat
- No auth in v1 → anyone can post a fake score. Mitigations: Zod bounds, plausibility check (max score per piece/second, layersCleared ≤ piecesPlaced·4 / area), rate limit (@fastify/rate-limit), helmet, CORS allow-list, name profanity/length filter, `flagged` rounds hidden from rankings.
- Optional v2: submit input log + seed, server replays deterministic domain logic (shared pure TS package) to verify score.

### Frontend
`infrastructure/score-api.ts` (only place doing fetch), offline queue, Ranking screen (tabs by mode/difficulty/period, personal best highlight, RWD minimalist style), name prompt stored in localStorage.

### Tests & docs additions
Vitest + Fastify inject for routes, mongodb-memory-server for repositories, ranking/plausibility unit tests; test matrix rows for submit/ranking/validation/rate limit. Mermaid sequence: Game → ScoreApi → Route → Service → Repository → MongoDB. Deployment doc: Node 20, MongoDB 7, docker-compose, connection pool (`maxPoolSize` 10), env list.
