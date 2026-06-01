#!/usr/bin/env bash
# Manage local-only Postgres + Redis. Prefers Docker if present, otherwise
# falls back to Homebrew-managed services. Binds to localhost only; nothing
# is deployed and nothing is pushed anywhere.
set -euo pipefail

ACTION="${1:-up}"
PG_USER="bandari"
PG_PASS="bandari"
PG_DB="bandari"

have() { command -v "$1" >/dev/null 2>&1; }

use_docker() { have docker && docker compose version >/dev/null 2>&1; }

ensure_pg_role_db() {
  local pgbin="$1"
  echo "  -> ensuring role/db '${PG_DB}' exist"
  "${pgbin}/psql" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" 2>/dev/null | grep -q 1 \
    || "${pgbin}/psql" -d postgres -c "CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASS}' CREATEDB" >/dev/null
  "${pgbin}/psql" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" 2>/dev/null | grep -q 1 \
    || "${pgbin}/createdb" -O "${PG_USER}" "${PG_DB}" >/dev/null
}

brew_pgbin() { echo "$(brew --prefix postgresql@16)/bin"; }

case "${ACTION}" in
  up)
    if use_docker; then
      echo "Docker detected -> starting Postgres + Redis via docker compose"
      docker compose up -d
    elif have brew; then
      echo "No Docker -> starting Postgres + Redis via Homebrew services"
      brew services start postgresql@16 >/dev/null
      brew services start redis >/dev/null
      pgbin="$(brew_pgbin)"
      echo "  -> waiting for Postgres..."
      for i in $(seq 1 30); do
        if "${pgbin}/pg_isready" -q 2>/dev/null; then break; fi
        sleep 1
      done
      ensure_pg_role_db "${pgbin}"
    else
      echo "ERROR: neither Docker nor Homebrew found. Install one to run Postgres + Redis locally." >&2
      exit 1
    fi
    echo "Services up. Postgres :5432  Redis :6379"
    ;;
  down)
    if use_docker; then
      docker compose down
    elif have brew; then
      brew services stop postgresql@16 >/dev/null || true
      brew services stop redis >/dev/null || true
    fi
    echo "Services stopped."
    ;;
  status)
    if use_docker; then
      docker compose ps
    elif have brew; then
      brew services list | grep -E "postgresql@16|redis" || true
    fi
    ;;
  *)
    echo "usage: services.sh [up|down|status]" >&2
    exit 1
    ;;
esac
