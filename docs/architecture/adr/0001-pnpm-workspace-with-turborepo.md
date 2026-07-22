# ADR-0001: Use a pnpm workspace orchestrated by Turborepo

- **Status:** Accepted
- **Date:** 2026-07-20
- **Deciders:** Phase 0 team
- **Class:** Standard
- **Reversibility:** Costly

> Migrated from the root `ARCHITECTURE-DECISIONS.md` (formerly ADR-001) on 2026-07-22.
> This record predates the Architecture Constitution; the *Principles at Stake*
> analysis has not been retrofitted.

## Context

Zivith contains independently deployable applications and shared TypeScript packages.
The repository needs fast local orchestration, deterministic dependency ownership, and
task caching without coupling package implementations.

## Decision

Use pnpm 10 workspaces for package management and Turborepo 2 for task orchestration.
Applications live in `apps/*`; shared code lives in `packages/*`. Root commands delegate
to package scripts through Turborepo.

## Consequences

Packages retain control of their own build and test tools while sharing one dependency
graph. Every participating package must provide consistently named scripts. CI currently
installs without a frozen lockfile until the first complete workspace install generates
`pnpm-lock.yaml`; the workflow should switch to `--frozen-lockfile` once that file exists.
