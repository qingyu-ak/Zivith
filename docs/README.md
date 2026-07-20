# Zivith

> AI-Native Film Production Studio
>
> Version: 0.1.0-pre
>
> Status: Design Phase

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
| [Shot Specification](Shot-Specification.md) | Complete Shot schema, lifecycle, prompt construction |
| [Asset Model](Asset-Model.md) | Asset taxonomy (Characters, Locations, Styles, etc.) |
| [AI Agent Collaboration](AI-Agent-Collaboration.md) | Agent architecture, required review gates, and Visual Prep workflow |
| [Technical Architecture](Technical-Architecture.md) | System design, adapters, APIs, queues, BYOK, and data storage |
| [Implementation Plan](Implementation-Plan.md) | Phased roadmap, Phase 2.5 provider validation, and productionization |
| [Code Agent Design Guide](Code-Agent-Design-Guide.md) | Implementation conventions for AI code agents |

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

## Tech Stack (proposed, not finalized)

The architecture is designed to be technology-agnostic. The following stack is proposed for initial implementation:

| Layer | Proposed Technology |
|-------|-------------------|
| Frontend | React / Next.js (SPA) |
| Backend API | Node.js or Python (FastAPI) |
| Database | PostgreSQL |
| Object Storage | S3-compatible (Cloudflare R2 / MinIO) |
| Job Queue | Redis + BullMQ or similar |
| AI Integration | LLM, Image, and Video adapters |

---

## Project Status

- **Phase**: Design & Planning
- **Repository**: To be initialized
- **First provider integration**: DeepSeek + Tongyi Wanxiang + Kling
- **Target MVP**: 19-26 weeks from Phase 0 start

---

## Getting Started (for Developers)

1. Read [Design Philosophy](Design-Philosophy.md) for the product vision
2. Read [Core Domain Model](Core-Domain-Model.md) for the data model
3. Read [Technical Architecture](Technical-Architecture.md) for system design
4. Read [Implementation Plan](Implementation-Plan.md) for the roadmap
5. Read [Code Agent Design Guide](Code-Agent-Design-Guide.md) before writing code

---

## License

To be determined.
