#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_command node
require_command corepack
require_command docker

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -ne 22 ]; then
  echo "Node.js 22 is required; found $(node --version)." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required (docker compose)." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Replace the local JWT secret before sharing the environment."
fi

corepack enable
corepack install
pnpm install

docker compose up -d --wait postgres redis minio
docker compose run --rm minio-init

if [ -f packages/database/package.json ]; then
  pnpm db:migrate
  pnpm db:seed
else
  echo "Skipping migrations and seed: packages/database has not been created yet."
fi

echo "Zivith development infrastructure is ready."
echo "Run 'pnpm dev' to start workspace applications."
