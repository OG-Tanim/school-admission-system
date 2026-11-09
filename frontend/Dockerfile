# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . ./
RUN npm run build

# ---------- runtime ----------
FROM nginx:alpine AS runtime

# nginx reads these before starting; the script writes /config.js from API_URL.
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

COPY --from=build /app/dist /usr/share/nginx/html

# Keep the static files readable by the unprivileged nginx worker.
RUN chmod -R a+rX /usr/share/nginx/html /etc/nginx/conf.d

EXPOSE 80
