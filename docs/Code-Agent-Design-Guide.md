# Code Agent Design Guide

> Zivith 面向代码 Agent 的设计规范
>
> Version: 1.0
>
> Status: Draft
>
> Audience: AI code agents implementing Zivith features
>
> Related: All project documents

---

# 1. Purpose

This document is the entry point for AI code agents tasked with implementing Zivith. It establishes conventions, references the canonical design documents, and provides implementation guardrails.

A code agent reading this document should be able to understand the complete system, locate the relevant specification for any task, and produce code that is consistent with the rest of the codebase.

---

# 2. Document Map

Code agents should read documents in this order before implementing:

| Priority | Document | Purpose |
|----------|----------|---------|
| 1 | `Design-Philosophy.md` | Understand the product vision and design principles |
| 2 | `Core-Domain-Model.md` | Understand the creative hierarchy and ownership model |
| 3 | `Shot-Specification.md` | Understand the core domain object schema |
| 4 | `Asset-Model.md` | Understand the reusable resource taxonomy |
| 5 | `AI-Agent-Collaboration.md` | Understand agent architecture and workflows |
| 6 | `architecture/architecture-principles.md` | Understand the architectural constitution that constrains all decisions |
| 7 | `Technical-Architecture.md` | Understand system boundaries and data flow |
| 8 | `Implementation-Plan.md` | Understand the phased roadmap and scope per phase |
| 9 | `Code-Agent-Design-Guide.md` | (this document) Implementation conventions |

Changes that are architecturally significant must additionally follow
`architecture/adr-guide.md` and `architecture/rfc-guide.md`: irreversible decisions are
recorded as ADRs, and cross-context or migration-bearing changes require an RFC before
implementation.

---

# 3. Language & Localization Conventions

## 3.1 Layer-Specific Language Rules

| Layer | Language | Rule |
|-------|----------|------|
| UI Labels & Messages | Chinese (中文) | All user-facing UI text must be in Chinese |
| Source Code Comments | English | Comments and JSDoc/TSDoc are in English |
| Variable & Function Names | English | All identifiers use English (e.g., `getSceneShots`, not `获取场景镜头`) |
| Database Field Values | Source language | Preserve the creator's original language (Chinese story text stays Chinese) |
| Git Commit Messages | English | Conventional Commits format in English |
| API Response Messages | Chinese | User-facing error messages in Chinese |
| API Field Names | English (snake_case) | `character_id`, not `角色ID` |

## 3.2 AI Agent Prompt Language Strategy

```
Domestic LLM (Qwen, DeepSeek, etc.)
  └─ System prompts: Chinese
  └─ User prompts: Chinese (original story language)
  └─ Structured output: Chinese content, English field names

Overseas LLM (Claude, GPT, etc.)
  └─ System prompts: English
  └─ User prompts: English (translate if source is Chinese)
  └─ Structured output: English content, English field names

Video Generation Model
  └─ Kling (domestic): Chinese prompt
  └─ Vidu/Veo (international): English prompt  
  └─ The Prompt Agent must detect model provider and translate accordingly
```

**Source of truth (V0.4 W6):** versioned files at `apps/api/prompts/<agent>/system.{zh,en}.md`. Loader fills `{placeholder}` (always include empty `{knowledge_context}` for P8). API boot runs placeholder lint. Runtime currently loads `en` for Story/Scene/VisualTrait to keep mock E2E markers (`STORY_AGENT` / `SCENE_AGENT` / `VISUAL_TRAIT_AGENT`) behavior-equivalent; switch locale by provider later per the matrix above.

## 3.3 Prompt Translation Flow

```
1. Prompt Agent resolves Shot data (may contain Chinese text)
2. Prompt Agent detects target model language requirement
3. If translation needed: call LLM to translate Shot fields to English
4. Construct final prompt in target language
5. Store both the constructed prompt and its source language
```

---

# 4. Coding Standards

## 4.1 General Principles

| Principle | Rule |
|-----------|------|
| Domain-Driven | Code structure mirrors the bounded contexts in Technical-Architecture.md |
| Type-First | All domain objects have explicit type definitions matching spec documents |
| Immutable by Default | Domain objects are immutable; mutations create new instances |
| Explicit Over Implicit | No magic values; all enums and constants are defined in a central location |
| Fail Fast | Validate at system boundaries; invalid states should be impossible to represent |

## 4.2 Naming Conventions

### Domain Types

Domain types must match the spec documents exactly:

```
Project, Story, Scene, Shot, Output, VisualAssetRequirement
Character, Location, Prop, Style, Media, Knowledge, PromptTemplate
WorkflowRun, WorkflowStep
ImageGenerationJob, VideoGenerationJob, GenerationResult
```

### ID Types

Use branded types for all entity IDs:

```typescript
// Correct: branded types prevent ID confusion
type ProjectId = string & { readonly __brand: 'ProjectId' };
type StoryId = string & { readonly __brand: 'StoryId' };
type SceneId = string & { readonly __brand: 'SceneId' };
type ShotId = string & { readonly __brand: 'ShotId' };
type CharacterId = string & { readonly __brand: 'CharacterId' };
type LocationId = string & { readonly __brand: 'LocationId' };
type OutputId = string & { readonly __brand: 'OutputId' };
type MediaId = string & { readonly __brand: 'MediaId' };
type VisualAssetRequirementId = string & { readonly __brand: 'VisualAssetRequirementId' };
type ImageGenerationJobId = string & { readonly __brand: 'ImageGenerationJobId' };
type VideoGenerationJobId = string & { readonly __brand: 'VideoGenerationJobId' };
type AssetId = string & { readonly __brand: 'AssetId' };
type WorkflowRunId = string & { readonly __brand: 'WorkflowRunId' };

// Incorrect: plain strings allow passing ShotId where SceneId is expected
type ShotId = string;  // ❌
```

### Enum Values

Enum values use `snake_case`:

```typescript
// Correct
type ShotState = 'draft' | 'prompting' | 'generating' | 'review' | 'approved';
type ShotType = 'close_up' | 'medium_shot' | 'wide_shot' | 'extreme_close_up';

// Incorrect
type ShotState = 'Draft' | 'Prompting'; // ❌
type ShotType = 'closeUp' | 'mediumShot'; // ❌
```

### File Organization

```
src/
├── contexts/                    # One directory per bounded context
│   ├── project/
│   │   ├── domain/              # Types, entities, value objects
│   │   ├── application/         # Use cases, services
│   │   ├── infrastructure/      # Database, external integrations
│   │   └── api/                 # HTTP handlers, DTOs
│   ├── story/
│   ├── asset/
│   ├── agent/
│   ├── prompt/
│   ├── generation/
│   ├── media/
│   └── shared/                  # Cross-cutting types and utilities
├── infrastructure/              # Shared infrastructure
│   ├── database/
│   ├── queue/
│   ├── storage/
│   └── llm/
└── api/                         # API gateway, middleware
```

---

# 5. Implementing Domain Objects

## 5.1 Type Definitions

Every domain object defined in the spec documents must have a corresponding TypeScript type. Use the exact field names from the spec. Do not abbreviate or rename.

```typescript
// From Shot-Specification.md §3.2.1
interface ShotCamera {
  shot_type?: 'close_up' | 'medium_shot' | 'wide_shot' | 'extreme_close_up'
    | 'full_shot' | 'over_the_shoulder' | 'pov' | 'aerial' | 'dutch_angle';
  angle?: 'eye_level' | 'low_angle' | 'high_angle' | 'birds_eye' | 'worms_eye';
  movement?: 'static' | 'pan_left' | 'pan_right' | 'tilt_up' | 'tilt_down'
    | 'dolly_in' | 'dolly_out' | 'tracking' | 'handheld';
  focal_length?: string;
  depth_of_field?: 'shallow' | 'deep';
  custom?: string;
}
```

## 5.2 Inheritance Resolution

The inheritance engine is one of the most critical and error-prone components. Implementation must match these rules exactly:

1. Walk up the hierarchy: Shot → Scene → Story → Project
2. For each field in Shot that is `null` or `undefined`, check the parent
3. Take the first non-null value
4. Approved Shots are excluded from inheritance updates

```typescript
function resolveField<T>(
  shot: Shot,
  scene: Scene,
  story: Story,
  project: Project,
  fieldPath: string[]
): T | undefined {
  if (shot.state === 'approved') {
    return getNestedValue(shot, fieldPath);
  }
  return (
    getNestedValue(shot, fieldPath) ??
    getNestedValue(scene, fieldPath) ??
    getNestedValue(story, fieldPath) ??
    getNestedValue(project, fieldPath)
  );
}
```

**Test cases required:**

- Field set only at Project level → all Shots inherit
- Field set at Scene level → Shots in that Scene inherit; Shots in other Scenes inherit from Project
- Field set at Shot level → Shot uses local value; parent changes do not affect
- Shots in `approved` state → parent changes do not affect
- Shot unfrozen → immediately inherits current parent values for non-local fields

## 5.3 State Machines

Shot state transitions must be implemented as a strict state machine:

```typescript
const SHOT_TRANSITIONS: Record<ShotState, ShotState[]> = {
  draft: ['prompting'],
  prompting: ['generating', 'draft'],
  generating: ['review', 'draft'],
  review: ['approved', 'draft'],   // reject or edit returns to 'draft'
  approved: [],                    // only UnfreezeShot may leave this state
};

function transitionShot(shot: Shot, target: ShotState): Shot {
  if (!SHOT_TRANSITIONS[shot.state].includes(target)) {
    throw new InvalidStateTransitionError(shot.id, shot.state, target);
  }
  return { ...shot, state: target };
}

function unfreezeShot(shot: Shot): Shot {
  if (shot.state !== 'approved') {
    throw new InvalidStateTransitionError(shot.id, shot.state, 'draft');
  }
  return { ...shot, state: 'draft' };
}
```

`transitionShot` must never permit `approved` → `draft`. The dedicated `unfreezeShot` use case is the only path that may do so. Do not introduce a separate `rejected` Shot state or transition from `review` to `rejected`.

## 5.4 Visual Asset Requirements and Generation Jobs

Implement `VisualAssetRequirement` as a persisted Scene entity using the exact fields and status values in `Asset-Model.md`. Its `asset_type` is limited to `character` and `location`; Props are not visual requirements in the first release.

Use distinct `ImageGenerationJob` and `VideoGenerationJob` types and their corresponding branded IDs. Do not use a generic string or generic `GenerationJob` where one of these domain-specific jobs is required.

`GenerateVideo` must validate that every required Visual Asset Requirement for the Shot's Scene is `approved` and has an `approved_media_id`. Resolve that Scene-level approved binding before falling back to the Asset's project-level primary image. `voice_only` and `implied` characters create no character requirements.

When a Scene changes, return its affected requirements to `pending`. Approved Shots and existing Outputs must retain immutable snapshots of their resolved context, including selected visual Media IDs. Keep Output provider status synchronized with the Shot lifecycle: completed Outputs move the Shot to `review`; a failed Output returns the Shot to `draft` only if no job remains running and no completed Output exists.

---

# 6. API Implementation

## 6.1 Endpoint Implementation Pattern

```typescript
// 1. Define route
// 2. Validate input
// 3. Authorize (user must be project member)
// 4. Execute use case
// 5. Return DTO

// Example: PATCH /shots/{id}
async function updateShot(req: Request, res: Response) {
  const shotId = req.params.id as ShotId;
  const patch = req.body as Partial<Shot>;

  // Validation
  const errors = validateShotPatch(patch);
  if (errors.length > 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: errors } });
  }

  // Authorization
  const shot = await shotRepository.findById(shotId);
  if (!shot) return res.status(404);
  await authorize(req.userId, shot.projectId, 'write');

  // Execute
  const updated = await updateShotUseCase.execute(shotId, patch);

  // Return
  return res.status(200).json(toShotDTO(updated));
}
```

## 6.2 DTO Pattern

Always separate domain objects from API DTOs:

```typescript
// Domain object (internal)
interface Shot {
  id: ShotId;
  sceneId: SceneId;
  projectId: ProjectId;
  // ... all fields
}

// API DTO (external)
interface ShotDTO {
  id: string;
  scene_id: string;
  order: number;
  label: string | null;
  state: string;
  // Resolved values (inheritance already applied)
  camera: ResolvedCameraDTO;
  characters: ResolvedCharacterDTO[];
  // ...
}

function toShotDTO(shot: Shot, scene: Scene, story: Story, project: Project): ShotDTO {
  // Resolve inheritance
  // Resolve asset references to display names
  // Return snake_case keys
}
```

---

# 7. Testing Requirements

## 7.1 Test Categories

| Category | Scope | Example |
|----------|-------|---------|
| Unit: Domain | Domain logic in isolation | Inheritance resolution, state machine transitions |
| Unit: Use Cases | Application services with mocked dependencies | `updateShotUseCase` with mocked repository |
| Integration: API | HTTP endpoints with test database | PATCH /shots/{id} returns correct response |
| Integration: Agent | Agent execution with mocked LLM | Story Agent produces valid Story structure |
| E2E: Workflow | Full workflow from story to video | User can complete story-to-video flow |

## 7.2 Critical Test Scenarios

These scenarios must have test coverage before any PR is merged:

1. **Inheritance**: Field inheritance across all 4 levels, override behavior, approved Shot isolation
2. **State Machine**: All valid transitions succeed, all invalid transitions throw
3. **Visual Asset Requirements**: Required bindings gate video generation; Scene-approved bindings take precedence over project primary images; voice-only and implied characters are excluded
4. **Asset Resolution**: Character/Location references resolve correctly with overrides, including base-Character resolution followed by local merging
5. **Output Synchronization**: Completed and failed Output transitions follow the specified Shot synchronization rules; Output snapshots remain immutable
6. **Parallel Generation**: Multiple concurrent generation jobs do not conflict
7. **Workflow Recovery**: Orchestrator crash and restart preserves state correctly
8. **Authorization**: Non-member cannot access project resources

---

# 8. Error Handling

## 8.1 Error Taxonomy

```typescript
// Domain errors
class InvalidStateTransitionError extends DomainError {}
class AssetNotFoundError extends DomainError {}
class ValidationError extends DomainError {}

// Application errors
class GenerationFailedError extends ApplicationError {}
class WorkflowTimeoutError extends ApplicationError {}

// Infrastructure errors
class StorageError extends InfrastructureError {}
class QueueConnectionError extends InfrastructureError {}
```

## 8.2 Error Propagation

```
Domain layer: throws typed domain errors
     ↓
Application layer: catches, logs, wraps in application context
     ↓
API layer: maps to HTTP status codes + error response format
     ↓
Frontend: displays user-friendly message, logs to monitoring
```

---

# 9. Performance Guidelines

| Guideline | Threshold |
|-----------|-----------|
| API response time (CRUD) | < 200ms p95 |
| Shot resolution (inheritance + assets) | < 100ms |
| Generation job queuing | < 50ms |
| SSE event delivery latency | < 500ms |
| Database queries per Shot resolution | ≤ 5 |
| Asset list with filters | < 300ms for up to 1000 assets |

---

# 10. Security Checklist

For every endpoint implementation:

- [ ] User is authenticated
- [ ] User is authorized for the target resource (project membership)
- [ ] Input is validated against schema (type, length, enum values)
- [ ] SQL injection prevented (parameterized queries)
- [ ] Rate limit applied (stricter for generation endpoints)
- [ ] Sensitive data (API keys) never returned in responses
- [ ] File uploads validated (type, size, content)

---

# 11. Mock Adapter Implementation (Phase 2)

During Phase 2, video generation uses a Mock Adapter. Every implementation must be compatible with real adapters in Phase 3.

```typescript
// The Mock Adapter implements the same interface as real adapters
class MockGenerationAdapter implements VideoGenerationAdapter {
  readonly provider = 'mock';
  readonly supportedModels = [{ id: 'mock-v1', name: 'Mock (Placeholder)' }];

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    await sleep(2000 + Math.random() * 3000);
    return {
      jobId: `mock-${crypto.randomUUID()}`,
      status: 'completed',
      outputUrl: '/static/placeholder-video.mp4',
      thumbnailUrl: '/static/placeholder-thumbnail.png',
      durationSeconds: request.parameters.duration ?? 5,
      metadata: {
        model: 'mock-v1',
        modelVersion: '1.0.0',
        promptUsed: request.prompt.positive,
        generatedAt: new Date().toISOString(),
        isMock: true,
      },
    };
  }

  async getStatus(_jobId: string): Promise<JobStatus> {
    return { status: 'completed' };
  }

  async cancel(_jobId: string): Promise<void> {}

  getCapabilities(): ModelCapabilities {
    return {
      maxDuration: 120,
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
      supportsImageToVideo: true,
      supportsTextToVideo: true,
    };
  }
}
```

The placeholder video should display the Shot's structured data as text overlay, so the user can verify the entire pipeline from story to "video" is working.

# 12. PR Review Checklist

Before submitting a PR, the code agent should verify:

- [ ] All types match the spec documents exactly (field names, enum values)
- [ ] Branded ID types used (no plain strings for IDs)
- [ ] State machine transitions validated
- [ ] Required Visual Asset Requirements validated before video generation
- [ ] Inheritance resolution tested
- [ ] API responses use DTO pattern (snake_case keys)
- [ ] Error responses follow the standard format
- [ ] Critical test scenarios covered
- [ ] No console.log in production code
- [ ] No hardcoded credentials or API keys
- [ ] Documentation comments on public interfaces
