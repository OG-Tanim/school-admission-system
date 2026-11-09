# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . ./
RUN npm run build

# ---------- runtime ----------
# A tiny Node server serves the bundle and owns /config.js, because the UI
# writes the backend URL back into the mounted environment file.
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=80 \
    STATIC_ROOT=/app/dist \
    CONFIG_FILE=/config/.env

COPY --from=build /app/dist ./dist
COPY server.mjs ./

EXPOSE 80
CMD ["node", "server.mjs"]
