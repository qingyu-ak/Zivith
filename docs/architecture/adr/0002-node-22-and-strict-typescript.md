# ADR-0002: Standardize on Node.js 22 and strict shared TypeScript

- **Status:** Accepted
- **Date:** 2026-07-20
- **Deciders:** Phase 0 team
- **Class:** Standard
- **Reversibility:** Costly

> Migrated from the root `ARCHITECTURE-DECISIONS.md` (formerly ADR-002) on 2026-07-22.
> This record predates the Architecture Constitution; the *Principles at Stake*
> analysis has not been retrofitted.

## Context

The web, API, and shared domain packages need one supported runtime and type baseline.

## Decision

Standardize on Node.js 22 and a strict shared TypeScript configuration. Use ESLint's flat
configuration with type-aware TypeScript rules and Prettier for formatting.

## Consequences

Developers and CI use the same runtime major. Package-specific configurations may extend
the root defaults but should not weaken domain safety rules without recording a decision.
