# Zivith

> AI-Native Film Production Studio
>
> Version: 0.1.0-pre
>
> Status: Implementation — Phase 2 closed for Track A–D core; Phase 2.5 providers in use
>
> Last Progress Sync: 2026-07-22

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
| [Architecture Principles](architecture/architecture-principles.md) | Long-term architectural constitution guiding all future ADRs and RFCs |
| [ADR Guide](architecture/adr-guide.md) | When and how to record architecture decisions ([ADR index](architecture/adr/README.md)) |
| [RFC Guide](architecture/rfc-guide.md) | Proposal, review, risk, migration, and acceptance process for significant changes |
| [Technical Architecture](Technical-Architecture.md) | System design, adapters, APIs, queues, BYOK, and data storage |
| [Implementation Plan](Implementation-Plan.md) | Phased roadmap with live progress checkboxes |
| [Next Tasks](Next-Tasks.md) | Current engineering backlog (active: Track F = V0.4 plan) |
| [V0.4 Modification Plan](V0.4-Modification-Plan.md) | **Active implementation source** — workstreams W1–W7 from the waoowaoo review + ADR-0006 |
| [Director Copilot RFC (thin)](architecture/rfc/Director-Copilot-RFC.md) | Project sidebar co-pilot scope lock (Phase 3+; not a chatbot) |
| [Looser Creative Flow RFC (thin)](architecture/rfc/Looser-Creative-Flow-RFC.md) | Partial recompute / asset-first visuals / story segmentation ramp |
| [Architecture Review: waoowaoo](architecture/review/Zivith-Architecture-Review-Based-on-waoowaoo.md) | Peer open-source project review; A1–A7 adoption list feeding V0.4 planning |
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
| Job Queue | BullMQ when `REDIS_URL` is set; in-process memory queue fallback otherwise |
| AI Integration | DeepSeek (LLM) + SiliconFlow (image/video/audio) with Mock fallback; multi-vendor selection |

Infrastructure decisions: see the [ADR index](architecture/adr/README.md).

---

## Project Status (2026-07-22)

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 Foundation | ~95% done | BullMQ wired when REDIS_URL set; no staging deploy |
| Phase 1 Core Domain | ~90% done | Inheritance is read-time resolve; Character/Location only |
| Phase 2 AI Agent + Mock Gen | ~95% done | A1 E2E gates pass; queue + SSE + recover landed |
| Phase 2.5 First Providers | ~80% done | DeepSeek + SiliconFlow; BYOK/usage later (C7/C8) |
| Phase 3–5 | Not started | — |

**Repository:** Active monorepo (`apps/web`, `apps/api`, `packages/*`).  
**Strategy:** B-Line — Agent pipeline first, video generation mocked.  
**Near-term focus:** V0.4 Modification Plan (Track F): W2 + W1 + W3 **done** → next **W4** scoped recompute → W5/W6 → W7 usage records. See [V0.4 Modification Plan](V0.4-Modification-Plan.md) and [Next Tasks](Next-Tasks.md).

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
