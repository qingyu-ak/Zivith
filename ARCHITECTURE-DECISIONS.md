# Architecture Decision Records

This file records Phase 0 infrastructure decisions. Product behavior remains governed
by the canonical specifications in `docs/`.

## ADR-001: pnpm workspace with Turborepo

- **Status:** Accepted
- **Date:** 2026-07-20

### Context

Zivith contains independently deployable applications and shared TypeScript packages.
The repository needs fast local orchestration, deterministic dependency ownership, and
task caching without coupling package implementations.

### Decision

Use pnpm 10 workspaces for package management and Turborepo 2 for task orchestration.
Applications live in `apps/*`; shared code lives in `packages/*`. Root commands delegate
to package scripts through Turborepo.

### Consequences

Packages retain control of their own build and test tools while sharing one dependency
graph. Every participating package must provide consistently named scripts. CI currently
installs without a frozen lockfile until the first complete workspace install generates
`pnpm-lock.yaml`; the workflow should switch to `--frozen-lockfile` once that file exists.

## ADR-002: Node.js 22 and strict TypeScript

- **Status:** Accepted
- **Date:** 2026-07-20

### Context

The web, API, and shared domain packages need one supported runtime and type baseline.

### Decision

Standardize on Node.js 22 and a strict shared TypeScript configuration. Use ESLint's flat
configuration with type-aware TypeScript rules and Prettier for formatting.

### Consequences

Developers and CI use the same runtime major. Package-specific configurations may extend
the root defaults but should not weaken domain safety rules without recording a decision.

## ADR-003: Local infrastructure through Docker Compose

- **Status:** Accepted
- **Date:** 2026-07-20

### Context

Development and tests require a relational database, queue/cache, and S3-compatible object
storage on Windows and Linux.

### Decision

Use PostgreSQL 16, Redis 7, and MinIO through Docker Compose. Named volumes preserve local
development data. Health checks gate setup completion, and a one-shot MinIO client creates
the private media bucket idempotently.

### Consequences

Local services closely match production capabilities without requiring native installs.
Production deployments may use managed equivalents, provided they preserve PostgreSQL,
Redis, and S3-compatible contracts.

## ADR-004: Environment-specific templates and external secrets

- **Status:** Accepted
- **Date:** 2026-07-20

### Context

Development, test, and production need different endpoints and credentials. Real secrets
must not enter source control.

### Decision

Commit example templates only. Ignore all populated `.env` variants. Development and test
values are explicitly disposable placeholders; production values reference an external
secret manager.

### Consequences

Deployments must inject secrets at runtime. Applications must fail fast when required
production values are unresolved and must never expose server-only values to the frontend.

## ADR-005: One portable CI quality gate

- **Status:** Accepted
- **Date:** 2026-07-20

### Context

Every pull request must prove formatting, lint, type safety, tests, and build compatibility
against the same backing services used locally.

### Decision

Use GitHub Actions on Ubuntu with Node.js 22 and pnpm. Run formatting, lint, type checking,
tests, and builds in sequence after starting disposable Compose services.

### Consequences

The single job provides simple, ordered diagnostics and avoids duplicated dependency
installation. It is slower than fully parallel jobs; tasks can be split after package
boundaries and cache behavior stabilize.
