# ADR-0004: Commit environment templates only; keep secrets external

- **Status:** Accepted
- **Date:** 2026-07-20
- **Deciders:** Phase 0 team
- **Class:** Standard
- **Reversibility:** Reversible

> Migrated from the root `ARCHITECTURE-DECISIONS.md` (formerly ADR-004) on 2026-07-22.
> This record predates the Architecture Constitution; the *Principles at Stake*
> analysis has not been retrofitted.

## Context

Development, test, and production need different endpoints and credentials. Real secrets
must not enter source control.

## Decision

Commit example templates only. Ignore all populated `.env` variants. Development and test
values are explicitly disposable placeholders; production values reference an external
secret manager.

## Consequences

Deployments must inject secrets at runtime. Applications must fail fast when required
production values are unresolved and must never expose server-only values to the frontend.
