# Technical Architecture

> Zivith 技术架构
>
> Version: 1.0
>
> Status: Draft
>
> Related: Core-Domain-Model.md, AI-Agent-Collaboration.md, Shot-Specification.md

---

# 1. Purpose

This document defines the technical architecture of Zivith. It describes system boundaries, component responsibilities, data flow, and integration patterns.

The architecture is described in technology-agnostic terms. Concrete technology choices (languages, frameworks, databases) are deferred to implementation planning. The patterns described here are implementable in any reasonable modern stack.

---

# 2. Architecture Overview

## 2.1 System Boundary

```
                         ┌──────────────────────┐
                         │   External AI APIs    │
                         │ (LLM, Image, Video)   │
                         └──────────┬───────────┘
                                    │
┌───────────────────────────────────┼───────────────────────────────────┐
│                          Zivith System                                │
│                                   │                                   │
│  ┌──────────────────┐   ┌────────┴─────────┐   ┌──────────────────┐  │
│  │   Web Frontend   │   │  API Gateway      │   │  Background      │  │
│  │   (SPA)          │──▶│  (REST + SSE)     │──▶│  Workers         │  │
│  │                  │   │                   │   │  (Job Queue)     │  │
│  └──────────────────┘   └────────┬─────────┘   └────────┬─────────┘  │
│                                  │                       │            │
│                          ┌───────┴───────┐       ┌──────┴───────┐    │
│                          │  Application   │       │  AI Agent     │    │
│                          │  Services      │       │  Runtime      │    │
│                          └───────┬───────┘       └──────┬───────┘    │
│                                  │                       │            │
│                          ┌───────┴───────────────────────┴───────┐    │
│                          │          Domain Layer                 │    │
│                          └───────────────────┬───────────────────┘    │
│                                              │                        │
│                          ┌───────────────────┴───────────────────┐    │
│                          │          Data Layer                   │    │
│                          │  ┌──────────┐  ┌──────────────────┐   │    │
│                          │  │ Primary  │  │  Object / Media  │   │    │
│                          │  │ Database │  │  Storage         │   │    │
│                          │  └──────────┘  └──────────────────┘   │    │
│                          └───────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────┘
```

## 2.2 Architectural Principles

| Principle | Description |
|-----------|-------------|
| **Bounded Contexts** | The domain model maps to clearly separated service boundaries |
| **Ports & Adapters** | External integrations (AI APIs, storage) are behind interfaces |
| **Event-Driven** | State transitions emit events; interested services react |
| **Stateless Services** | Application services are stateless; state lives in the database and job queue |
| **Async by Default** | Any operation that may take >1 second uses async job processing |

---

# 3. Bounded Contexts

The domain is divided into eight bounded contexts. Each context owns its data and exposes a well-defined API.

## 3.1 Context Map

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Project    │     │    Asset     │     │    Story     │
│   Context    │◀───▶│   Context    │◀───▶│   Context    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │            ┌───────┴───────┐            │
       └───────────▶│  Agent        │◀───────────┘
                    │  Orchestration│
                    │  Context      │
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
       ┌──────┴──────┐ ┌───┴────┐ ┌──────┴──────┐
       │   Prompt    │ │Generation│ │   Media     │
       │   Context   │ │ Context │ │   Context   │
       └─────────────┘ └────────┘ └─────────────┘
```

## 3.2 Context Responsibilities

### Project Context
- Project CRUD
- Project-level settings and defaults
- Agent configuration per project

### Asset Context
- Character, Location, Prop, Style CRUD
- Knowledge management
- Asset search and tagging
- Reference resolution

### Story Context
- Story CRUD
- Scene CRUD
- Shot CRUD
- Hierarchy management (ordering, re-parenting)
- Inheritance resolution
- Approval state management

### Agent Orchestration Context
- Workflow definition and configuration
- Workflow execution (run workflows)
- Agent dispatch and result collection
- Parallel execution management
- Review gate management
- Workflow state persistence and recovery

### Prompt Context
- Prompt template management
- Prompt construction from resolved Shot data
- Prompt versioning

### Generation Context
- External AI model adapter
- Image and video generation job management
- Rate limiting and queuing
- Result ingestion (store generated videos as Outputs)

### Media Context
- File upload and download
- Thumbnail generation
- Media metadata extraction
- Object storage abstraction

### User Context (cross-cutting)
- Authentication and authorization
- User preferences
- Project membership

## 3.3 Context Communication Patterns

| Pattern | Use Case |
|---------|----------|
| **Synchronous API call** | When Context A needs data owned by Context B immediately (e.g., Asset resolution during prompt construction) |
| **Async event** | When an action in Context A should trigger a reaction in Context B (e.g., Shot approved → notify Generation Context) |
| **Shared ID references** | When Context A stores a foreign key to Context B's entity (e.g., Shot stores `character_id`) |

---

# 4. API Design

## 4.1 API Style

The public API follows REST conventions. Real-time updates use Server-Sent Events (SSE).

**Base URL:** `/api/v1`

## 4.2 Resource Endpoints

### Projects

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/projects` | List user's projects |
| `POST` | `/projects` | Create project |
| `GET` | `/projects/{id}` | Get project detail |
| `PATCH` | `/projects/{id}` | Update project |
| `DELETE` | `/projects/{id}` | Delete project |
| `GET` | `/projects/{id}/settings` | Get project settings |
| `PUT` | `/projects/{id}/settings` | Update project settings |

### Stories

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/projects/{pid}/stories` | List stories in project |
| `POST` | `/projects/{pid}/stories` | Create story |
| `GET` | `/stories/{id}` | Get story with scenes |
| `PATCH` | `/stories/{id}` | Update story |
| `DELETE` | `/stories/{id}` | Delete story |

### Scenes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/stories/{sid}/scenes` | List scenes in story |
| `POST` | `/stories/{sid}/scenes` | Create scene |
| `GET` | `/scenes/{id}` | Get scene with shots |
| `PATCH` | `/scenes/{id}` | Update scene |
| `DELETE` | `/scenes/{id}` | Delete scene |
| `POST` | `/scenes/{id}/reorder` | Reorder scenes |

### Scene Visual Requirements

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/scenes/{id}/visual-requirements` | List visual requirements, candidates, and approvals |
| `POST` | `/scenes/{id}/visual-requirements` | Create or confirm visual requirements |
| `PATCH` | `/scenes/{id}/visual-requirements/{rid}` | Update a requirement, variant, or reuse choice |
| `POST` | `/scenes/{id}/visual-requirements/{rid}/generate` | Generate a candidate image |
| `POST` | `/scenes/{id}/visual-requirements/{rid}/approve` | Select and approve one candidate Media item |
| `POST` | `/scenes/{id}/visual-requirements/{rid}/reject` | Reject a candidate while retaining the requirement for retry |

### Shots

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/scenes/{sid}/shots` | List shots in scene |
| `POST` | `/scenes/{sid}/shots` | Create shot |
| `GET` | `/shots/{id}` | Get full shot detail |
| `PATCH` | `/shots/{id}` | Update shot (partial) |
| `DELETE` | `/shots/{id}` | Delete shot |
| `POST` | `/shots/{id}/generate-prompt` | Generate prompt from structured fields |
| `POST` | `/shots/{id}/prompts/{promptId}/approve` | Mandatory approval before video generation |
| `POST` | `/shots/{id}/generate` | Trigger video generation |
| `POST` | `/shots/{id}/approve` | Approve shot |
| `POST` | `/shots/{id}/unfreeze` | Unfreeze approved shot |
| `POST` | `/shots/{id}/duplicate` | Duplicate shot |
| `POST` | `/shots/{id}/reorder` | Reorder shots |

### Assets

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/projects/{pid}/assets` | List assets (filterable by type) |
| `POST` | `/projects/{pid}/assets` | Create asset |
| `GET` | `/assets/{id}` | Get asset detail |
| `PATCH` | `/assets/{id}` | Update asset |
| `DELETE` | `/assets/{id}` | Delete asset |
| `GET` | `/assets/{id}/references` | List entities referencing this asset |
| `POST` | `/assets/media/upload` | Upload media file |

### Workflows

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/workflows/story-to-video` | Start full story-to-video workflow |
| `GET` | `/workflows/{runId}` | Get workflow status |
| `POST` | `/workflows/{runId}/review` | Submit review decision |
| `POST` | `/workflows/{runId}/cancel` | Cancel workflow |
| `GET` | `/workflows/{runId}/events` | SSE stream for real-time progress |

### Generation

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/shots/{id}/outputs` | List outputs for a shot |
| `POST` | `/shots/{id}/outputs/{oid}/activate` | Set active output version |

### Provider Credentials and Usage

| Method | Path | Description |
|--------|------|-------------|
| `PUT` | `/provider-credentials/{provider}` | Store or replace the authenticated user's BYOK credential |
| `DELETE` | `/provider-credentials/{provider}` | Remove a stored credential |
| `GET` | `/projects/{pid}/provider-usage` | List per-project, per-provider usage, cost, and configured limits |
| `PUT` | `/projects/{pid}/provider-limits/{provider}` | Set per-project, per-provider cost and usage limits |

## 4.3 Common Patterns

### Pagination

```
GET /projects/{pid}/assets?type=character&limit=20&cursor=abc123
```

Response includes `next_cursor` for cursor-based pagination.

### Partial Updates

All `PATCH` endpoints accept JSON Merge Patch (RFC 7396):

```json
PATCH /shots/shot_123
{
  "camera": {
    "shot_type": "close_up"
  }
}
```

Only specified fields are updated. `null` values reset a field to inherit from parent.

### Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Shot validation failed",
    "details": [
      {
        "rule": "character_refs_valid",
        "severity": "error",
        "field": "characters[0].character_id",
        "message": "Character 'char_missing' not found in project"
      }
    ]
  }
}
```

---

# 5. Data Storage

## 5.1 Storage Responsibilities

| Storage | Purpose | Data Types |
|---------|---------|------------|
| **Primary Database** | Domain entities and relationships | Projects, Stories, Scenes, Shots, Assets, Workflows, Users |
| **Object Storage** | Binary media files | Videos, images, audio, 3D models, documents |
| **Job Queue** | Async task management | Generation jobs, workflow steps, notifications |
| **Cache** | Frequently accessed, rarely changed data | Resolved Asset data, prompt templates, model capabilities |

## 5.2 Primary Database — Entity-Relationship Overview

```
User 1──N Project
Project 1──N Story
Project 1──N Asset (Character, Location, Prop, Style, Knowledge, Media, Template)
Story 1──N Scene
Scene 1──N Shot
Shot 1──N Output
Shot N──M Character (via shot_characters join)
Scene N──M Character (via scene_characters join)
Shot N──1 Location (reference)
Shot N──1 Style (reference)
WorkflowRun 1──N WorkflowStep
```

## 5.3 Key Schema Decisions

### Inheritance Storage

Inherited fields are stored as `null` in the database. Resolution happens at query time by walking up the hierarchy. This avoids data duplication and ensures that changes to parent objects automatically propagate.

```sql
-- Example: resolving a Shot's aspect_ratio
-- If shot.style_aspect_ratio IS NULL, check scene
-- If scene.style_aspect_ratio IS NULL, check story  
-- If story.style_aspect_ratio IS NULL, use project default
```

### Soft Deletes

All entities support soft delete (`deleted_at` timestamp). Hard deletes require explicit confirmation and are only allowed when no active references exist.

### Audit Trail

All state transitions on Shot and WorkflowRun are logged to an `audit_log` table for traceability.

---

# 6. External AI Integration

## 6.1 Adapter Pattern

All external AI model interactions are isolated behind capability-specific adapters. Domain and workflow code may reference a provider and a model identifier, but never a provider SDK or provider-specific request shape.

| Capability | Supported providers | First integration set |
|------------|---------------------|-----------------------|
| Text | DeepSeek, Qwen, GPT, Claude | **DeepSeek** |
| Image | Tongyi Wanxiang, GPT Image, FLUX | **Tongyi Wanxiang** |
| Video | Kling, Vidu, Veo | **Kling** |

```typescript
interface ImageGenerationAdapter {
  readonly provider: string;
  readonly supportedModels: ModelInfo[];
  /** Capability bit (ports/adapters only — never a domain/provider field). */
  readonly supportsReferenceImages: boolean;

  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
  getStatus(jobId: string): Promise<JobStatus>;
  cancel(jobId: string): Promise<void>;
  getCapabilities(): ImageModelCapabilities;
}

interface ImageGenerationRequest {
  request_id: string;
  model: string;
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  /** Optional labeled references for identity/style conditioning (V0.4 W1). */
  reference_images?: Array<{
    media_id: string;
    label: string;
    role: 'character' | 'location' | 'style';
    url?: string;
  }>;
}

interface ImageModelCapabilities {
  supports_reference_images: boolean;
}
```

When references are supplied but the selected model cannot condition on them, adapters must not fail silently: they generate without injection and set `metadata.reference_injection = 'skipped_unsupported'`. Successful injection sets `applied` and callers persist `reference_media_ids[]` on Media `generation_metadata`.

## 6.2 Provider Abstraction

```
Generation Context
       │
       ▼
┌──────────────────┐
│  Adapter Registry │
│  (provider →      │
│   adapter)        │
└──────┬───────────┘
       │
       ├──▶ LLM: DeepSeekAdapter (first), QwenAdapter, GPTAdapter, ClaudeAdapter
       ├──▶ Image: TongyiWanxiangAdapter (first), GPTImageAdapter, FluxAdapter
       └──▶ Video: KlingAdapter (first), ViduAdapter, VeoAdapter
```

The adapter registry maps capability plus provider to an adapter instance. Adding a provider means implementing the appropriate adapter, with no domain-logic changes.

## 6.3 LLM Integration

Similarly, LLM interactions (for agents) go through an LLM adapter:

```typescript
interface LLMAdapter {
  readonly provider: string;
  readonly supportedModels: ModelInfo[];

  complete(request: CompletionRequest): Promise<CompletionResult>;
  completeStructured<T>(request: StructuredRequest): Promise<T>;
}
```

Agent configurations specify which LLM model to use. The LLM adapter handles provider-specific formatting (system prompt, tool use, structured output). The first integration set uses DeepSeek; Qwen, GPT, and Claude remain interchangeable configurations.

## 6.4 Image Generation Job Flow

```
1. After Scene review, Visual Prep produces visual requirements.
2. The user confirms which Character/Location visuals to reuse or generate.
3. Generation Context creates an ImageGenerationJob (status: queued).
4. A worker combines Asset description, Scene variant, and style, then calls ImageGenerationAdapter.generate().
5. If asynchronous, a webhook or polling monitors completion.
6. On completion, the worker creates generated Media with provider, model, prompt, and parameter metadata.
7. The user approves a candidate and binds it as the Asset key image or Scene variant.
8. The workflow may start Shot decomposition only after every required visual is approved.
```

The first integration set uses `TongyiWanxiangAdapter`. Provider authentication, parameters, and callback format remain inside the adapter and must not appear in domain entities.

## 6.5 Video Generation Job Flow

```
1. User/Agent requests video generation for a Shot after mandatory prompt approval.
2. Validate that the Shot's Scene has all required visual assets approved; otherwise return `visual_assets_approved`.
3. Create a VideoGenerationJob and Output (status: queued), snapshotting the prompt and Media IDs.
4. A worker resolves inheritance and asset references, then calls VideoGenerationAdapter.generate().
5. If async: webhook or polling monitors job completion.
6. On completion, update the same Output record; transition the Shot to `review` only when the Output is `completed`.
7. Send an SSE event to the frontend.
```

---

# 7. Frontend Architecture

## 7.1 Module Map

```
┌─────────────────────────────────────────────┐
│                App Shell                     │
│  ┌─────────────────────────────────────────┐│
│  │         Navigation + Project Switcher   ││
│  └─────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────┐│
│  │                                         ││
│  │         Active Module Area              ││
│  │                                         ││
│  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ ││
│  │  │ Project  │ │ Story    │ │ Asset   │ ││
│  │  │ Dashboard│ │ Editor   │ │ Browser │ ││
│  │  └──────────┘ └──────────┘ └─────────┘ ││
│  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ ││
│  │  │ Scene    │ │ Shot     │ │ Review  │ ││
│  │  │ Canvas   │ │ Editor   │ │ Panel   │ ││
│  │  └──────────┘ └──────────┘ └─────────┘ ││
│  │                                         ││
│  └─────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────┐│
│  │         Status Bar + Generation Queue   ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

## 7.2 Core Modules

### Project Dashboard
- Project list with thumbnails
- Create/delete/archive projects
- Project-level statistics (story count, asset count, generation cost)

### Story Editor
- Timeline-based story structure view
- Act/scene organization with drag-and-drop reordering
- Story-level AI actions (generate, expand, rewrite)

### Scene Canvas
- Visual scene layout showing shot thumbnails in sequence
- Scene context panel (location, time, mood, characters)
- Shot reordering and quick preview

### Shot Editor (highest complexity)
- Full Shot form matching Shot-Specification.md schema
- Sectioned into: Camera, Composition, Lighting, Color, Characters, Action, Dialogue, Audio
- Live prompt preview panel (shows constructed prompt)
- Output gallery (generated video thumbnails)
- Version history sidebar
- AI assist buttons: "Suggest camera", "Generate prompt", "Describe action"

### Asset Browser
- Grid/list view of all Asset types
- Search, filter by type, tag-based filtering
- Asset detail panel with edit capabilities
- Reference graph: "Used in 3 Scenes, 12 Shots"

### Review Panel
- Side-by-side comparison: Shot specification vs. generated video
- Review Agent feedback display
- Approve/reject/retry actions
- Batch review mode for multiple Shots

### Generation Queue
- Real-time progress of active generation jobs
- Queue position, estimated completion
- Cancel individual jobs

## 7.3 State Management

```
┌────────────────────────────────────────────┐
│              Client State Store             │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Project  │ │ Editor   │ │ Generation  │ │
│  │ State    │ │ State    │ │ State       │ │
│  │          │ │          │ │             │ │
│  │ • list   │ │ • current│ │ • queue     │ │
│  │ • active │ │   story  │ │ • progress  │ │
│  │ • assets │ │ • current│ │ • history   │ │
│  │          │ │   scene  │ │             │ │
│  │          │ │ • current│ │             │ │
│  │          │ │   shot   │ │             │ │
│  │          │ │ • dirty  │ │             │ │
│  │          │ │   fields │ │             │ │
│  └──────────┘ └──────────┘ └────────────┘ │
│                                             │
│  SSE Connection for real-time updates       │
└────────────────────────────────────────────┘
```

## 7.4 Real-Time Updates

The frontend maintains a persistent SSE connection for:

- Generation job progress
- Workflow step transitions
- Asset modification notifications (when editing Shared context)
- Collaborative editing signals (future)

---

# 8. Background Processing

## 8.1 Worker Architecture

```
┌──────────────────────────────────────────────┐
│                Job Queue                      │
│  ┌─────────┐ ┌─────────┐ ┌───────────────┐  │
│  │Generate │ │Generate │ │Prompt/Workflow│  │
│  │Video    │ │Image    │ │Orchestration  │  │
│  └────┬────┘ └────┬────┘ └───────┬───────┘  │
└───────┼────────────┼──────────────┼──────────┘
        │            │              │
        ▼            ▼              ▼
┌──────────────────────────────────────────────┐
│              Worker Pool                      │
│                                               │
│  Worker 1: picks GenerateVideo jobs           │
│  Worker 2: picks GenerateImage jobs           │
│  Worker 3: picks PromptConstruct/Workflow jobs│
│  Worker N: generic worker                     │
└──────────────────────────────────────────────┘
```

## 8.2 Job Types

| Job Type | Priority | Max Retries | Timeout |
|----------|----------|-------------|---------|
| `prompt_construct` | High | 3 | 30s |
| `image_generate` | Normal | 2 | 300s |
| `video_generate` | Normal | 2 | 600s |
| `workflow_step` | High | 3 | 300s |
| `review_analysis` | Low | 1 | 60s |
| `thumbnail_generate` | Low | 3 | 30s |
| `media_process` | Low | 2 | 120s |

## 8.3 Idempotency and Provider Callbacks

Every image or video generation job must have an internal `idempotency_key` and the provider's `provider_job_id`. Worker retries, webhook replays, and workflow recovery may update only the existing Job and Media/Output record; they must never create duplicate Media or Output records.

All asynchronous provider callbacks enter through `POST /internal/providers/{provider}/callbacks`. The endpoint verifies the provider signature and timestamp, handles callbacks idempotently by `provider_job_id`, and retains the raw callback for audit. Provider API keys and callback secrets must never be included in Media `generation_metadata`.

---

# 9. Security Considerations

| Concern | Approach |
|---------|----------|
| Authentication | JWT-based, issued by auth service |
| Authorization | Resource-level: user must be project member |
| API Rate Limiting | Per-user, per-endpoint rate limits; stricter for generation endpoints |
| File Upload Safety | MIME type validation, virus scanning, size limits |
| AI API Key Management | BYOK credentials are encrypted at rest and scoped to the authenticated user plus provider, so they can be reused across that user's projects; credentials are never returned to or used directly by the frontend |
| Provider Cost Controls | Record consumption per Project and provider; enforce configured per-provider usage and cost limits before queueing calls |
| Provider Callbacks | Verify signatures and timestamps; process by provider job ID idempotently and reject replays |
| Generated Content | Stored in private buckets; access via signed URLs |

---

# 10. Monitoring & Observability

| Signal | Instrumentation |
|--------|-----------------|
| API latency | Per-endpoint p50/p95/p99 |
| Generation job duration | Per-model, per-duration histogram |
| Agent token usage | Per-agent, per-workflow-run counter |
| Error rates | Per-context, per-operation |
| Queue depth | Per-job-type gauge |
| SSE connection count | Active connections gauge |
| Storage usage | Per-project, per-asset-type counter |
