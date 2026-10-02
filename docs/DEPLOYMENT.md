# Infrastructure & Deployment

## Runtime
- Node.js ≥ 20 (verified on 26.7), npm.
- MongoDB 7 (`docker compose up -d mongo`).
- Browser with WebGL2.

## Local run
```bash
npm install
docker compose up -d mongo
cp .env.example .env          # optional; defaults match
npm run dev:server            # API on :3000
npm run dev                   # game on :5173, /api proxied to :3000
```
Production: `npm run build` → static `dist/` (any static host/CDN) + `npm run start:server` behind a reverse proxy serving `/api`.

## Environment variables (validated by Zod at boot)

| Name | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | API port |
| `MONGO_URI` | `mongodb://localhost:27017` | Connection string (put credentials here, never in code) |
| `MONGO_DB` | `tetracube` | Database name |
| `MONGO_MAX_POOL_SIZE` | 10 | Driver connection pool size |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allow-list |
| `RATE_LIMIT_PER_MINUTE` | 30 | Round submissions per IP per minute |

Indexes are created on start (`ensureIndexes`). Graceful shutdown on SIGINT/SIGTERM closes Fastify then the Mongo pool.

## Topology
```mermaid
flowchart LR
  B[Browser: Vite build, Three.js] -- static --> S[Static host / CDN]
  B -- /api/v1 JSON --> P[Reverse proxy / TLS]
  P --> A[Fastify API · helmet · CORS · rate limit]
  A -- pool 10 --> M[(MongoDB 7 · rounds)]
```

## End-to-end sequence
```mermaid
sequenceDiagram
  participant G as GameSession
  participant M as main.ts
  participant C as ScoreApi
  participant R as RoundRoutes
  participant S as RoundService
  participant D as MongoRoundRepository
  G->>M: event over(result)
  M->>C: submitRound(request)
  C->>C: flushPending()
  C->>R: POST /api/v1/rounds
  R->>R: Zod validate
  R->>S: submitRound(dto)
  S->>S: plausibility checks
  S->>D: insert(record)
  D-->>S: RoundRecord
  S-->>R: RoundResponse
  R-->>C: 201
  C-->>M: saved / queued offline
```
