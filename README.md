# Zivith

Build cinematic AI videos from a single idea using autonomous AI agents.

Zivith is an AI-native film production studio. This repository is a pnpm/Turborepo
monorepo for the web application, API, domain model, database, and shared UI.

The canonical product and architecture specifications live in [`docs/`](docs/README.md).
Active engineering backlog: [`docs/Next-Tasks.md`](docs/Next-Tasks.md).

## Prerequisites

- Node.js 22
- Corepack
- Docker Engine with Docker Compose v2
- Git

Windows development is supported through PowerShell 7 or Windows PowerShell 5.1.
Linux and macOS development use a POSIX shell.

## Repository layout

```text
apps/
  web/                 Web frontend
  api/                 REST API and background workers
packages/
  domain/              Shared domain types and rules
  database/            Schema, migrations, and seed data
  ui/                  Shared UI components
scripts/               Cross-platform development setup
docs/                  Canonical design specifications
```

## First-time setup

The setup script creates a local `.env`, installs workspace dependencies, starts
PostgreSQL 16, Redis 7, and MinIO, and runs database migrations and seed data when
`packages/database` is present.

Linux/macOS:

```sh
sh ./scripts/setup.sh
```

Windows PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup.ps1
```

Review `.env` after setup and replace the placeholder JWT value with a random local
secret. Values in the example files are development-only placeholders.

## Development

```sh
pnpm dev
```

Default local services:

- Web: <http://localhost:3000>
- API: <http://localhost:4000/api/v1>
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO API: <http://localhost:9000>
- MinIO console: <http://localhost:9001>

Manage infrastructure directly with:

```sh
docker compose up -d --wait
docker compose down
docker compose down --volumes # also deletes local service data
```

## Workspace commands

```sh
pnpm dev           # Run development tasks
pnpm build         # Build all packages and applications
pnpm lint          # Run ESLint tasks
pnpm typecheck     # Run TypeScript checks
pnpm test          # Run tests
pnpm format        # Format supported files
pnpm format:check  # Check formatting without writing
pnpm db:migrate    # Apply database migrations
pnpm db:seed       # Seed local development data
```

Each workspace package should expose the relevant scripts consumed by Turborepo.
The database package must expose `db:migrate` and `db:seed`.

## Environment configuration

- `.env.example`: complete local Docker Compose template
- `.env.development.example`: application development template
- `.env.test.example`: isolated test template
- `.env.production.example`: deployment template with secret-manager references

Copy a template to an ignored environment file and never commit credentials. Provider
API keys and production secrets must be injected by the deployment platform.

## Continuous integration

GitHub Actions runs formatting, linting, type checking, tests, and builds on pull
requests and pushes to `main`. The workflow starts disposable PostgreSQL, Redis, and
MinIO services and removes their volumes after the run.

## Architecture decisions

Architecture decisions are recorded as ADRs in
[`docs/architecture/adr/`](docs/architecture/adr/README.md), governed by the
[Architecture Constitution](docs/architecture/architecture-principles.md) and the
[ADR Guide](docs/architecture/adr-guide.md).
