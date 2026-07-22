# ADR-0005: Run one portable CI quality gate

- **Status:** Accepted
- **Date:** 2026-07-20
- **Deciders:** Phase 0 team
- **Class:** Standard
- **Reversibility:** Reversible

> Migrated from the root `ARCHITECTURE-DECISIONS.md` (formerly ADR-005) on 2026-07-22.
> This record predates the Architecture Constitution; the *Principles at Stake*
> analysis has not been retrofitted.

## Context

Every pull request must prove formatting, lint, type safety, tests, and build compatibility
against the same backing services used locally.

## Decision

Use GitHub Actions on Ubuntu with Node.js 22 and pnpm. Run formatting, lint, type checking,
tests, and builds in sequence after starting disposable Compose services.

## Consequences

The single job provides simple, ordered diagnostics and avoids duplicated dependency
installation. It is slower than fully parallel jobs; tasks can be split after package
boundaries and cache behavior stabilize.
