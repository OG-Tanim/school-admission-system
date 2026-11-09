#!/bin/sh
# Runs from the official nginx entrypoint before nginx starts.
# Converts the API_URL environment variable into a runtime config file, so the
# same image can point at any backend without being rebuilt.
set -eu

api_url="${API_URL:-http://localhost:8080}"

# Drop trailing slashes so request paths never end up with "//".
while [ "${api_url%/}" != "$api_url" ]; do
  api_url="${api_url%/}"
done

case "$api_url" in
  http://*|https://*) ;;
  *)
    echo "API_URL must start with http:// or https:// (got '$api_url')" >&2
    exit 1
    ;;
esac

case "$api_url" in
  *\"*|*\\*)
    echo "API_URL must not contain quotes or backslashes (got '$api_url')" >&2
    exit 1
    ;;
esac

printf 'window.__APP_CONFIG__ = { apiUrl: "%s" };\n' "$api_url" \
  > /usr/share/nginx/html/config.js

echo "Runtime API URL: $api_url"
