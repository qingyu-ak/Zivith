# ADR Index

> Architecture Decision Records for Zivith
>
> Process: see [adr-guide.md](../adr-guide.md). Numbering is sequential and permanent.

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](0001-pnpm-workspace-with-turborepo.md) | Use a pnpm workspace orchestrated by Turborepo | Accepted | 2026-07-20 |
| [0002](0002-node-22-and-strict-typescript.md) | Standardize on Node.js 22 and strict shared TypeScript | Accepted | 2026-07-20 |
| [0003](0003-local-infrastructure-docker-compose.md) | Provide local infrastructure through Docker Compose | Accepted | 2026-07-20 |
| [0004](0004-environment-templates-and-external-secrets.md) | Commit environment templates only; keep secrets external | Accepted | 2026-07-20 |
| [0005](0005-single-portable-ci-quality-gate.md) | Run one portable CI quality gate | Accepted | 2026-07-20 |
| [0006](0006-story-segments-are-ordered-scene-groupings.md) | Story segments are ordered Scene groupings inside a Story | Accepted | 2026-07-23 |
| [0007](0007-preserve-current-state-with-immutable-creative-history.md) | Preserve current domain state alongside immutable creative history | Accepted | 2026-07-29 |

ADR-0001 through 0005 were migrated from the root `ARCHITECTURE-DECISIONS.md` and predate
the [Architecture Constitution](../architecture-principles.md); new ADRs must follow the
full template in the guide.
