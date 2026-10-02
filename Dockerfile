# syntax=docker/dockerfile:1.7

# ---- build: typecheck, test, bundle client + server once ----
FROM node:22.12.0-alpine3.21 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run lint && npm run test && npm run build

# ---- api: production deps only, non-root ----
FROM node:22.12.0-alpine3.21 AS api
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health || exit 1
CMD ["node", "--enable-source-maps", "dist-server/main.js"]

# ---- web: Caddy serves the static game over HTTPS and proxies /api ----
FROM caddy:2.8.4-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80 443
