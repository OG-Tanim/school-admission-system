# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . ./
RUN npm run build

# ---------- runtime ----------
# A tiny Node server serves the bundle and /config.js, which it reads from the
# mounted environment file at startup. The UI keeps its override in the browser.
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=80 \
    STATIC_ROOT=/app/dist \
    CONFIG_FILE=/config/api-url.env

COPY --from=build /app/dist ./dist
COPY server.mjs ./

EXPOSE 80
CMD ["node", "server.mjs"]
