# AI Agent Collaboration Model

> Zivith AI Agent 协作模型与 Workflow 规范
>
> Version: 1.0
>
> Status: Draft
>
> Related: Core-Domain-Model.md, Shot-Specification.md, Asset-Model.md

---

# 1. Purpose

This document defines the AI Agent architecture for Zivith — what agents exist, what they are responsible for, how they collaborate, and how humans participate in the workflow.

Zivith is not a single AI making videos. It is a coordinated team of specialized agents, each owning one stage of the creative pipeline. The design must support:

- **Sequential workflows**: Story → Scene → Scene review → Visual Prep → visual-assets review → Shot → Prompt → prompt review (mandatory) → Video → review
- **Iterative refinement**: regenerate any stage without restarting the pipeline
- **Human-in-the-loop**: review gates at every stage, configurable automation levels
- **Parallel execution**: independent Shots/Scenes can be processed concurrently
- **Context sharing**: all agents share Project-level knowledge and Assets

---

# 2. Agent Taxonomy

## 2.1 Agent Catalog

| Agent | Responsibility | Input | Output |
|-------|---------------|-------|--------|
| **Story Agent** | Generate or refine narrative structure | Project knowledge, creative brief, user prompt | Story with screenplay structure |
| **Scene Agent** | Decompose Story into Scenes | Story data, Location/Character assets | Ordered Scene list with context |
| **Visual Prep Agent** | Identify, reuse, or generate per-Scene visual requirements | Approved Scene, Character/Location assets, style, references | Reviewed Character/Location key images and Scene variants |
| **Shot Agent** | Decompose Scene into Shots, configure Shot fields | Scene data, Character/Location/Style assets | Configured Shot list |
| **Prompt Agent** | Construct video generation prompts from Shot data | Resolved Shot fields, Prompt Template | Final positive/negative prompt |
| **Generation Agent** | Interface with external video generation model | Prompt, model parameters | Generated Video output |
| **Review Agent** | Analyze generated output, suggest improvements | Generated Video, Shot specification | Review notes, suggested Shot modifications |
| **Asset Agent** | Create and manage Project Assets | User descriptions, reference images | Character, Location, Style, etc. |
| **Orchestrator** | Coordinate workflow, manage state transitions | Workflow configuration, user intent | Orchestrated agent execution plan |

## 2.2 Agent Interface

Every Agent implements the same interface contract:

```typescript
interface Agent<I, O> {
  /** Unique agent identifier */
  readonly id: AgentId;

  /** Human-readable name */
  readonly name: string;

  /** Execute the agent's task */
  execute(input: I, context: AgentContext): Promise<AgentResult<O>>;

  /** Validate input before execution */
  validate(input: I, context: AgentContext): ValidationResult;

  /** Estimate cost/tokens before execution */
  estimate(input: I, context: AgentContext): CostEstimate;
}

interface AgentContext {
  projectId: ProjectId;
  userId: UserId;
  workflowRunId: string;
  previousResults: Map<AgentId, AgentResult<unknown>>;
  automationLevel: AutomationLevel;
}

interface AgentResult<T> {
  status: 'success' | 'partial' | 'failed';
  data?: T;
  warnings: AgentWarning[];
  metadata: {
    agentId: AgentId;
    modelUsed: string;
    tokensUsed: number;
    durationMs: number;
    timestamp: string;
  };
}
```

## 2.3 Automation Levels

Each agent's behavior is modulated by the current `AutomationLevel`:

| Level | Behavior |
|-------|----------|
| `full_manual` | Agent proposes; human must explicitly approve each step |
| `assisted` | Agent executes; human reviews and may override (default) |
| `semi_auto` | Agent executes; human reviews only when confidence is below threshold |
| `full_auto` | Agent executes without human interruption |

Automation level can be configured per-stage. A user might set Story generation to `assisted` while leaving Video generation at `full_manual`.

---

# 3. Primary Workflow: Story to Video

The default creative workflow follows a linear pipeline with review gates.

## 3.1 Pipeline Overview

```
                    ┌─────────────┐
                    │  User Input │
                    └──────┬──────┘
                           ↓
┌──────────────────────────────────────────────────┐
│                  Orchestrator                     │
│    Plans execution, manages state transitions     │
└──────────────────────────────────────────────────┘
                           ↓
              ┌─────────────────────┐
              │    Story Agent      │
              │  Generate/refine    │
              │  narrative          │
              └──────────┬──────────┘
                         ↓
                   ┌───────────┐
                   │  Review   │ ← Human decision gate
                   └─────┬─────┘
                         ↓
              ┌─────────────────────┐
              │    Scene Agent      │
              │  Story → Scenes     │
              └──────────┬──────────┘
                         ↓
                   ┌───────────┐
                   │Scene review│ ← Human decision gate
                   └─────┬─────┘
                         ↓
              ┌─────────────────────┐
              │ Visual Prep Agent   │
              │ Scene → visual reqs │
              │ (reuse / generate)  │
              └──────────┬──────────┘
                         ↓
                   ┌───────────────┐
                   │Visual-assets  │ ← Required approval gate
                   │    review     │
                   └──────┬────────┘
                          ↓
              ┌─────────────────────┐
              │    Shot Agent       │
              │  Scene → Shots      │
              │  (per Scene)        │
              └──────────┬──────────┘
                         ↓
                   ┌───────────┐
                   │  Review   │ ← Human decision gate
                   └─────┬─────┘
                         ↓
              ┌─────────────────────┐
              │   Prompt Agent      │
              │  Shot → Prompt      │
              │  (per Shot)         │
              └──────────┬──────────┘
                         ↓
                   ┌───────────┐
                   │  Review   │ ← Mandatory prompt review gate
                   └─────┬─────┘
                         ↓
              ┌─────────────────────┐
              │ Generation Agent    │
              │  Prompt → Video     │
              │  (per Shot)         │
              └──────────┬──────────┘
                         ↓
                   ┌───────────┐
                   │  Review   │ ← Human decision gate
                   └─────┬─────┘
                         ↓
                   ┌───────────┐
                   │ Approved  │
                   └───────────┘
```

## 3.2 Stage Details

### Stage 1: Story Generation

**Trigger:** User provides creative brief or selects "Generate Story"

**Story Agent input:**
```yaml
project_id: "proj_abc"
brief: "A 3-minute sci-fi short about a robot discovering nature"
tone: "hopeful, contemplative"
target_duration_seconds: 180
reference_stories: []  # Optional existing stories for style reference
constraints:
  max_characters: 3
  language: "en"
```

**Story Agent output:**
```yaml
story:
  title: "The Last Seed"
  logline: "A maintenance robot on a dead Earth discovers the planet's final living seed."
  synopsis: "..."
  genre: "science_fiction"
  theme: "hope"
  tone: "contemplative"
  screenplay: "INT. DEAD CITY - DAY\n..."
  # Optional (ADR-0006 / V0.4 W3): persisted StorySegment drafts for chapter-wise review
  segments:
    - title: "The Gray World"
      synopsis: "Robot R-7 performs routine maintenance in an abandoned city."
      draft: "INT. DEAD CITY - DAY\nR-7 sweeps dust from silent solar panels."
    - title: "Discovery"
      synopsis: "R-7 finds a glowing seedling in a collapsed greenhouse."
      draft: "INT. GREENHOUSE - DAY\nA single green shoot breaks through concrete."
    - title: "Guardian"
      synopsis: "R-7 protects the seedling from a scavenger drone."
      draft: "EXT. GREENHOUSE ROOF - DUSK\nR-7 raises a welding torch as a shield."
```

**Review gate:** User reviews story structure, logline, and (when present) each persisted StorySegment. Segments can be approved or rewritten independently; the story gate completes only after every segment is approved (or when the story has zero segments — legacy single-block review).

### Stage 2: Scene Decomposition

**Scene Agent input:**
```yaml
story_id: "story_seed"
project_id: "proj_abc"
automation_level: "assisted"
```

**Scene Agent output:**
```yaml
scenes:
  - order: 1
    label: "Dawn Patrol"
    location_id: "loc_city"
    time: "early_morning"
    mood: "melancholic, quiet"
    summary: "R-7 begins its daily maintenance routine..."
    characters: ["char_r7"]
    estimated_shots: 4
    estimated_duration_seconds: 25
  - order: 2
    label: "The Anomaly"
    location_id: "loc_city"
    time: "mid_morning"
    mood: "curious, unsettling"
    summary: "R-7 detects an unusual life-sign reading..."
    characters: ["char_r7"]
    estimated_shots: 5
    estimated_duration_seconds: 35
  # ... more scenes
```

### Stage 3: Visual Preparation

The Visual Prep Agent runs per Scene after Scene review. It evaluates the Scene's characters, location, time, weather, mood, and sub-location against approved Project assets, then recommends reusing or generating the required visuals. `voice_only` and `implied` characters do not require character images.

```yaml
visual_requirements:
  - asset_type: "character"
    asset_id: "char_r7"
    variant_key: "default"
    required: true
    reason: "First on-screen appearance; no reusable approved key image exists"
  - asset_type: "location"
    asset_id: "loc_city"
    variant_key: "early_morning_melancholic"
    required: true
    reason: "The Scene needs an environmental reference for the abandoned city at dawn"
```

Each required visual must have exactly one approved `approved_media_id`. The Shot Agent and Video generation are blocked until all required visual requirements are approved.

### Stage 4: Shot Decomposition

**Shot Agent input:**
```yaml
scene_id: "scene_1"
project_id: "proj_abc"
automation_level: "assisted"
```

**Shot Agent output:**
```yaml
shots:
  - order: 1
    label: "Establishing wide shot of abandoned city"
    camera:
      shot_type: "wide_shot"
      angle: "high_angle"
      movement: "static"
    composition:
      framing: "rule_of_thirds"
      focus_subject: "The empty city skyline"
    lighting:
      type: "natural"
      direction: "front"
      intensity: "low"
    mood: "melancholic"
    characters: []
    action:
      description: "Dust particles float through morning light. Nothing moves."
      duration_hint: 5.0
  - order: 2
    label: "R-7 emerges from maintenance hatch"
    camera:
      shot_type: "medium_shot"
      angle: "eye_level"
      movement: "tilt_up"
    characters:
      - character_id: "char_r7"
        action: "Climbing out of a ground-level maintenance hatch"
        emotion: "neutral"
        position: "center"
    action:
      description: "R-7's optical sensors adjust to the morning light."
      duration_hint: 4.0
  # ... more shots
```

### Stage 5: Prompt Construction

**Prompt Agent input:**
```yaml
shot_id: "shot_scene1_2"
project_id: "proj_abc"
prompt_template: "cinematic_default"
```

The Prompt Agent resolves all inherited values, applies Character/Location/Style references, and constructs the final prompt using the configured Prompt Template. See Shot-Specification.md §5 for the complete prompt construction process.

### Stage 6: Mandatory Prompt Review

Every generated or edited prompt must be explicitly reviewed before video generation. The reviewer may approve, edit, reject, or request regeneration. Automation settings cannot bypass this gate.

### Stage 7: Video Generation

**Generation Agent input:**
```yaml
shot_id: "shot_scene1_2"
prompt_positive: "Cinematography: medium shot, eye level, tilt up movement. Lighting: natural front light, low intensity, warm. A humanoid maintenance robot with weathered steel plating climbs out of a ground-level hatch in an abandoned city. Dust particles float in golden morning light. Style: photorealistic, cinematic color grading with teal and orange palette."
prompt_negative: "cartoon, anime, low quality, blurry, text, watermark"
model: "kling"
parameters:
  duration: 4.0
  aspect_ratio: "16:9"
  fps: 24
```

### Stage 8: Video Review

After generation, the Review Agent may optionally analyze the output and provide structured feedback:

```yaml
review:
  shot_id: "shot_scene1_2"
  output_id: "out_xyz"
  passed: true
  issues:
    - severity: "minor"
      field: "camera.movement"
      observation: "Tilt-up movement is barely perceptible. Consider increasing movement amplitude or switching to static."
      suggestion: "Change camera.movement to 'static' or add custom instruction: 'smooth slow tilt-up from ground to eye level'"
    - severity: "info"
      field: "lighting.color_temperature"
      observation: "Generated lighting appears cool (bluish) despite 'warm' specification."
      suggestion: "Adjust prompt to emphasize 'warm golden morning light, 3200K'"
  overall_quality: 0.85
```

---

# 4. Iterative Refinement Workflow

The pipeline supports partial regeneration from any stage.

## 4.1 Regeneration Scenarios

| Trigger | Scope | Behavior |
|---------|-------|----------|
| User edits a Shot's camera field | That Shot only | Re-runs Prompt Agent → Generation Agent for the affected Shot |
| User adds a new Character to Project | All non-approved Shots referencing that Scene | Re-runs Prompt Agent → Generation Agent for affected Shots |
| User modifies a Scene's Location | All non-approved Shots in that Scene | Re-runs Prompt Agent → Generation Agent for all Scene Shots |
| User modifies a Scene's location, time, weather, mood, characters, or sub-location | That Scene's visual requirements | Mark affected requirements `pending`; rerun Visual Prep and obtain approval before new video generation |
| User rewrites Story structure | All downstream non-approved objects | Re-runs Scene Agent → Shot Agent → Prompt Agent → Generation Agent |
| User changes Project Style | All non-approved Shots in Project | Re-runs Prompt Agent → Generation Agent for all affected Shots |
| User edits a prompt directly | That Shot only | Re-runs Generation Agent for that Shot |

## 4.2 Change Propagation

```
Project.Style changed
    ↓
Affected Stories: all
    ↓
Affected Scenes: all (inherit Style from Project)
    ↓
Affected Shots: all non-approved Shots
    ↓
Action: regenerate prompts → regenerate videos
```

The system tracks which Shot fields are inherited vs. locally overridden. Only inherited fields are affected by upstream changes.

---

# 5. Parallel Execution Model

Independent Shots and Scenes can be processed concurrently.

## 5.1 Parallelism Boundaries

| Level | Can Parallelize? | Reason |
|-------|------------------|--------|
| Stories within Project | Yes | Stories are independent |
| Scenes within Story | Yes, after all Scenes are defined | Scene definitions are independent once Story is set |
| Shots within Scene | Yes, after all Shots are defined | Shot definitions are independent once Scene is set |
| Prompt construction across Shots | Yes | Each Shot's prompt is independently resolved |
| Visual preparation across approved Scenes | Yes | Each Scene's requirements and candidate visuals are independent |
| Video generation across Shots | Yes | Generation calls are independent API requests |

## 5.2 Parallel Execution Plan

```
Story Agent completes → produces N Scenes
                           ↓
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
   Scene Agent        Scene Agent        Scene Agent
   (Scene 1)          (Scene 2)          (Scene N)
        ↓                  ↓                  ↓
 Visual Prep Agent  Visual Prep Agent  Visual Prep Agent
   (M Shots)          (K Shots)          (P Shots)
        ↓                  ↓                  ↓
   Shot Agent         Shot Agent         Shot Agent
        ↓                  ↓                  ↓
   ┌────┼────┐       ┌────┼────┐       ┌────┼────┐
   ↓    ↓    ↓       ↓    ↓    ↓       ↓    ↓    ↓
  P-A  P-A  P-A     P-A  P-A  P-A     P-A  P-A  P-A
   ↓    ↓    ↓       ↓    ↓    ↓       ↓    ↓    ↓
  G-A  G-A  G-A     G-A  G-A  G-A     G-A  G-A  G-A
```

P-A = Prompt Agent, G-A = Generation Agent

---

# 6. Agent-to-Agent Communication

Agents communicate through the shared workflow context, never directly.

## 6.1 Shared Context Bus

```typescript
interface WorkflowContext {
  runId: string;
  projectId: ProjectId;
  userId: UserId;
  startedAt: string;
  agentResults: Record<AgentId, AgentResult<unknown>>;
  artifacts: {
    story?: Story;
    scenes: Record<SceneId, Scene>;
    shots: Record<ShotId, Shot>;
    generatedOutputs: Record<ShotId, Output[]>;
    reviews: Record<ShotId, Review[]>;
  };
  state: WorkflowState;
  errors: WorkflowError[];
}
```

## 6.2 Agent Execution Order

The Orchestrator determines execution order based on the workflow DAG:

```yaml
workflow:
  name: "story_to_video"
  stages:
    - agent: "story_agent"
      depends_on: []
      review_gate: true
    - agent: "scene_agent"
      depends_on: ["story_agent"]
      review_gate: true
    - agent: "visual_prep_agent"
      depends_on: ["scene_agent"]
      review_gate: true
      parallel: "per_scene"
    - agent: "shot_agent"
      depends_on: ["visual_prep_agent"]
      review_gate: true
      parallel: "per_scene"
    - agent: "prompt_agent"
      depends_on: ["shot_agent"]
      review_gate: true
      review_required: true
      parallel: "per_shot"
    - agent: "generation_agent"
      depends_on: ["prompt_agent"]
      review_gate: true
      parallel: "per_shot"
      rate_limit:
        max_concurrent: 3
        delay_between_ms: 2000
```

---

# 7. Human-in-the-Loop Integration

## 7.1 Review Gate Configuration

```yaml
review_gates:
  story:
    enabled: true
    automation: "assisted"
    auto_approve_if:
      confidence_threshold: 0.9
  scene:
    enabled: true
    automation: "semi_auto"
    auto_approve_if:
      confidence_threshold: 0.85
  visual_assets:
    enabled: true
    automation: "assisted"
  shot:
    enabled: true
    automation: "assisted"
  prompt:
    enabled: true
    automation: "full_manual"
    required: true
  video:
    enabled: true
    automation: "full_manual"
```

## 7.2 Review Actions

At each review gate, the user can:

| Action | Effect |
|--------|--------|
| `approve` | Accept and proceed to next stage |
| `approve_all` | Accept all items at this stage, skip individual review |
| `reject` | Return to previous stage for regeneration |
| `edit` | Manually modify before approving |
| `retry` | Regenerate with same input |
| `retry_with_feedback` | Provide natural-language feedback, regenerate with modified input |

## 7.3 Feedback Loop

User feedback at any review gate is injected into the Agent's context for the retry:

```yaml
retry_with_feedback:
  shot_id: "shot_scene1_2"
  feedback: "Make the robot look more weathered, with visible rust and scratches. The morning light should be warmer."
```

This feedback is passed to the Prompt Agent as additional context, which adjusts the prompt accordingly.

---

# 8. Error Handling & Recovery

## 8.1 Agent-Level Errors

| Error Type | Behavior |
|------------|----------|
| `validation_error` | Block execution, return to user with details |
| `generation_timeout` | Retry up to 3 times with exponential backoff |
| `generation_failed` | Log error, mark Shot output as `failed`, allow retry |
| `model_unavailable` | Queue for retry, notify user after 5 minutes of unavailability |
| `rate_limited` | Respect retry-after headers, continue other parallel tasks |
| `context_overflow` | Truncate context by summarizing earlier stages, retry |

## 8.2 Workflow-Level Recovery

| Scenario | Recovery |
|----------|----------|
| Orchestrator crash mid-workflow | Workflow state is persisted; resume from last completed agent |
| Partial parallel failure | Failed branches are retried; successful branches are preserved |
| User aborts workflow | All completed artifacts are saved; workflow can be resumed |

---

# 9. Agent Configuration per Project

Each Project stores its own Agent configuration, allowing different creative styles:

```yaml
project:
  id: "proj_abc"
  agent_config:
    story_agent:
      provider: "deepseek"
      model: "<configured-deepseek-model>"
      system_prompt_override: null
      temperature: 0.8
      max_tokens: 8000
    scene_agent:
      provider: "deepseek"
      model: "<configured-deepseek-model>"
      temperature: 0.7
    visual_prep_agent:
      image_provider: "tongyi_wanxiang"
      image_model: "<configured-wanxiang-model>"
      review_required: true
    shot_agent:
      provider: "deepseek"
      model: "<configured-deepseek-model>"
      temperature: 0.6
      default_shot_duration: 5.0
    prompt_agent:
      provider: "deepseek"
      model: "<configured-deepseek-model>"
      temperature: 0.5
      prompt_template_id: "tmpl_cinematic"
    generation_agent:
      provider: "kling"
      model: "kling"
      default_duration: 5
      default_aspect_ratio: "16:9"
      max_concurrent: 3
    review_agent:
      provider: "deepseek"
      model: "<configured-deepseek-model>"
      enabled: true
      auto_fix_minor_issues: true
```

---

# 10. Asset Agent and Visual Prep Agent: Specialized Workflows

The Asset Agent operates outside the main Story→Video pipeline. It is invoked when the user wants to create or refine Project Assets.

```
User describes Character → Asset Agent generates Character → User reviews/refines
User uploads reference image → Asset Agent extracts visual traits → User reviews
User provides world lore → Asset Agent structures Knowledge → User reviews
```

The Asset Agent can also be invoked contextually during the main workflow. If the Shot Agent determines a needed Character does not exist, it prompts the user: "This Scene requires a character 'Forest Spirit'. Create one now?" — which triggers the Asset Agent in-line.

The Visual Prep Agent runs after Scene review. It compares the Scene requirements with existing `reference_images[]`, produces a per-Scene list of visuals to reuse or generate, and writes each approved Media item back to the Asset's key image or the Scene variant. It must complete its required approval gate before the Shot Agent can begin.
