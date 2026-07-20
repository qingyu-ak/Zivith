# Implementation Plan

> Zivith 实施计划
>
> Version: 2.0
>
> Status: Draft
>
> Strategy: B-Line — AI Agent Pipeline First, Video Gen Mocked
>
> Related: Technical-Architecture.md, AI-Agent-Collaboration.md, Core-Domain-Model.md

---

# 1. Purpose

This document defines the phased implementation roadmap for Zivith.

**Strategy decision (2026-07):** The MVP follows B-Line — the AI Agent creative pipeline is built first, while real video generation uses a Mock Adapter. This prioritizes demonstrating the "AI as creative partner" workflow over video quality, and defers video model selection to a later phase when the provider landscape is clearer.

---

# 2. Phase Overview

```
Phase 0: Foundation             (2-3 weeks)
    ↓
Phase 1: Core Domain             (3-4 weeks)
    ↓
Phase 2: AI Agent Pipeline       (4-5 weeks)   ← Moved earlier (B-Line)
    │   Video generation: Mock Adapter
    ↓
Phase 2.5: First Provider Integration (2-3 weeks)
    │   Controlled DeepSeek + Tongyi Wanxiang + Kling loop
    ↓
Phase 3: Productionize Real Generation (3-4 weeks)
    ↓
Phase 4: Asset & Refinement      (3-4 weeks)
    ↓
Phase 5: Polish & Launch         (2-3 weeks)
```

**Total estimated: 19-26 weeks for MVP**

---

# 3. Phase 0: Foundation

**Goal:** Project scaffolding, core infrastructure, and development environment.

### Scope

- [ ] Monorepo setup with package management
- [ ] Database schema migration framework
- [ ] API framework with routing, middleware, error handling
- [ ] Authentication (sign-up, login, JWT session)
- [ ] Frontend app shell with routing (Chinese UI)
- [ ] UI component library foundation (Chinese labels)
- [ ] Object storage integration
- [ ] Job queue setup
- [ ] CI/CD pipeline
- [ ] Development, staging, production environments

### Deliverables

| Deliverable | Description |
|-------------|-------------|
| Repository structure | Monorepo with `apps/`, `packages/`, `docs/` |
| Database schema | All tables for Project, Story, Scene, Shot, Asset, User |
| API skeleton | All endpoint stubs returning 501 |
| Auth flow | Complete sign-up / login / session management |
| App shell | Navigation, project switcher, routing (Chinese labels) |
| Dev environment | Docker Compose with all services, seed data script |

### Completion Criteria

- [ ] Developer can run `setup.sh` and have a working local environment
- [ ] All API endpoint stubs respond
- [ ] User can sign up, log in, and see an empty dashboard (Chinese UI)
- [ ] CI passes on every PR (lint, type-check, test)

---

# 4. Phase 1: Core Domain

**Goal:** Full CRUD for the creative hierarchy. Users can manually create and organize Projects, Stories, Scenes, and Shots.

### Scope

- [ ] Project CRUD (API + UI)
- [ ] Story CRUD (API + UI)
- [ ] Scene CRUD with reordering (API + UI)
- [ ] Shot CRUD with full schema (API + UI)
- [ ] Inheritance resolution logic
- [ ] Shot lifecycle state machine
- [ ] Basic Asset CRUD (Character, Location)
- [ ] Asset reference resolution
- [ ] Character reference image upload and storage

### Deliverables

| Deliverable | Description |
|-------------|-------------|
| Project Dashboard | List, create, delete projects |
| Story Editor | Timeline view, story metadata editing |
| Scene Canvas | Scene list with shot thumbnails, reorder |
| Shot Editor | Full form for all Shot fields per Shot-Specification.md |
| Asset Browser | List and detail views for Characters and Locations |
| Inheritance Engine | Backend service that resolves inherited fields |
| Reference Image Upload | Upload and attach images to Characters and Locations |

### Completion Criteria

- [ ] User can create a Project, add a Story, divide into Scenes, and define Shots
- [ ] Inheritance works: changing Project style cascades to all non-approved Shots
- [ ] Shot state machine transitions correctly (draft → prompting → generating → review → approved)
- [ ] Asset references resolve correctly in API responses
- [ ] Character reference images upload and display correctly

### Key API Endpoints (functional)

```
Projects:    CRUD
Stories:     CRUD
Scenes:      CRUD + reorder
Shots:       CRUD + reorder + duplicate + approve/unfreeze
Assets:      CRUD (Character, Location only) + list/filter
Media:       Upload reference images
```

---

# 5. Phase 2: AI Agent Pipeline (with Mock Generation)

**Goal:** Full AI agent orchestration with mock video generation. Users go from idea to structured creative output with AI assistance at every stage, but video outputs are placeholders.

This is the B-Line MVP: the creative pipeline is fully functional, while video model integration is deferred.

### Scope

- [ ] Story Agent (generate story from brief)
- [ ] Scene Agent (decompose story into scenes)
- [ ] Visual Prep Agent (identify per-Scene Character/Location visual requirements and reuse recommendations)
- [ ] Shot Agent (decompose scene into shots with field configuration)
- [ ] Prompt Agent (construct prompts from resolved Shot data)
- [ ] Asset Agent (generate characters/locations from descriptions)
- [ ] Orchestrator (coordinate multi-agent workflows)
- [ ] Workflow state machine and persistence
- [ ] Automation level configuration per stage
- [ ] Human-in-the-loop review gates at every stage
- [ ] Mandatory prompt review before every video generation request
- [ ] **Mock Generation Adapter** — returns placeholder videos
- [ ] Generation Queue UI with mock progress simulation
- [ ] Scene visual-assets review panel for Character/Location key images and variants

### Mock Adapter Specification

The Mock Adapter implements the `VideoGenerationAdapter` interface but produces placeholder outputs:

```typescript
class MockGenerationAdapter implements VideoGenerationAdapter {
  readonly provider = 'mock';
  readonly supportedModels = [{ id: 'mock-v1', name: 'Mock Video Generator' }];

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    // Simulate generation delay (2-5 seconds)
    await sleep(2000 + Math.random() * 3000);

    return {
      jobId: `mock-${Date.now()}`,
      status: 'completed',
      outputUrl: PLACEHOLDER_VIDEO_URL,      // Static placeholder video
      thumbnailUrl: PLACEHOLDER_THUMBNAIL_URL,
      durationSeconds: request.parameters.duration,
      metadata: {
        model: 'mock-v1',
        promptUsed: request.prompt,
        generatedAt: new Date().toISOString(),
        isMock: true,
      }
    };
  }
}
```

The placeholder video displays the Shot's structured data as text overlay, allowing the user to verify that prompt construction and generation flow work end-to-end.

### Deliverables

| Deliverable | Description |
|-------------|-------------|
| Agent Runtime | Generic agent execution framework |
| Individual Agents | Story, Scene, Shot, Prompt, Asset agents |
| Orchestrator | Workflow DAG executor: Story → Scene → Scene review → Visual Prep → visual-assets review → Shot → Prompt → mandatory prompt review → Video → review |
| Workflow UI | "Generate Story" flow with progress and review panels |
| Automation Settings | Per-stage automation level configuration |
| Asset Agent UI | "Create Character" / "Create Location" AI-assisted flows |
| Mock Adapter | Placeholder video generation for end-to-end flow testing |
| Generation Queue UI | Real-time progress with mock timing |

### Completion Criteria

- [ ] User can input a creative brief and get a complete Story with Scenes and Shots
- [ ] User can approve the required Scene, visual-assets, and prompt gates; prompt review cannot be bypassed by full-auto mode
- [ ] Shot Agent configures all Shot fields (camera, lighting, character actions, dialogue)
- [ ] Prompt Agent constructs complete prompts from Shot data
- [ ] Mock generation produces placeholder videos with correct metadata
- [ ] Workflow can be paused, resumed, and recovered from crashes

### Agent Quality Metrics (Phase 2)

| Agent | Target Quality |
|-------|---------------|
| Story Agent | Narrative structure rated ≥4/5 by users |
| Scene Agent | Scene breakdowns require ≤1 human edit per scene |
| Shot Agent | Shot descriptions require ≤2 field adjustments per shot |
| Prompt Agent | Generated prompts are well-formed and follow the template |
| Asset Agent | Generated Characters/Locations have complete, usable descriptions |

---

# 6. Phase 2.5: First Provider Integration

**Goal:** Validate a controlled, minimal real-provider loop: adapter contracts, asynchronous jobs, cost records, and failure recovery. This is a 2–3 week non-production experience, not a production-grade generation product or complete review UI.

| Capability | Provider | Integration scope |
|------------|----------|-------------------|
| Text | DeepSeek | Structured output for Story, Scene, Shot, and Prompt Agents |
| Image | Tongyi Wanxiang | Character/Location key images and Scene variant generation |
| Video | Kling | Image-to-video generation using approved reference images |

### Scope

- [ ] `DeepSeekAdapter` for completions and structured output
- [ ] `TongyiWanxiangAdapter` for text-to-image and, where actually supported, reference-image or variant generation
- [ ] `KlingAdapter` for text-to-video and image-to-video
- [ ] Server-only BYOK credential storage; frontend never calls a provider directly
- [ ] Unified provider job states: `queued`, `running`, `completed`, `failed`, `cancelled`
- [ ] Per-call provider, model, parameters, prompt, duration, error code, and estimated cost records
- [ ] Contract tests and a minimal end-to-end test for all three adapters

### Completion Criteria

- [ ] DeepSeek consistently returns schema-valid Story, Scene, Shot, and Prompt results using `<configured-deepseek-model>`
- [ ] A reviewed Scene can generate and save Character/Location reference images using `<configured-wanxiang-model>`
- [ ] Kling accepts approved reference images and returns a video for review
- [ ] A provider failure preserves creative data and can be retried without duplicate Media or Output records

---

# 7. Phase 3: Productionize Real Generation

**Goal:** Productionize the adapters validated in Phase 2.5—DeepSeek, Tongyi Wanxiang, and Kling—and deliver the complete generation, review, and version-management experience.

The adapter pattern continues to allow Qwen, GPT, Claude, GPT Image, FLUX, Vidu, and Veo to be added without domain changes.

### Scope

- [ ] Production rate limiting, queues, retries, and monitoring for validated adapters
- [ ] Image-to-video support using approved Scene visual-asset bindings
- [ ] Real generation job queue and worker
- [ ] SSE-based real-time progress for real jobs
- [ ] Review Agent (analyze generated videos, suggest improvements)
- [ ] Review Panel with side-by-side Shot spec vs. generated video
- [ ] Output version management
- [ ] Prompt preview panel in Shot Editor

### Character Consistency Strategy

Character consistency uses the image-to-video approach:

```
Scene visual-asset binding
  └─ approved_media_id (uploaded or generated Character/Location image)

Shot specifies:
  └─ characters[].character_id

Generation flow:
  1. Resolve approved Character/Location bindings for the Scene
  2. Fall back to the Asset's Project-level reference_images[] only when no Scene binding exists
  3. Snapshot the selected Media as conditioning input for the Kling API
  4. Model generates video while maintaining character appearance
```

This requires no LoRA training or model fine-tuning. The first production path uses Kling image-to-video; other video providers can be added through the same adapter interface.

### Deliverables

| Deliverable | Description |
|-------------|-------------|
| Real Generation Adapter | Integration with production video generation API |
| Image-to-Video Pipeline | Reference image conditioning for character consistency |
| Generation Worker | Background job processor (real API calls) |
| Generation Queue UI | Real-time progress of all generation jobs |
| Output Management | Version history, active version switching |
| Review Panel | Side-by-side Shot spec vs. generated video |
| Review Agent | Automated output analysis and improvement suggestions |

### Completion Criteria

- [ ] User can generate real videos from any Shot
- [ ] Character reference images are passed to the generation model
- [ ] Review Agent provides structured feedback on generated videos
- [ ] User can approve/reject/retry generated videos
- [ ] Multiple output versions are stored and switchable

---

# 8. Phase 4: Asset & Refinement

**Goal:** Advanced asset management, full asset taxonomy, video assembly, and UX polish.

### Scope

- [ ] Full Asset taxonomy support (Prop, Style, Knowledge, Prompt Template)
- [ ] Asset reference graph visualization
- [ ] Batch operations (regenerate all Shots in Scene, apply Style to Project)
- [ ] Advanced Shot Editor features (keyframe-like comparison, A/B testing)
- [ ] Video assembly via FFmpeg (concatenate approved outputs into final video)
- [ ] Export (download assembled video, export project as archive)
- [ ] Prompt template editor
- [ ] Knowledge base editor with relationship graphs
- [ ] Advanced search across all entity types

### Video Assembly via FFmpeg

Video assembly uses FFmpeg as a backend process. No embedded timeline editor in MVP — assembly is a batch operation.

```
Shot 1 (approved) ─┐
Shot 2 (approved) ─┼─→ FFmpeg concat → transitions → audio mix → Final Video
Shot N (approved) ─┘
```

**FFmpeg operations supported:**

| Operation | FFmpeg Command Pattern |
|-----------|----------------------|
| Concatenation | `concat` demuxer or filter |
| Crossfade transition | `xfade` filter |
| Audio normalization | `loudnorm` filter |
| Subtitle burn-in | `subtitles` filter |
| Format conversion | Codec selection, resolution scaling |

Future phases may integrate a timeline-based editor, but Phase 4 uses FFmpeg for automated batch assembly.

### Deliverables

| Deliverable | Description |
|-------------|-------------|
| Asset Taxonomy | Full support for all 7 asset types |
| Reference Graph | Visual graph showing asset usage across the project |
| Batch Operations | Multi-select and batch actions |
| Video Assembly | FFmpeg-based concatenation of Shots into final video |
| Prompt Template Editor | UI for creating and editing prompt templates |
| Knowledge Editor | Rich text editor for world-building documents |
| Export | Project archive and video export |

### Completion Criteria

- [ ] All 7 Asset types (Character, Location, Prop, Style, Media, Knowledge, Template) are fully functional
- [ ] User can see which Shots reference a Character from the Character detail page
- [ ] User can apply a Style to an entire Project with one action
- [ ] User can export a complete assembled video via FFmpeg

---

# 9. Phase 5: Polish & Launch

**Goal:** Production readiness, performance optimization, and launch preparation.

### Scope

- [ ] Performance optimization (lazy loading, caching, query optimization)
- [ ] Error boundary and graceful degradation
- [ ] Loading states and skeleton screens
- [ ] Responsive design audit
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Security audit
- [ ] Load testing
- [ ] Documentation (user guide in Chinese, API docs in English)
- [ ] Analytics and usage tracking
- [ ] Billing integration
- [ ] Onboarding flow

### Deliverables

| Deliverable | Description |
|-------------|-------------|
| Production Deployment | Fully configured production environment |
| User Documentation | Getting started guide, feature walkthroughs (Chinese) |
| API Documentation | OpenAPI spec, usage examples (English) |
| Onboarding Flow | Interactive tutorial for first-time users (Chinese) |
| Monitoring Dashboard | Production metrics and alerting |

### Completion Criteria

- [ ] Page load time < 2 seconds (p95)
- [ ] API response time < 200ms (p95) for CRUD endpoints
- [ ] Zero critical security vulnerabilities
- [ ] WCAG 2.1 AA compliance
- [ ] Load tested at 100 concurrent users with acceptable performance
- [ ] Complete user onboarding flow tested with 5 external users

---

# 10. Language & Localization Strategy

| Layer | Language | Rationale |
|-------|----------|-----------|
| UI Labels | Chinese | Target user base is Chinese-speaking individual creators |
| Source Code Comments | English | Consistency with documentation and open-source conventions |
| Database Field Values | Source language (Chinese or English as entered) | Preserve creator's original expression |
| AI Agent System Prompts | English for overseas models, Chinese for domestic models | Optimize for each model's training data distribution |
| Video Generation Prompts | English (default), Chinese if domestic model is used | Prompt effectiveness varies by model training data |
| Technical Documentation | English | Code agent consumption and open-source compatibility |
| User-Facing Documentation | Chinese | Target user base |

---

# 11. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Video generation API instability | Medium | High | Adapter abstraction; Mock Adapter already in place from Phase 2 |
| LLM output quality inconsistent | High | Medium | Review gates at every stage; human-in-the-loop by default |
| Cost overrun from AI API calls | Medium | High | BYOK usage records and enforceable cost limits per project and provider; estimated cost display before generation |
| Inheritance complexity bugs | Medium | Medium | Comprehensive test suite for resolution; visual diff of inherited vs local fields |
| Parallel generation race conditions | Low | High | Idempotent job design; strict state machine transitions |
| Scope creep in Shot Editor | High | Medium | Strict adherence to Shot-Specification.md schema; defer custom fields to Phase 4 |
| Character consistency limitations | High | Medium | Image-to-video with reference images; iterate until acceptable |
| Bilingual prompt complexity | Low | Medium | Model-specific prompt templates; automated language detection |

---

# 12. Team & Resource Estimate

For a team of 2-3 full-stack engineers with AI/ML experience:

| Phase | Engineers | Weeks | Key Skill Requirements |
|-------|-----------|-------|----------------------|
| Phase 0 | 2 | 2-3 | DevOps, full-stack, database design |
| Phase 1 | 2-3 | 3-4 | Full-stack, domain modeling |
| Phase 2 | 2-3 | 4-5 | LLM prompt engineering, agent architecture, workflow engines |
| Phase 2.5 | 2-3 | 2-3 | Provider adapters, async jobs, contract testing, BYOK safeguards |
| Phase 3 | 2-3 | 3-4 | Backend (queues, SSE), frontend (real-time UI), production AI API integration |
| Phase 4 | 2 | 3-4 | Frontend (complex UI), FFmpeg, media processing |
| Phase 5 | 2 | 2-3 | DevOps, performance, security, accessibility |
