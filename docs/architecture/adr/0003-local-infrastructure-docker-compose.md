# ADR-0003: Provide local infrastructure through Docker Compose

- **Status:** Accepted
- **Date:** 2026-07-20
- **Deciders:** Phase 0 team
- **Class:** Standard
- **Reversibility:** Reversible

> Migrated from the root `ARCHITECTURE-DECISIONS.md` (formerly ADR-003) on 2026-07-22.
> This record predates the Architecture Constitution; the *Principles at Stake*
> analysis has not been retrofitted.

## Context

Development and tests require a relational database, queue/cache, and S3-compatible object
storage on Windows and Linux.

## Decision

Use PostgreSQL 16, Redis 7, and MinIO through Docker Compose. Named volumes preserve local
development data. Health checks gate setup completion, and a one-shot MinIO client creates
the private media bucket idempotently.

## Consequences

Local services closely match production capabilities without requiring native installs.
Production deployments may use managed equivalents, provided they preserve PostgreSQL,
Redis, and S3-compatible contracts.
