# Zivith

> AI-Native Film Production Studio
>
> Version: 0.1.0-pre
>
> Status: Implementation — Phase 2 (Mock pipeline) in progress
>
> Last Progress Sync: 2026-07-21

---

## What is Zivith?

Zivith is an AI-native creative operating system for filmmaking. It models the complete film production workflow — Story, Scene, Visual Prep, Shot, Prompt, Video — enabling creators to work with AI as a creative partner rather than a black-box generator.

Most AI video tools go directly from prompt to video. When the result is unsatisfactory, you regenerate everything from scratch.

Zivith takes a different approach: every creative artifact is persistent, editable, and reusable. Characters, locations, and knowledge belong to your Project, not individual videos. Shots stay editable. Videos can always be regenerated from their source.

---

## Creative Hierarchy

```
Project  →  The creative universe (IP, world, assets)
  └─ Story  →  A complete narrative (movie, episode, chapter)
      └─ Scene  →  A continuous environment (location, time, mood)
          │   └─ Visual Prep  →  Approved Character/Location visual requirements and Scene variants
          └─ Shot  →  The smallest editable unit (camera, action, dialogue)
              └─ Prompt  →  Approved video-generation instruction
                  └─ Video  →  Generated output (disposable, reproducible)
```

The required workflow is: **Story → Scene → Scene review → Visual Prep → visual-assets review → Shot → Prompt → prompt review → Video → review**. Visual-assets approval is required before Shot or Video work can proceed, and prompt review is mandatory.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Design Philosophy](Design-Philosophy.md) | Product vision, principles, and creative hierarchy |
| [Core Domain Model](Core-Domain-Model.md) | Domain objects, ownership rules, inheritance model |
| [Domain Model Walkthrough](Domain-Model-Walkthrough.md) | End-to-end domain walkthrough using「阁楼上的秘密」 |
| [Shot Specification](Shot-Specification.md) | Complete Shot schema, lifecycle, prompt construction |
| [Asset Model](Asset-Model.md) | Asset taxonomy (Characters, Locations, Styles, etc.) |
| [AI Agent Collaboration](AI-Agent-Collaboration.md) | Agent architecture, required review gates, and Visual Prep workflow |
| [Technical Architecture](Technical-Architecture.md) | System design, adapters, APIs, queues, BYOK, and data storage |
| [Implementation Plan](Implementation-Plan.md) | Phased roadmap with live progress checkboxes |
| [Next Tasks](Next-Tasks.md) | Current engineering backlog (stabilize → finish Phase 2 → 2.5) |
| [Director Copilot RFC (thin)](Director-Copilot-RFC.md) | Project sidebar co-pilot scope lock (Phase 3+; not a chatbot) |
| [Code Agent Design Guide](Code-Agent-Design-Guide.md) | Implementation conventions for AI code agents |

### Historical

| Document | Description |
|----------|-------------|
| [Product Design RFC (archived)](archive/Product-Design-RFC.md) | Early draft superseded by Design Philosophy |

---

## Design Principles

- **Story First** — Every creation begins with narrative, not technical parameters
- **Shot is the Core** — Shot is the source of truth; Video is an output
- **Assets are Persistent** — Characters, locations, and knowledge belong to the Project
- **Outputs are Disposable** — Videos can always be regenerated
- **AI Generates, Human Directs** — AI assists; humans make creative decisions
- **Everything is Editable** — No generated output becomes a dead end
- **Transparency over Magic** — Creators understand what and why AI generated

---

## Tech Stack (current)

| Layer | Technology |
|-------|------------|
| Frontend | Next.js (App Router), Chinese UI |
| Backend API | Node.js 22 + Fastify |
| Domain / DB | `@zivith/domain` + Prisma / PostgreSQL 16 |
| Object Storage | S3-compatible (MinIO locally) |
| Job Queue | BullMQ adapter present; not yet wired into the main generation path |
| AI Integration | Mock LLM + Mock video adapters (Phase 2); real providers in Phase 2.5 |

Infrastructure decisions: see root [`ARCHITECTURE-DECISIONS.md`](../ARCHITECTURE-DECISIONS.md).

---

## Project Status (2026-07-21)

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 Foundation | ~95% done | BullMQ wired when REDIS_URL set; no staging deploy |
| Phase 1 Core Domain | ~90% done | Inheritance is read-time resolve; Character/Location only |
| Phase 2 AI Agent + Mock Gen | ~85% done | Queue + SSE + recover landed; mock providers remain |
| Phase 2.5 First Providers | Not started | DeepSeek + Tongyi Wanxiang + Kling |
| Phase 3–5 | Not started | — |

**Repository:** Active monorepo (`apps/web`, `apps/api`, `packages/*`).  
**Strategy:** B-Line — Agent pipeline first, video generation mocked.  
**Near-term focus:** Track B closed; next is Phase 2.5 providers. See [Next Tasks](Next-Tasks.md).

---

## Getting Started (for Developers)

1. Follow the root [README](../README.md) for `setup` / `pnpm dev`
2. Read [Design Philosophy](Design-Philosophy.md) for the product vision
3. Read [Core Domain Model](Core-Domain-Model.md) for the data model
4. Read [Technical Architecture](Technical-Architecture.md) for system design
5. Read [Implementation Plan](Implementation-Plan.md) and [Next Tasks](Next-Tasks.md)
6. Read [Code Agent Design Guide](Code-Agent-Design-Guide.md) before writing code

---

## License

To be determined.
