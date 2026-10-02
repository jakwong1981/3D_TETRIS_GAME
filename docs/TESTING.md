# Testing

Run: `npm run test` (Vitest, 38 tests). `npm run lint`, `npm run build` (includes `tsc --noEmit`).

## Unit suites (AAA, no network, no DB)

| File | Covers |
|---|---|
| `tests/domain/rotation-and-grid.test.ts` | Integer rotations (4 turns = identity, inverse), layer detection + compaction, well bounds, I-spawn in 3×3, drop distance, wall collision, wall kicks |
| `tests/domain/scoring-and-randomizer.test.ts` | Score table, combo, >4 layers, speed curve monotonic, level cap, seeded determinism, bag completeness, fixed puzzle sequence |
| `tests/application/game-session.test.ts` | Puzzle solve end-to-end, every preset solvable, marathon top-out, pause freezes time, one hold per piece |
| `tests/server/round-service.test.ts` | Plausibility rules, name lower-casing + server timestamp, 422 domain error, score ranking + keyset paging, sprint by time (completed only), daily period filter, history + personal best |
| `tests/server/routes.test.ts` | Fastify `inject`: 201, 400 ApiErrorResponse, 422, 429 rate limit, ranking query validation, player history |

The repository is replaced by `InMemoryRoundRepository` (same ordering semantics). The Mongo adapter itself is not covered by automated tests; verify with `docker compose up -d mongo` + manual matrix rows F-01…F-05.

## Functional / integration matrix

| ID | Scenario | Preconditions | Input | Expected | Pass criteria |
|---|---|---|---|---|---|
| F-01 | Save round | API + Mongo up | `POST /rounds` valid body | 201 `RoundResponse` | Row in `rounds`, `flagged=false` |
| F-02 | Invalid name | — | `playerName: "<x>"` | 400 `VALIDATION_ERROR` | `data[].path = playerName` |
| F-03 | Fabricated score | — | `score: 9999999, piecesPlaced: 30` | 422 `IMPLAUSIBLE_ROUND` | Nothing inserted |
| F-04 | Rate limit | 30 submits in 1 min | 31st POST | 429 `RATE_LIMITED` | Header `retry-after` |
| F-05 | Ranking paging | 25 marathon/normal rounds | `GET /rankings?…&limit=20` then cursor | 20 + 5 entries | Ranks 1–25 contiguous, no duplicates |
| F-06 | Sprint ranking | Completed & incomplete sprints | `GET /rankings?mode=sprint…` | Fastest first | Incomplete runs absent |
| F-07 | Offline queue | API stopped | Finish a round | "queued" message | Round in `localStorage`, uploaded after API restarts and next submit/reload |
| G-01 | Render | Chrome, WebGL2 | Open page | Menu + legend, no console errors | Verified headless (Chrome, Metal) at 60 fps |
| G-02 | Play | Normal | Arrows, X, Space | Piece moves/rotates/drops, ghost + wall projections | Verified headless screenshot |
| G-03 | Reset | Any round | R | New round < 1 s, new backdrop | No page reload |
| G-04 | Low FX | — | `?lowfx` | No bloom/FXAA/grain, correct colours | Manual |
| G-05 | Camera | — | Drag, Q/E | Pitch stays 15–75°, arrows remap per quadrant | Manual |
