# Asset Model

> Zivith 素材与资源模型
>
> Version: 1.1
>
> Status: Active — synced 2026-07-28 (turnaround sheet, location sheet, provider matrix, cover resolution)
>
> Related: Core-Domain-Model.md, Design-Philosophy.md, Shot-Specification.md, architecture/entity-state-timeline-track.md, Next-Tasks.md

---

# 1. Purpose

This document defines the complete Asset taxonomy and lifecycle for Zivith.

Assets are persistent, reusable creative resources owned by a Project. They serve as building blocks for Stories, Scenes, and Shots, and can be shared across multiple creative contexts within the same Project.

The Asset layer is designed around two key design goals:

- **Reuse**: an Asset created once should be usable across any Story within the same Project
- **Consistency**: referencing Assets by ID ensures visual and contextual continuity across the entire creative universe

---

# 2. Asset Taxonomy

## 2.1 Top-Level Classification

Every Asset belongs to exactly one top-level category.

| Category | Description | Examples |
|----------|-------------|----------|
| `character` | A person, creature, or entity that appears in Shots | Sun Wukong, a robot, a talking animal |
| `location` | A physical place or environment | Heavenly Palace, a coffee shop, a forest |
| `prop` | A physical object used in scenes | A sword, a book, a spaceship |
| `style` | A visual style configuration | Anime style, film noir, watercolor |
| `media` | Raw media files | Images, videos, audio clips, 3D models |
| `knowledge` | Structured world-building information | Lore documents, relationship graphs, world rules |
| `prompt_template` | Reusable prompt construction templates | Cinematic default, product commercial template |

## 2.2 Character

The most complex Asset type. Characters must maintain visual consistency across all Shots they appear in.

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `CharacterId` | Yes | Unique identifier |
| `project_id` | `ProjectId` | Yes | Owning Project |
| `name` | `string` | Yes | Character name |
| `aliases[]` | `string[]` | No | Alternative names / nicknames |
| `description` | `string` | Yes | Detailed character description for AI prompt context |
| `base_character_id` | `CharacterId` | No | For doppelganger/twin characters: inherits appearance from another Character, only overrides what differs. Used for characters that share the same face. |
| `appearance` | `object` | Yes | Physical appearance specification (partial if `base_character_id` is set — unspecified fields inherit) |
| `personality` | `string` | No | Personality traits for consistent behavior portrayal |
| `default_outfit` | `string` | No | Default clothing / costume description |
| `reference_images[]` | `MediaId[]` | No | Reference images for visual consistency. During video generation, these images are passed as image-to-video conditioning input to maintain character appearance across Shots. |
| `voice_profile_id` | `AssetId` | No | Reference to voice profile if voice cloning is used |
| `tags[]` | `string[]` | No | Searchable tags |
| `metadata` | `json` | No | Extensible metadata |

### Appearance Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `appearance.gender` | `string` | No | Gender presentation |
| `appearance.age_range` | `string` | No | e.g. `young_adult`, `middle_aged`, `elderly` |
| `appearance.height` | `string` | No | Relative height, e.g. `tall`, `average`, `short` |
| `appearance.build` | `string` | No | Body type, e.g. `athletic`, `slender`, `stocky` |
| `appearance.skin_tone` | `string` | No | Skin tone description |
| `appearance.hair` | `string` | No | Hair style and color |
| `appearance.eyes` | `string` | No | Eye color and characteristics |
| `appearance.distinguishing_features` | `string` | No | Unique identifying features (scars, tattoos, etc.) |
| `appearance.custom` | `string` | No | Free-text override for anything not captured above |

### Appearance Variants (V0.4 W2 — implemented)

Consistency is anchored per **character × narrative state**, not per character. A Character owns an ordered list of `AppearanceVariant`s (table `asset_appearance_variants`; see [V0.4-Modification-Plan.md](V0.4-Modification-Plan.md) W2, adopted from the [waoowaoo review](architecture/review/Zivith-Architecture-Review-Based-on-waoowaoo.md) A1):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | Yes | Stable semantic key, unique per Character, e.g. `default`, `wounded`, `young` |
| `title` | `string` | Yes | Display name (Chinese UI) |
| `change_reason` | `string` | No | Narrative reason for the appearance change |
| `description` | `string` | No | Appearance delta, merged over the Character's base `appearance` at read time |
| `anchor_media_id` | `MediaId` | No | The approved anchor image for this variant — the reference injected at image generation |
| `candidate_media_ids[]` | `MediaId[]` | No | Generated candidates awaiting selection |
| `state` | `enum` | Yes | Approval state (same enum as other reviewable entities) |

Every character receives a `default` variant on create (existing characters backfilled by migration), plus a reserved **multi-view design sheet** slot `sheet_turnaround`.

### Character design sheet (`sheet_turnaround`)

| Rule | Detail |
|------|--------|
| Shape | **One T2I image**, not four API calls — required **2×2** layout: full-body front / side / back + a **dedicated large head-and-shoulders face close-up** panel (not a tiny corner crop) |
| Prompt flow | Visual Prep / asset page **drafts** English prompt from screenplay + description → operator **reviews** → then T2I |
| Generation | Always **T2I** for the primary sheet (no I2I conditioning on placeholders) |
| Cover | Successful generate prepends the sheet Media to Asset `reference_images[]`; list/detail APIs expose resolved `cover_image` with usable `url` / `access_url` |
| Legacy | Keys `sheet_front` / `sheet_side` / `sheet_back` / `sheet_face` remain readable but are **deprecated** |

**Asset-library APIs (character):**

| Method | Path | Purpose |
|--------|------|---------|
| `GET/POST` | `/assets/:id/appearance-variants` | List / create narrative variants |
| `PATCH/DELETE` | `/assets/:id/appearance-variants/:key` | Update / soft-delete |
| `POST` | `/assets/:id/appearance-variants/:key/generate` | Generate candidates for one variant |
| `POST` | `/assets/:id/appearance-variants/:key/approve` | Approve selected candidate as anchor |
| `POST` | `/assets/:id/appearance-variants/draft-sheet-prompt` | LLM drafts `sheet_turnaround` prompt only |
| `POST` | `/assets/:id/appearance-variants/generate-sheet` | Single turnaround T2I; sets cover |
| `DELETE` | `/assets/:id/appearance-variants/:key/candidates/:mediaId` | Soft-delete one history candidate |

**UI:** List at `/projects/:pid/assets` → click opens detail `/projects/:pid/assets/:assetId` (no side panel). Sheet controls live on the character detail page.

Visual Prep **drafts** sheet + scene prompts from screenplay and **does not** auto-call image APIs. Operator generates sheets in the asset library, then generates scene keyframes one card at a time in WorkflowPanel. Visual Prep approve syncs `variant_key` → matching variant `anchor_media_id` when the key exists. Regenerating appends to `candidate_media_ids` and does not remove prior Media unless the user deletes a candidate. Reference-image injection prefers `sheet_turnaround` then legacy sheet anchors, then `reference_images[0]` (http(s) URLs only).

**Note:** Story-to-video workflow「角色关键图」are **scene-context keyframes** under Visual Prep, not the asset-library design sheet. Generate the multi-view sheet on the Character **detail** page first for identity consistency.

### Provider model matrix (SiliconFlow — implemented)

| Slot | Env / models field | Default | When used |
|------|--------------------|---------|-----------|
| Text-to-image (T2I) | `SILICONFLOW_IMAGE_MODEL` / `image` | `Qwen/Qwen-Image` | First sheet / keyframe without usable refs |
| Text+image-to-image (I2I) | `SILICONFLOW_IMAGE_I2I_MODEL` / `image_i2i` | `Qwen/Qwen-Image-Edit` | Has http(s) reference; **falls back to T2I** on provider 4xx/5xx (e.g. 50507) |
| Text-to-video (T2V) | `SILICONFLOW_VIDEO_MODEL` / `video` | `Wan-AI/Wan2.2-T2V-A14B` | No http(s) reference frame |
| Image-to-video (I2V) | `SILICONFLOW_VIDEO_I2V_MODEL` / `video_i2v` | `Wan-AI/Wan2.2-I2V-A14B` | Has http(s) reference frame |

Runtime Provider panel exposes the four image/video slots. Rebuild `@zivith/domain` after changing exported sheet constants.

## 2.3 Location

A Location represents a physical place. Locations provide shared environmental context for all Shots within a Scene that references them.

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `LocationId` | Yes | Unique identifier |
| `project_id` | `ProjectId` | Yes | Owning Project |
| `name` | `string` | Yes | Location name |
| `description` | `string` | Yes | Detailed description for AI prompt context |
| `type` | `enum` | No | `interior`, `exterior`, `fantasy`, `scifi`, `modern`, `historical`, `abstract` |
| `time_period` | `string` | No | e.g. `modern_day`, `1920s`, `ancient_china`, `distant_future` |
| `weather_default` | `string` | No | Default weather, e.g. `sunny`, `rainy`, `foggy` |
| `lighting_default` | `string` | No | Default lighting, e.g. `natural_daylight`, `candlelit` |
| `mood_default` | `string` | No | Default atmosphere |
| `reference_images[]` | `MediaId[]` | No | Reference images; list/detail APIs **resolve** them to Media DTOs with `url` / `access_url` (bare IDs are not valid `<img src>`) |
| `floor_plan_url` | `string` | No | Optional floor plan for interior locations |
| `tags[]` | `string[]` | No | Searchable tags |

### Location design sheet (`location_sheet`)

Locations do **not** use `AppearanceVariant` slots. The design sheet is a single multi-angle T2I image stored as the asset cover / first `reference_images[]` entry; the draft prompt lives at `asset.data.visual.generation_prompts.location_sheet`.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/assets/:id/location-sheet/draft-prompt` | LLM drafts multi-angle environment prompt |
| `POST` | `/assets/:id/location-sheet/generate` | T2I once; prepends Media to `reference_images` as cover |

**UI:** Location detail page「地点设定表」— draft → review → generate (same pattern as character turnaround).

**List / detail cover:** `GET /projects/:pid/assets` and `GET /assets/:id` return `cover_image` (preferred sheet or first reference) plus resolved `reference_images[]` Media objects.

## 2.4 Prop

A Prop is a physical object that may appear in Shots.

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `PropId` | Yes | Unique identifier |
| `project_id` | `ProjectId` | Yes | Owning Project |
| `name` | `string` | Yes | Prop name |
| `description` | `string` | Yes | Detailed description for AI prompt context |
| `category` | `enum` | No | `weapon`, `tool`, `vehicle`, `furniture`, `decoration`, `consumable`, `technology`, `magical`, `other` |
| `reference_images[]` | `MediaId[]` | No | Reference images |
| `tags[]` | `string[]` | No | Searchable tags |

## 2.5 Style

A Style defines visual presentation settings that can be applied at any level of the creative hierarchy.

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `StyleId` | Yes | Unique identifier |
| `project_id` | `ProjectId` | Yes | Owning Project |
| `name` | `string` | Yes | Style name, e.g. "Studio Ghibli Inspired" |
| `rendering` | `string` | No | `photorealistic`, `anime`, `3d_cgi`, `stop_motion`, `hand_drawn`, `oil_painting`, `pixel_art` |
| `color_palette[]` | `string[]` | No | Default color palette |
| `saturation` | `string` | No | `desaturated`, `natural`, `vibrant`, `hyper_real` |
| `contrast` | `string` | No | `low`, `medium`, `high` |
| `aspect_ratio` | `string` | No | `16:9`, `9:16`, `1:1`, `4:3`, `21:9` |
| `fps` | `int` | No | Default frames per second |
| `negative_prompt` | `string` | No | Default negative prompt tokens |
| `reference_images[]` | `MediaId[]` | No | Style reference images |
| `prompt_prefix` | `string` | No | Prepend to every prompt when this style is active |
| `prompt_suffix` | `string` | No | Append to every prompt when this style is active |

## 2.6 Media

Media assets are binary files uploaded to or generated within the Project.

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `MediaId` | Yes | Unique identifier |
| `project_id` | `ProjectId` | Yes | Owning Project |
| `name` | `string` | Yes | Display name |
| `media_type` | `enum` | Yes | `image`, `video`, `audio`, `3d_model`, `document` |
| `mime_type` | `string` | Yes | e.g. `image/png`, `video/mp4` |
| `url` | `string` | Yes | Storage URL |
| `thumbnail_url` | `string` | No | Thumbnail for media browser |
| `file_size_bytes` | `int` | No | File size |
| `resolution` | `string` | No | For images/video, e.g. `1920x1080` |
| `duration_seconds` | `float` | No | For video/audio |
| `source` | `enum` | Yes | `uploaded`, `generated`, `imported` |
| `generation_metadata` | `json` | No | If generated: model, prompt, parameters |
| `tags[]` | `string[]` | No | Searchable tags |

## 2.7 Scene Visual Asset Bindings

`VisualAssetRequirement` is a persistent entity in a Scene's visual-preparation phase. It does not replace project-level Character or Location Assets; it records the specific primary-image or variant-image requirement for an Asset in one Scene, together with its review outcome.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `VisualAssetRequirementId` | Yes | Unique identifier |
| `scene_id` | `SceneId` | Yes | Owning Scene |
| `asset_type` | `enum` | Yes | `character` or `location` in the first release; Props are excluded from visual preparation |
| `asset_id` | `AssetId` | Yes | Referenced Character or Location |
| `variant_key` | `string` | Yes | Stable Scene variant key, e.g. `default`, `midnight_moonlight`, or `attic_corridor`. From V0.4 (plan W2): when the key matches a Character `AppearanceVariant.key`, that variant's anchor image is the preferred generation reference; unmatched free-form keys stay valid for backward compatibility |
| `required` | `boolean` | Yes | Whether this is a prerequisite for generating the Scene's Shots |
| `reason` | `string` | Yes | Why the image must be generated, reused, or regenerated |
| `status` | `enum` | Yes | `pending`, `generating`, `review`, `approved`, or `rejected` |
| `candidate_media_ids[]` | `MediaId[]` | No | Candidate images awaiting review |
| `approved_media_id` | `MediaId` | No | The single image selected for this Scene |
| `generation_job_id` | `ImageGenerationJobId` | No | Current or most recent image-generation job |
| `version` | `int` | Yes | Optimistic-lock version used to prevent concurrent overwrites after Scene changes |

**Selection rules:**

1. Video generation first uses an `approved_media_id` from an `approved` binding in the same Scene.
2. Only when the Scene has no approved binding may it fall back to the Character or Location Asset's project-level primary `reference_images[]`.
3. `voice_only` and `implied` characters do not create character bindings. In the first release, important Props remain prompt context only and do not create bindings.
4. Changes to a Scene's Location, time, weather, mood, participating characters, or location sub-area return affected bindings to `pending`. Approved Shots and existing Outputs retain their creation-time Media snapshots.

**Reference-image injection (V0.4 W1 — implemented):** Image generation requests may carry labeled `reference_images` resolved as AppearanceVariant `anchor_media_id` (when `variant_key` matches) → prefer `sheet_turnaround` → else Asset `reference_images[0]` (**http(s) only**; `data:` / SVG placeholders are skipped). Adapters declare `supportsReferenceImages`; when the selected model cannot condition on images, generation continues without injection and `generation_metadata.reference_injection` is set to `skipped_unsupported` (UI shows「本次未注入参考图」). When I2I is selected but the provider returns 4xx/5xx (e.g. SiliconFlow `50507`), the pipeline **retries T2I** and records `skipped_i2i_error`. Applied injections record `reference_media_ids[]` on Media metadata. Video image-to-video uses Scene approved binding Media URLs (rule 1), not raw Media IDs.

## 2.8 Knowledge

Knowledge assets store structured world-building information used to maintain narrative consistency.

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `KnowledgeId` | Yes | Unique identifier |
| `project_id` | `ProjectId` | Yes | Owning Project |
| `name` | `string` | Yes | Knowledge entry name |
| `category` | `enum` | Yes | `lore`, `world_rule`, `relationship`, `timeline_event`, `glossary`, `style_guide`, `custom` |
| `content` | `text` | Yes | Structured knowledge content (Markdown) |
| `related_assets[]` | `AssetId[]` | No | Related Characters, Locations, etc. |
| `tags[]` | `string[]` | No | Searchable tags |

## 2.9 Prompt Template

Prompt Templates are reusable configurations that control how structured Shot data is composed into video generation prompts.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `TemplateId` | Yes | Unique identifier |
| `project_id` | `ProjectId` | Yes | Owning Project |
| `name` | `string` | Yes | Template name |
| `description` | `string` | No | When to use this template |
| `sections[]` | `object[]` | Yes | Ordered list of sections (see Shot-Specification.md §5.2) |
| `system_prompt` | `string` | No | LLM system prompt for prompt construction |

---

# 3. Asset Lifecycle

Every Asset follows the same lifecycle:

```
[Draft] → [Active] → [Archived]
```

| State | Description |
|-------|-------------|
| `draft` | Being created or edited, not yet available for use in Shots |
| `active` | Available for use across all Stories in the Project |
| `archived` | Hidden from default views, but preserved for historical Shots that reference it |

**Transition rules:**

- `draft` → `active`: Asset is complete and ready for use
- `active` → `draft`: Return to editing (affects inheriting Shots that have not been approved)
- `active` → `archived`: Retire from active use
- `archived` → `active`: Restore to active use

Archived Assets remain accessible to Shots that already reference them. Archived Characters cannot be added to new Shots.

An Asset being `active` means it is available for reference; it is not visual approval. Whether an image may be used for a specific Scene is determined by `VisualAssetRequirement.status: approved`.

---

# 4. Asset Ownership & Sharing

## 4.1 Project Ownership

All Assets belong to exactly one Project. Assets are not shared across Projects.

A future version may introduce a "Global Asset Library" where users can publish Assets across Projects, but v1 enforces Project-scoped ownership.

## 4.2 Reference Model

Assets are always referenced by ID. When a Shot references a Character, it stores the `CharacterId`, not a copy of the Character data.

```
Shot.characters[0].character_id = "char_abc123"
```

When rendering the Shot or constructing its prompt, the system resolves the reference and applies any local overrides.

## 4.3 Impact of Asset Modification

When an Asset is modified:

| Asset State | Impact on Referencing Shots |
|-------------|----------------------------|
| `active` Asset modified | All non-approved Shots automatically reflect the change on next generation |
| `active` Asset modified | Approved Shots are unaffected (they are frozen) |
| `archived` Asset | Existing references continue to resolve; new references are blocked |

Under the proposed [Entity + State + Timeline + Track](architecture/entity-state-timeline-track.md) architecture, an Asset or AppearanceVariant update also creates an immutable EntityRevision and ChangeEvent. Shot/Scene order places selected Character State on the Presentation Time axis; World Time follows by default and uses optional Project-defined bindings only for time deviations. Track is a view lane, not an alternative version branch. A future `CreativeBranch` may hold a proposed Asset/AppearanceVariant State without modifying the current row. Accepted changes mark affected, non-frozen VisualAssetRequirements and Shots stale; approved Shots and existing Outputs continue to use creation-time snapshots. These capabilities are designed but not yet implemented.

---

# 5. Asset Resolution in Prompt Construction

When constructing a Shot's generation prompt, the system resolves referenced Assets in this order:

1. Start with Shot's local fields
2. For each `null` or absent field, resolve from Scene overrides
3. For remaining `null` fields, resolve from Story overrides
4. For remaining `null` fields, resolve from Project defaults
5. For Asset references (Character, Location, Style), fetch the full Asset record
6. If a Character has `base_character_id`, resolve the base Character's `appearance` and default outfit first, then locally merge the current Character's non-null fields
7. For Characters and Locations, resolve an approved Scene visual-asset binding first; only if no binding exists, fall back to the Asset's project-level primary reference image
8. Apply any Shot-level overrides on top of the resolved Asset data
9. Feed the resolved data into the Prompt Template to produce `prompt.positive`

**Example — Character resolution:**

```
Project has Character "Sun Wukong":
  appearance.hair = "golden brown fur"
  default_outfit = "golden armor with red cape"

Shot references "Sun Wukong":
  character_id = "char_swk"
  outfit_override = "torn monk's robe"    ← overrides default_outfit
  emotion = "furious"                      ← Shot-level addition

Resolved for this Shot:
  appearance.hair = "golden brown fur"     ← from Character
  outfit = "torn monk's robe"              ← override applied
  emotion = "furious"                       ← Shot-level
```

---

# 6. Asset API Surface

| Operation | Description |
|-----------|-------------|
| `CreateAsset(project_id, asset_type, data)` | Create a new Asset |
| `UpdateAsset(asset_id, patch)` | Partial update |
| `GetAsset(asset_id)` | Full Asset with resolution |
| `ListAssets(project_id, type?, tags?)` | Query with optional filters |
| `SearchAssets(project_id, query)` | Full-text search across name, description, tags |
| `ArchiveAsset(asset_id)` | Move to `archived` state |
| `RestoreAsset(asset_id)` | Move from `archived` to `active` |
| `DeleteAsset(asset_id)` | Permanent deletion (only if no active references exist) |
| `GetAssetReferences(asset_id)` | List all Shots/Scenes/Stories referencing this Asset |
| `UploadMedia(project_id, file)` | Upload a Media Asset |
| `DuplicateAsset(asset_id)` | Create a copy in `draft` state |
