#!/usr/bin/env bash
# Expose the local API over a temporary public HTTPS URL so external sandboxes
# (M-Pesa Daraja, partners) can deliver webhooks. The tunnel is the ONLY thing
# that is publicly reachable; code, data and secrets stay on this machine.
set -euo pipefail

PORT="${API_PORT:-4000}"

if command -v cloudflared >/dev/null 2>&1; then
  echo "Starting cloudflared tunnel -> http://localhost:${PORT}"
  echo "Copy the https://*.trycloudflare.com URL into PUBLIC_BASE_URL in .env"
  exec cloudflared tunnel --url "http://localhost:${PORT}"
elif command -v ngrok >/dev/null 2>&1; then
  echo "Starting ngrok tunnel -> http://localhost:${PORT}"
  echo "Copy the https URL into PUBLIC_BASE_URL in .env"
  exec ngrok http "${PORT}"
else
  cat >&2 <<'EOF'
No tunnel binary found. Install one (local-only, no account needed for cloudflared quick tunnels):
  brew install cloudflared      # then: pnpm tunnel
  # or
  brew install ngrok
You only need a tunnel when exercising REAL sandboxes. Mock mode (ADAPTER_MODE=mock) needs no tunnel.
EOF
  exit 1
fi
