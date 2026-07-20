# Shot Specification

> Zivith Shot 详细规格
>
> Version: 1.0
>
> Status: Draft
>
> Related: Core-Domain-Model.md, Design-Philosophy.md, Asset-Model.md

---

# 1. Purpose

This document defines the complete structure of a Shot — the smallest editable creative unit and the core object of Zivith.

Every AI generation operation targets one or more Shots. Every Video originates from a Shot. This specification must be precise enough for both human creators and AI agents to consume without ambiguity.

---

# 2. Shot Lifecycle

A Shot passes through a defined set of states during creation and editing.

```
[Draft] → [Prompting] → [Generating] → [Review] → [Approved]
                ↑              ↓           ↓
                └──── Retry ────┴────── [Draft]
```

| State | Description | Allowed Transitions |
|-------|-------------|---------------------|
| `draft` | Initial state after creation, content not yet finalized | `prompting` |
| `prompting` | AI is building or refining the prompt from Shot fields | `generating`, `draft` |
| `generating` | Video generation is in progress | `review`, `draft` (cancel or final failure) |
| `review` | A completed Output is awaiting human decision | `approved`, `draft` (reject or edit) |
| `approved` | Creative sign-off, Shot is frozen | `draft` only through the explicit `UnfreezeShot` operation |

A Shot in `approved` state is frozen. Subsequent Project or Scene modifications do not automatically propagate to approved Shots. Manual unfreeze is required to return to `draft`.

### Output and Shot State Synchronization

Each `GenerateVideo` call creates an independent Output version. Outputs track provider-job status; a Shot tracks the creative workflow:

- When a job is created, the Shot enters `generating` and its new Output is `queued` or `generating`.
- When any Output completes, the Shot enters `review`.
- When one Output fails, mark that Output `failed`. If the Shot has neither a running job nor a completed Output, return the Shot to `draft` so it can be retried.
- A retry always creates a new Output. Historical Outputs retain the prompt and visual-reference snapshots used for that attempt.
- Only a completed Output in `review` may be approved as the active version. Once the Shot is approved, it no longer inherits upstream changes automatically.

---

# 3. Shot Schema

## 3.1 Identity

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `ShotId` | Yes | System-assigned unique identifier |
| `scene_id` | `SceneId` | Yes | Owning Scene reference |
| `order` | `int` | Yes | Position within Scene (1-based) |
| `label` | `string` | No | Human-readable label, e.g. "Close-up of Sun Wukong drawing his weapon" |
| `state` | `ShotState` | Yes | Current lifecycle state |
| `narrative_mode` | `enum` | No | `present` (default), `flashback`, `memory`, `dream`, `fantasy`. Controls visual treatment in prompt construction. |
| `location_area` | `string` | No | Sub-area within the Scene's Location, e.g. "阁楼门前走廊", "卧室角落" |

## 3.2 Cinematic Specification

These fields define what the camera captures. They form the primary input to prompt construction.

### 3.2.1 Camera

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `camera.shot_type` | `enum` | No | `close_up`, `medium_shot`, `wide_shot`, `extreme_close_up`, `full_shot`, `over_the_shoulder`, `pov`, `aerial`, `dutch_angle` |
| `camera.angle` | `enum` | No | `eye_level`, `low_angle`, `high_angle`, `birds_eye`, `worms_eye` |
| `camera.movement` | `enum` | No | `static`, `pan_left`, `pan_right`, `tilt_up`, `tilt_down`, `dolly_in`, `dolly_out`, `tracking`, `handheld` |
| `camera.focal_length` | `string` | No | e.g. `24mm`, `50mm`, `85mm`, `200mm` |
| `camera.depth_of_field` | `string` | No | `shallow`, `deep` |
| `camera.custom` | `string` | No | Free-text camera override for unsupported specifications |

### 3.2.2 Composition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `composition.framing` | `string` | No | e.g. `rule_of_thirds`, `centered`, `leading_lines` |
| `composition.focus_subject` | `string` | No | What the viewer's eye should be drawn to |
| `composition.foreground` | `string` | No | Foreground elements description |
| `composition.background` | `string` | No | Background elements description |
| `composition.custom` | `string` | No | Free-text composition override |

### 3.2.3 Lighting

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lighting.type` | `enum` | No | `natural`, `studio`, `dramatic`, `silhouette`, `neon`, `golden_hour`, `overcast`, `practical` |
| `lighting.direction` | `enum` | No | `front`, `side`, `back`, `top`, `bottom`, `ambient` |
| `lighting.intensity` | `enum` | No | `bright`, `moderate`, `low`, `high_contrast` |
| `lighting.color_temperature` | `string` | No | `warm`, `cool`, `neutral`, or Kelvin value e.g. `5600K` |
| `lighting.custom` | `string` | No | Free-text lighting override |

### 3.2.4 Color & Mood

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `color.palette` | `string[]` | No | List of dominant colors or palette name, e.g. `["teal", "orange"]` |
| `color.saturation` | `enum` | No | `desaturated`, `natural`, `vibrant`, `hyper_real` |
| `color.contrast` | `enum` | No | `low`, `medium`, `high` |
| `mood` | `string` | No | Emotional tone, e.g. `tense`, `joyful`, `melancholic`, `epic` |

### 3.2.5 Visual Style

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `style.reference` | `StyleId` | No | Reference to a Project-level Style asset |
| `style.aspect_ratio` | `string` | Yes | `16:9`, `9:16`, `1:1`, `4:3`, `21:9` |
| `style.fps` | `int` | No | Target frames per second, default `24` |
| `style.rendering` | `string` | No | `photorealistic`, `anime`, `3d_cgi`, `stop_motion`, `hand_drawn`, `oil_painting`, `pixel_art` |

## 3.3 Character Specification

Characters appearing in this Shot. References Project-level Character assets with optional local overrides.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `characters[].character_id` | `CharacterId` | Yes | Reference to Project Character |
| `characters[].presence` | `enum` | No | `physical` (default), `voice_only`, `implied`. Voice-only for phone calls; implied for photos/memories. |
| `characters[].action` | `string` | No | What the character is doing in this Shot |
| `characters[].emotion` | `string` | No | Emotional state, e.g. `angry`, `calm`, `surprised` |
| `characters[].pose` | `string` | No | Body posture description |
| `characters[].expression` | `string` | No | Facial expression detail |
| `characters[].outfit_override` | `string` | No | Outfit override (inherits from Character if empty) |
| `characters[].position` | `string` | No | Position in frame, e.g. `center`, `left_third`, `background` |

## 3.4 Content

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dialogue.text` | `string` | No | Spoken dialogue text |
| `dialogue.speaker_id` | `CharacterId` | No | Which character speaks |
| `dialogue.style` | `enum` | No | `voice_over`, `on_screen`, `off_screen`, `internal_monologue` |
| `action.description` | `string` | No | Physical action occurring in the Shot |
| `action.duration_hint` | `float` | No | Approximate duration in seconds |

## 3.5 Audio

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio.music_id` | `AssetId` | No | Reference to background music asset |
| `audio.sfx[]` | `AssetId[]` | No | Sound effect references |
| `audio.ambience` | `string` | No | Ambient sound description |
| `audio.volume_music` | `float` | No | Music volume level (0.0–1.0) |
| `audio.volume_sfx` | `float` | No | Sound effects volume level (0.0–1.0) |

## 3.6 Prompt

The `prompt` section is the bridge between structured Shot data and the AI generation model.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt.positive` | `string` | No | The constructed positive prompt |
| `prompt.negative` | `string` | No | Negative prompt / things to avoid |
| `prompt.source` | `enum` | Yes | `auto` (AI-constructed), `manual` (human-written), `hybrid` (AI base + human edit) |
| `prompt.generation_prompt` | `string` | No | The prompt used to instruct the LLM to construct the video prompt |
| `prompt.custom` | `string` | No | Complete manual prompt override |

When `prompt.source` is `auto`, the system constructs `prompt.positive` by composing all structured fields above using a Prompt Template (see Section 5).

## 3.7 Outputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `outputs[].id` | `OutputId` | Yes | Output identifier |
| `outputs[].video_url` | `string` | Yes | URL or path to generated video |
| `outputs[].thumbnail_url` | `string` | No | Thumbnail image |
| `outputs[].model` | `string` | Yes | AI model identifier returned by the selected provider |
| `outputs[].model_version` | `string` | No | Specific model version |
| `outputs[].parameters` | `json` | Yes | Full generation parameters snapshot |
| `outputs[].duration_seconds` | `float` | No | Actual video duration |
| `outputs[].resolution` | `string` | No | e.g. `1920x1080` |
| `outputs[].file_size_bytes` | `int` | No | File size |
| `outputs[].generated_at` | `datetime` | Yes | Generation timestamp |
| `outputs[].is_active` | `bool` | Yes | Whether this is the active output version |
| `outputs[].status` | `enum` | Yes | `queued`, `generating`, `completed`, `failed` |

A Shot may have multiple outputs (versions). Only one is `is_active` at any time. Old versions are retained for history.

---

# 4. Inheritance & Override Rules

Shot inherits context from its parent Scene, which inherits from Story, which inherits from Project.

**Inheritance chain:**

```
Project.defaults
    ↓
Story.overrides
    ↓
Scene.overrides
    ↓
Shot.local
```

**Resolution rule:** When a field is `null` or absent in Shot, look up the chain. The first non-null value wins.

**Override example:**

```
Project.style.rendering = "anime"

Scene 1: style.rendering = null          → inherits "anime"
Scene 2: style.rendering = "3d_cgi"      → overrides to "3d_cgi"

Shot 2.1: style.rendering = null         → inherits "3d_cgi" from Scene 2
Shot 2.2: style.rendering = "oil_painting" → local override
```

**Approved Shots break inheritance.** Once a Shot reaches `approved` state, future changes to parent Scene/Story/Project do not propagate to it. This protects creative decisions from unintended drift.

---

# 5. Prompt Construction

When `prompt.source` is `auto`, the system constructs `prompt.positive` by composing structured fields.

## 5.1 Prompt Template

The default template concatenates fields in priority order:

```
[Camera] [Composition] [Lighting] [Color & Mood]
[Character descriptions with action, emotion, pose]
[Action description]
[Dialogue context]
[Location & Environment context from Scene]
[Style context from Project]
```

## 5.2 Template Configuration

Each Project may define custom prompt templates that control field ordering, weighting, and inclusion logic.

```yaml
prompt_template:
  name: "cinematic_default"
  sections:
    - field: "camera"
      weight: 1.0
      prefix: "Cinematography: "
    - field: "lighting"
      weight: 0.8
      prefix: "Lighting: "
    - field: "characters"
      weight: 1.2
      prefix: ""
    - field: "action"
      weight: 1.0
      prefix: ""
    - field: "dialogue"
      weight: 0.5
      prefix: "Context: "
    - field: "style"
      weight: 0.7
      prefix: "Style: "
```

## 5.3 Negative Prompt Construction

The negative prompt is constructed from Project-level defaults combined with Shot-level overrides:

- Project default negative prompt (`project.defaults.negative_prompt`)
- Per-Shot additional negative tokens (`prompt.negative`)

---

# 6. Validation Rules

A Shot must satisfy these constraints before generation:

| Rule | Severity | Description |
|------|----------|-------------|
| `scene_must_exist` | Error | `scene_id` must reference an existing Scene |
| `at_least_one_content` | Warning | Shot should have at least one of: action, dialogue, or character |
| `aspect_ratio_required` | Error | `style.aspect_ratio` must be set (or inherited) |
| `character_refs_valid` | Error | All `characters[].character_id` must reference existing Characters in the Project |
| `asset_refs_valid` | Warning | Referenced assets should exist |
| `visual_assets_approved` | Error | Every required Character or Location Visual Asset Requirement in the Scene must have an approved binding image. `voice_only` and `implied` characters are excluded. |
| `duration_range` | Warning | `action.duration_hint` should be within model-supported range (typically 2–120 seconds) |

---

# 7. Shot Editor API Surface

The Shot Editor is the primary workspace for humans and AI agents to modify a Shot. The following operations must be supported:

| Operation | Description |
|-----------|-------------|
| `UpdateShot(shot_id, patch)` | Partial update to any Shot field |
| `GeneratePrompt(shot_id)` | AI constructs prompt from structured fields |
| `EditPrompt(shot_id, prompt)` | Direct prompt editing |
| `GenerateVideo(shot_id)` | Validate that required Scene Visual Asset Requirements are approved, then trigger video generation |
| `RegenerateVideo(shot_id, output_id?)` | Regenerate from same Shot, optionally based on a previous output |
| `ApproveShot(shot_id)` | Freeze Shot as `approved` |
| `UnfreezeShot(shot_id)` | Return approved Shot to `draft` |
| `ReorderShot(shot_id, new_order)` | Change Shot position within Scene |
| `DuplicateShot(shot_id)` | Create a copy with `state = draft` |
| `DeleteShot(shot_id)` | Remove Shot and all outputs (soft delete) |
