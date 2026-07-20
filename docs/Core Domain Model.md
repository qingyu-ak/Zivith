# Core Domain Model

> Zivith Core Domain Model
>
> Version: 1.0 (Draft)
>
> Status: Working Draft
>
> Related Documents:
>
> - Design-Philosophy.md
> - Shot-Specification.md
> - Asset-Model.md
> - AI-Agent-Collaboration.md

---

# 1. Purpose

This document defines the core domain model of Zivith.

It does not describe databases, APIs, or implementation details.

Instead, it defines the fundamental creative objects, their responsibilities, ownership relationships, and lifecycle.

Every backend service, frontend module, AI workflow and database schema should be derived from this domain model.

---

# 2. Design Goals

The domain model is designed around five principles.

## Persistent Creativity

Creative assets should survive beyond individual generations.

Generated outputs are temporary.

Creative knowledge is permanent.

---

## Clear Ownership

Every object has exactly one owner.

Ownership determines lifecycle, permissions, and persistence.

---

## Reference Instead of Duplication

Objects should reference reusable resources whenever possible.

Avoid copying data.

Prefer inheritance and override.

---

## AI Native

Every domain object should be understandable by both humans and AI agents.

Objects are designed for structured reasoning, editing and generation.

---

## Progressive Editing

Every AI-generated object should remain editable.

No generated result becomes a dead end.

---

# 3. Creative Hierarchy

Every creative project follows the same hierarchy.

```

Project
↓
Story
↓
Scene
↓
Shot
↓
Video

```

Each layer has a different responsibility.

The hierarchy represents the filmmaking process rather than the generation pipeline.

---

# 4. Core Domain Objects

## Project

### Definition

A Project represents a complete creative universe.

It is the highest-level object inside Zivith.

A Project is not a video project.

It represents an entire IP, world or long-term creative workspace.

---

### Responsibilities

A Project is responsible for:

- world knowledge
- reusable assets
- stories
- workflow settings
- AI configuration
- creative history

---

### Owns

A Project owns:

- Knowledge Base
- Asset Library
- Stories
- Workflow Settings
- Project Metadata

Nothing exists outside a Project.

---

## Story

### Definition

A Story represents one complete narrative unit.

Depending on the project, it may represent:

- one movie
- one episode
- one chapter
- one advertisement
- one MV
- one complete narrative

---

### Responsibilities

Story is responsible for:

- narrative structure
- screenplay
- story progression
- scene organization

---

### Owns

Story owns:

- Scenes

Story never owns Characters or Assets.

Stories reference project assets.

---

## Scene

### Definition

A Scene represents one continuous storytelling environment.

Normally a Scene contains:

- one location
- one atmosphere
- one time period
- one narrative segment

A Scene exists to organize multiple Shots.

---

### Responsibilities

Scene provides shared context.

Examples:

- Location
- Time
- Weather
- Mood
- Participating Characters
- Visual Asset Requirements

Scene also determines which visual assets must be prepared before its Shots are generated. Each requirement specifies:

- `asset_type`: `character` or `location`
- `asset_id`: the referenced Character or Location
- `variant_key`: a scene-specific variant, such as outfit, time of day, weather, or location sub-area
- `required`: whether the visual asset is a prerequisite for video generation
- `reason`: why the reference image must be generated, reused, or regenerated

`voice_only` and `implied` characters do not require character reference images. Project-level primary images for Characters and Locations may be reused; a Scene variant image is needed only when the Scene's visual conditions differ. Props are not part of visual preparation in the first release.

---

### Owns

Scene owns:

- Shots
- Persistent Visual Asset Requirements

Scene references:

- Characters
- Locations
- Assets
- Visual Asset Requirements

---

## Shot

### Definition

Shot is the smallest editable creative unit.

Shot is the core object of the entire system.

Every AI generation eventually becomes a Shot.

---

### Responsibilities

Shot defines one cinematic moment.

It contains everything required to generate one or more videos.

Examples:

- camera
- composition
- action
- dialogue
- emotion
- prompt
- references
- outputs

---

### Owns

Shot owns:

- Prompt State
- Output Versions
- Review Status
- Local Overrides

Shot references:

- Characters
- Locations
- Images
- Audio
- Videos
- Knowledge

---

## Video

### Definition

Video is a generated output.

Video is never the source of truth.

Videos always originate from a Shot.

---

### Responsibilities

Video stores:

- generated result
- generation metadata
- model information
- generation parameters
- version information

---

### Ownership

Video belongs to one Shot.

Videos may have multiple versions.

Only one version may become the active output.

---

# 5. Ownership Rules

Ownership determines persistence.

Every object has exactly one owner.

```

Project
│
├── Resource Space
│
│     ├── Knowledge
│     ├── Characters
│     ├── Locations
│     └── Assets
│
└── Creative Space
      │
      Story
          ↓
      Scene
          ↓
      Shot
          ↓
      Video

```

Ownership never crosses upward.

For example:

- Shot never owns Character.
- Scene never owns Asset.
- Story never owns Knowledge.

Instead, they reference reusable Project resources.

---

# 6. Reference Rules

Reusable resources should always be referenced instead of duplicated.

Examples:

Character
↓

Scene

↓

Shot

Only stores Character ID.

Instead of copying the complete Character object.

The same rule applies to:

- Locations
- Images
- Audio
- Videos
- Documents
- Styles

Reference is the default behavior.

Duplication should only happen when explicitly creating snapshots.

---

# 7. Inheritance & Override

The hierarchy supports inheritance.

```

Project
↓

Story
↓

Scene
↓

Shot

```

Each layer inherits context from its parent.

Examples:

Project

- Knowledge
- Style
- Default Characters

↓

Scene

inherits

↓

Shot

inherits

Shot may override inherited values.

Example:

Scene

Location = Heavenly Palace

↓

Shot

Location = Heavenly Palace

Camera = Close-up

↓

Override

Location = South Gate

Only overridden fields become local.

Everything else continues to inherit.

---

# 8. Approval & Freeze

Creative objects such as Story, Scene, and Shot support review and persist their approval state.

Objects may exist in two major states:

Draft

Approved

Draft objects continue to receive inherited updates.

Approved objects become frozen.

Future Project or Scene modifications will not automatically change Approved objects.

This ensures creative consistency while preserving iterative editing.

Approval represents a creative decision rather than a technical lock.

When an approved Scene is edited, it returns to `draft`. Its affected Visual Asset Requirements return to `pending` and must complete visual review again before new Shots or Videos can be generated. Previously approved Shots and existing Outputs retain snapshots of their creation-time context and are not changed automatically.