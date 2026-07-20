# Domain Model Walkthrough: 阁楼上的秘密

> Zivith 领域模型实战验证
>
> Version: 1.0
>
> Status: Draft
>
> Based on: 用户提供的故事脚本「阁楼上的秘密」
>
> Related: Core-Domain-Model.md, Shot-Specification.md, Asset-Model.md, AI-Agent-Collaboration.md

---

# 1. Purpose

This document validates the Zivith domain model against a real creative work — the horror short story 「阁楼上的秘密」(The Secret in the Attic). By mapping every creative element of this story through the Project → Story → Scene → Shot → Video hierarchy, we verify that the domain model is complete, practical, and capable of modeling a real filmmaker's workflow.

Gaps, ambiguities, or missing features in the domain model are identified and proposed solutions documented.

---

# 2. Story Analysis

## 2.1 Story Summary

A young woman (苏晚, age 24) inherits her grandfather's rural ancestral home. On her first night, she hears sounds from the attic. She discovers a ghostly woman who claims to have been locked there for 30 years — her grandfather's former fiancée, betrayed by her grandmother. The final twist: the woman in the attic looks exactly like 苏晚 herself.

## 2.2 Creative Requirements for AI Generation

This story presents several challenges that stress-test the domain model:

| Challenge | Domain Model Feature |
|-----------|---------------------|
| One character (苏晚) appears in nearly every Shot | Character Asset with consistent appearance |
| A second character is a ghost with decayed appearance | Character Asset with appearance variants |
| Multiple locations within one house | Location Asset hierarchy or multi-area Location |
| Time progression (dusk → midnight → dawn) | Scene-level time/lighting context, inherited by Shots |
| Emotional arc shift (unease → fear → horror → existential dread) | Scene and Shot-level mood fields |
| Dialogue-heavy scene with dramatic reveal | Shot.dialogue schema |
| Visual twist ending (苏晚 = attic woman) | Character reference image consistency requirement |

---

# 3. Layer 1: Project

```yaml
project:
  id: "proj_attic_secret"
  name: "阁楼上的秘密"
  description: |
    悬疑恐怖短片，讲述年轻女子苏晚继承爷爷老宅后，
    发现阁楼里锁着爷爷三十年前的秘密。
  settings:
    default_style: "horror_cinematic"
    default_aspect_ratio: "16:9"
    default_fps: 24
    language: "zh"
  agent_config:
    story_agent:
      provider: "deepseek"
      model: "<configured-deepseek-model>"
    generation_agent:
      provider: "mock"           # Phase 2: mock
      model: "mock-v1"
```

---

# 4. Layer 2: Characters (Asset)

## 4.1 苏晚 (Protagonist)

```yaml
character:
  id: "char_suwan"
  name: "苏晚"
  aliases: ["小晚"]
  description: |
    二十四岁年轻女性，短发，清秀面容，眼神里带着与年龄不符的沉静。
    爷爷去世后继承乡下老宅，独自前来处理遗产。
  appearance:
    gender: "female"
    age_range: "young_adult"       # ~24
    height: "average"
    build: "slender"
    skin_tone: "fair"
    hair: "short black hair, slightly disheveled from travel"
    eyes: "dark brown, expressive"
    distinguishing_features: "small mole below left ear"
  personality: "内向、敏感，对家族历史一无所知，从不安逐渐走向恐惧"
  default_outfit: "白色T恤、牛仔裤、深色外套"
  reference_images: []             # 需要 AI 生成或上传角色设定图
  tags: ["protagonist", "female", "young_adult", "horror"]
```

## 4.2 阁楼女人 / 阿秀 (The Attic Woman)

```yaml
character:
  id: "char_attic_woman"
  name: "阿秀"                    # 创作时赋予名字
  aliases: ["阁楼上的女人", "爷爷的未婚妻"]
  description: |
    三十年前被锁在阁楼里的女人。苍白如纸的皮肤，指甲嵌着泥土。
    曾是爷爷的未婚妻，被奶奶设计囚禁。与苏晚长相一模一样。
    这是本故事的核心恐怖元素和终极反转。
  appearance:
    gender: "female"
    age_range: "middle_aged"       # 原本与苏晚同龄，但被囚禁30年
    height: "average"
    build: "slender"              # 与苏晚相同体型
    skin_tone: "deathly pale, almost translucent"
    hair: "long, tangled black hair, matted with dust"
    eyes: "hollow, dark — yet identical in shape to 苏晚's eyes"
    distinguishing_features: "dirt under fingernails; ragged white dress stained with age; face structure identical to 苏晚"
  personality: "绝望、愤怒、孤独，三十年的囚禁让温柔变成了疯狂"
  default_outfit: "破烂的白色连衣裙，沾满灰尘和暗色污渍"
  reference_images: []
  tags: ["ghost", "victim", "doppelganger", "horror"]
```

**Domain Model Validation Note:** The doppelganger twist (苏晚 = 阿秀) requires that both Characters be generated with identical facial structure but different styling (age, cleanliness, hair). This is achievable if the AI generates both from the same base character sheet with different `appearance` overrides. The domain model handles this naturally — each is a separate Character Asset with independent fields.

## 4.3 老陈 (中介)

```yaml
character:
  id: "char_laochen"
  name: "老陈"
  description: |
    房产中介，六十多岁男性，本地人，知道老宅的秘密。
    声音沙哑，说话吞吞吐吐。
  appearance:
    gender: "male"
    age_range: "elderly"           # ~60s
    height: "average"
    build: "stocky"
    skin_tone: "weathered, tanned"
    hair: "thinning gray hair"
    eyes: "narrow, evasive"
  personality: "心虚、恐惧，知道太多却不敢说"
  default_outfit: "旧夹克、深色长裤"
  reference_images: []
  tags: ["supporting", "male", "elderly"]
```

## 4.4 爷爷 / 奶奶 (Mentioned Only)

These characters appear only in the framed photograph and in dialogue. They may not need full Character Assets in Phase 1, but should be created as "background characters" with minimal detail for the photo scene.

---

# 5. Layer 3: Locations (Asset)

## 5.1 乡下老宅

```yaml
location:
  id: "loc_old_house"
  name: "乡下老宅"
  description: |
    一座三十年没人住的农村老宅，砖木结构，两层楼带阁楼。
    外墙爬满爬山虎，庭院杂草丛生。整体氛围阴森、破败。
    内部家具被白布覆盖，地板吱呀作响，墙角有蜘蛛网。
  type: "interior"
  time_period: "modern_day"
  weather_default: "overcast"
  lighting_default: "dim_natural"
  mood_default: "eerie, decaying"
  reference_images: []
  tags: ["house", "rural", "abandoned", "horror"]
```

**Sub-locations within the old house (for Shot context):**

| Sub-Area | Usage |
|----------|-------|
| 客厅 (Living Room) | Scenes 1, shots 1-3 |
| 卧室 (Bedroom) | Scene 2, shots 1-4 |
| 阁楼门前 (Attic Door) | Scene 4, shots 1-4; Scene 5, shots 1-2 |
| 阁楼内部 (Attic Interior) | Scene 6, shots 1-2 |

**Domain Model Validation Note:** The current Location model does not have a "sub-location" or "area" concept. For this story, the Shot's `composition.background` and `custom` fields provide enough context for the shot ("老宅阁楼门前"). A future enhancement could add `LocationArea` as a child entity of Location.

## 5.2 老宅外

```yaml
location:
  id: "loc_house_exterior"
  name: "老宅外"
  description: |
    老宅的外部区域。杂草丛生的庭院，碎石小径通向公路。
    清晨时分雾气弥漫，远处可听到警笛声。
  type: "exterior"
  time_period: "modern_day"
  weather_default: "foggy_morning"
  lighting_default: "dawn_light"
  mood_default: "cold, desolate"
  reference_images: []
  tags: ["exterior", "rural", "horror"]
```

---

# 6. Layer 4: Story

```yaml
story:
  id: "story_attic_secret"
  project_id: "proj_attic_secret"
  title: "阁楼上的秘密"
  logline: |
    年轻女子苏晚继承爷爷老宅，第一晚便发现阁楼里锁着一个
    被囚禁三十年的女人——而她，和自己长得一模一样。
  genre: "psychological_horror"
  tone: "不安 → 恐惧 → 惊悚 → 细思极恐"
  target_duration_seconds: 180           # 3分钟
  language: "zh"
```

---

# 7. Layer 5: Scenes

## Scene 1: 黄昏抵达

```yaml
scene:
  id: "scene_arrival"
  story_id: "story_attic_secret"
  order: 1
  label: "黄昏抵达"
  location_id: "loc_old_house"
  time: "dusk"                              # 黄昏
  weather: "overcast"
  mood: "uneasy"
  summary: |
    苏晚抵达乡下老宅。推开吱呀作响的木门，灰尘扑面。
    客厅里挂着泛黄的合照——爷爷、奶奶，和一个她从未见过的年轻女人。
    中介老陈来电，警告她千万别打开阁楼的门。
  characters: ["char_suwan", "char_laochen"]  # 老陈仅在电话中出现
  estimated_shots: 4
  estimated_duration_seconds: 45
```

## Scene 2: 午夜惊醒

```yaml
scene:
  id: "scene_midnight"
  story_id: "story_attic_secret"
  order: 2
  label: "午夜惊醒"
  location_id: "loc_old_house"
  time: "midnight"                           # 凌晨12点
  weather: "clear_night"
  mood: "fear"
  lighting:
    type: "low"
    direction: "ambient"                     # 仅有月光
  summary: |
    挂钟敲响十二点。苏晚被惊醒——头顶阁楼传来沉闷的拖动声。
    她注意到阁楼门的铁链已经断裂，门缝渗出红色液体。
  characters: ["char_suwan"]
  estimated_shots: 4
  estimated_duration_seconds: 35
```

## Scene 3: 电话真相

```yaml
scene:
  id: "scene_phone_call"
  story_id: "story_attic_secret"
  order: 3
  label: "电话真相"
  location_id: "loc_old_house"
  time: "midnight"
  weather: "clear_night"
  mood: "horror_dawning"
  summary: |
    苏晚颤抖着拨通老陈的电话。老陈透露——爷爷年轻时有个妹妹，
    失踪在这座宅子里。暗示与阁楼有关。
  characters: ["char_suwan", "char_laochen"]  # 老陈仅通过电话
  estimated_shots: 3
  estimated_duration_seconds: 25
```

## Scene 4: 阁楼门前

```yaml
scene:
  id: "scene_attic_door"
  story_id: "story_attic_secret"
  order: 4
  label: "阁楼门前"
  location_id: "loc_old_house"
  time: "midnight"                           # 凌晨12:15
  weather: "clear_night"
  mood: "terror"
  lighting:
    type: "practical"                        # 手电筒光
    direction: "front"
  summary: |
    苏晚站在阁楼门下。门缝里伸出一只苍白的手，攥住她的手腕。
    阁楼里的女人开始讲述——她是爷爷的未婚妻，被奶奶锁在阁楼里三十年。
  characters: ["char_suwan", "char_attic_woman"]
  estimated_shots: 5
  estimated_duration_seconds: 45
```

## Scene 5: 终极反转

```yaml
scene:
  id: "scene_revelation"
  story_id: "story_attic_secret"
  order: 5
  label: "终极反转"
  location_id: "loc_old_house"
  time: "dawn"                               # 破晓
  weather: "foggy_morning"
  mood: "existential_dread"
  summary: |
    警察撬开阁楼门，里面空无一人。地板上用手指甲刻着一行字，
    暗示苏晚的身世。苏晚想起爷爷临终前说的三个字——"对不起"。
    离开时回头看见阁楼窗户里，一个女人向她缓缓挥手。
    苏晚意识到那个女人和自己长得一模一样。
  characters: ["char_suwan", "char_attic_woman"]
  estimated_shots: 6
  estimated_duration_seconds: 50
```

---

# 8. Layer 6: Shots (Selected Detail)

## 8.1 Scene 1 Detailed Shots

### Shot 1.1: 老宅外景

```yaml
shot:
  id: "shot_1_1"
  scene_id: "scene_arrival"
  order: 1
  label: "老宅全景"
  camera:
    shot_type: "wide_shot"
    angle: "low_angle"
    movement: "static"
  composition:
    framing: "centered"
    focus_subject: "老宅在暮色中的剪影"
    foreground: "杂草丛生的庭院"
    background: "灰暗的天空，远山"
  lighting:
    type: "golden_hour"
    direction: "back"
    intensity: "low"
  color:
    palette: ["dark_blue", "amber", "gray"]
    saturation: "desaturated"
    contrast: "high"
  mood: "uneasy"
  characters: []
  action:
    description: "老宅矗立在暮色中，窗户像黑洞洞的眼睛。风吹动爬山虎。"
    duration_hint: 5.0
  style:
    aspect_ratio: "16:9"
    fps: 24
    rendering: "photorealistic"
```

### Shot 1.2: 推门入室

```yaml
shot:
  id: "shot_1_2"
  scene_id: "scene_arrival"
  order: 2
  label: "苏晚推开门"
  camera:
    shot_type: "medium_shot"
    angle: "eye_level"
    movement: "tracking"                     # 跟随苏晚进入
  lighting:
    type: "natural"
    direction: "back"                        # 逆光剪影
    intensity: "low"
  mood: "uneasy"
  characters:
    - character_id: "char_suwan"
      action: "推开吱呀作响的木门，拖着行李箱走进来"
      emotion: "cautious"
      position: "center"
  action:
    description: "门轴发出刺耳的声响。灰尘在逆光中飞舞。"
    duration_hint: 4.0
  dialogue:
    text: "这房子也太旧了，水电都通了吗？"
    speaker_id: "char_suwan"
    style: "on_screen"
```

### Shot 1.3: 照片特写

```yaml
shot:
  id: "shot_1_3"
  scene_id: "scene_arrival"
  order: 3
  label: "墙上的合照"
  camera:
    shot_type: "close_up"
    angle: "eye_level"
    movement: "dolly_in"                     # 缓慢推向照片
  composition:
    framing: "centered"
    focus_subject: "泛黄的合照"
    background: "斑驳的墙壁"
  lighting:
    type: "natural"
    direction: "side"
    intensity: "low"
    color_temperature: "warm"                # 金色暮光
  mood: "uneasy"
  characters:
    - character_id: "char_suwan"
      action: "凝视照片"
      emotion: "puzzled"
      position: "off_screen"                 # 观众视角，但苏晚在画面外
  action:
    description: "镜头缓慢推向墙上泛黄的合照。照片里爷爷、奶奶中间站着一个笑容明媚的年轻女人。"
    duration_hint: 6.0
```

### Shot 1.4: 老陈来电

```yaml
shot:
  id: "shot_1_4"
  scene_id: "scene_arrival"
  order: 4
  label: "接到警告电话"
  camera:
    shot_type: "medium_shot"
    angle: "eye_level"
    movement: "static"
  lighting:
    type: "practical"                        # 手机屏幕光
    direction: "front"
    intensity: "low"
    color_temperature: "cool"                # 手机蓝光
  mood: "uneasy"
  characters:
    - character_id: "char_suwan"
      action: "接听手机，表情从困惑变为不安"
      emotion: "confused, then worried"
      position: "center"
  dialogue:
    text: "苏小姐，老宅手续都办好了。对了，你爷爷去世前特意嘱咐过，阁楼的门千万别打开。"
    speaker_id: "char_laochen"
    style: "off_screen"                      # 电话中
  action:
    description: "苏晚抬头看向天花板。画面切到阁楼门——铁链缠绕。"
    duration_hint: 6.0
```

## 8.2 Scene 4 Key Shots: The Attic Encounter

### Shot 4.3: 手伸出门缝 (The Grab)

```yaml
shot:
  id: "shot_4_3"
  scene_id: "scene_attic_door"
  order: 3
  label: "门缝里伸出的手"
  camera:
    shot_type: "extreme_close_up"
    angle: "eye_level"
    movement: "static"
  lighting:
    type: "practical"
    direction: "bottom"                      # 手电筒从下方照射
    intensity: "high_contrast"
    color_temperature: "cool"
  mood: "terror"
  characters:
    - character_id: "char_attic_woman"
      action: "手从门缝伸出，死死攥住苏晚的手腕"
      emotion: "desperate"
      position: "center"
    - character_id: "char_suwan"
      action: "被抓住，试图挣脱"
      emotion: "terrified"
      position: "foreground"
  action:
    description: |
      苍白如纸的手从阁楼门缝中猛然伸出，指甲嵌着泥土。
      手指像钳子一样死死攥住苏晚的手腕，越收越紧。
      手电筒掉落，光柱在地板上滚动。
    duration_hint: 4.0
  audio:
    ambience: "沉重的呼吸声，门板被挤压的吱呀声"
```

### Shot 4.4: 阁楼女人的脸

```yaml
shot:
  id: "shot_4_4"
  scene_id: "scene_attic_door"
  order: 4
  label: "门缝里的眼睛"
  camera:
    shot_type: "extreme_close_up"
    angle: "eye_level"
    movement: "dolly_in"                     # 缓慢推近
  lighting:
    type: "practical"
    direction: "side"                        # 掉落的手电筒从侧面照亮
    intensity: "high_contrast"
  mood: "horror"
  characters:
    - character_id: "char_attic_woman"
      action: "脸贴近门缝，眼睛死死盯着苏晚"
      emotion: "furious, desperate, mad"
      expression: "嘴角扭曲，眼中有泪光和疯狂"
      position: "center"
  action:
    description: |
      门缝中露出一只眼睛——布满血丝，瞳孔收缩。
      女人的声音从门后传来，嘶哑得像很久没说过话。
    duration_hint: 3.0
  dialogue:
    text: "你终于来了……我等你等了好久……"
    speaker_id: "char_attic_woman"
    style: "off_screen"
```

### Shot 4.5: 三十年的真相

```yaml
shot:
  id: "shot_4_5"
  scene_id: "scene_attic_door"
  order: 5
  label: "揭露真相"
  camera:
    shot_type: "close_up"
    angle: "eye_level"
    movement: "static"
  lighting:
    type: "practical"
    direction: "front"
    intensity: "low"
  mood: "horror"
  characters:
    - character_id: "char_suwan"
      action: "瘫坐在地上，面色惨白，听着门后的声音"
      emotion: "shocked, horrified"
      position: "center"
  dialogue:
    text: "你爷爷告诉你了吗？我是你奶奶的妹妹……不，我是你爷爷的……未婚妻。"
    speaker_id: "char_attic_woman"
    style: "off_screen"
  action:
    description: "苏晚睁大眼睛，嘴唇颤抖。门后的声音继续。"
    duration_hint: 5.0
  audio:
    ambience: "门板后有轻微的啜泣声，混合着风声"
```

---

# 9. Validation Findings

## 9.1 Domain Model Strengths

The walkthrough confirms that the domain model handles the story well in these areas:

| Capability | How the Model Handles It |
|------------|--------------------------|
| Multi-scene structure | Story contains 5 Scenes, each with independent location/time/mood context |
| Detailed Shot configuration | Every cinematic element (camera, lighting, composition, mood) is directly mappable |
| Character consistency | Characters defined once as Assets, referenced by ID across all Shots |
| Dialogue with off-screen speakers | `dialogue.style: "off_screen"` handles the phone call and attic door scenes |
| Emotional arc | `mood` field on Scene propagates to Shots; individual Shots can override |
| Practical lighting | `lighting.type: "practical"` covers flashlight and phone screen scenarios |
| Extreme close-ups | `camera.shot_type: "extreme_close_up"` covers the hand-grab and eye shots |

## 9.2 Gaps Identified

### Gap 1: Location Sub-Area

**Issue:** The old house has multiple distinct areas (living room, bedroom, attic door, attic interior). The Location model currently treats the house as a single entity. Shots need to specify "which room" within the house.

**Proposed fix:** Add `location_area` field to Shot schema:

```yaml
shot:
  location_area: "阁楼门前走廊"    # Sub-area within loc_old_house
```

Alternatively, create separate Location Assets for each room. For this particular story, separate Locations make sense (attic is distinct enough from living room).

**Decision:** For MVP, use `composition.custom` or `action.description` to specify sub-area. A `location_area` field can be added in Phase 4.

### Gap 2: Phone Call / Off-Screen Character Presence

**Issue:** 老陈 appears in Scenes 1 and 3 only as a voice on the phone. The character is listed in `scene.characters` but has no physical presence. The `dialogue.style: "off_screen"` handles the audio, but does not clearly indicate "this character is present only as voice."

**Proposed fix:** Add `character.presence` field:

```yaml
characters:
  - character_id: "char_laochen"
    action: null                          # No physical action
    emotion: "guilty, evasive"
    presence: "voice_only"                # Explicit: only voice
    position: null
```

**Decision:** Add `presence` as optional field in Shot schema. Values: `physical`, `voice_only`, `implied` (e.g., a photo on the wall).

### Gap 3: Flashback / Memory Shot

**Issue:** Scene 5 includes 苏晚 recalling her grandfather's dying words. This is a mental image, not a physical event in the current timeline. The model has no way to mark a Shot as "flashback" or "memory."

**Proposed fix:** Add `shot.narrative_mode`:

```yaml
shot:
  narrative_mode: "memory"                # "present", "flashback", "memory", "dream"
```

This affects prompt construction — a memory Shot may use different visual treatment (soft focus, color grading shift, vignette).

**Decision:** Add `narrative_mode` as optional Shot field. Values: `present` (default), `flashback`, `memory`, `dream`, `fantasy`.

### Gap 4: Two Characters with Identical Faces (Doppelganger)

**Issue:** The climax requires that 苏晚 and 阿秀 have the same face. The Character model handles this through separate Character Assets, but the generation pipeline has no explicit "share base appearance" instruction.

**Proposed fix:** Add `character.base_character_id` for doppelganger relationships:

```yaml
character:
  id: "char_attic_woman"
  base_character_id: "char_suwan"         # Same base appearance
  appearance:
    # Override only what differs:
    skin_tone: "deathly pale"
    hair: "long, tangled black hair"
    distinguishing_features: "dirt under nails, ragged dress"
  # Unspecified fields inherit from char_suwan
```

This way the AI generation model receives a clear instruction: "This character looks like 苏晚, but with these differences."

**Decision:** Add `base_character_id` to Character schema. When generating reference images for 阿秀, the system can use 苏晚's reference image as a conditioning input with the overrides applied.

---

# 10. Updated Domain Model Changes

Based on this walkthrough, the following changes are proposed:

| Change | Document | Priority |
|--------|----------|----------|
| Add `presence` to Shot character spec | Shot-Specification.md | High |
| Add `narrative_mode` to Shot schema | Shot-Specification.md | Medium |
| Add `base_character_id` to Character schema | Asset-Model.md | Medium |
| Add `location_area` to Shot schema | Shot-Specification.md | Low (defer to Phase 4) |

---

# 11. Shot Count & Duration Summary

| Scene | Shots | Est. Duration | Key Challenge |
|-------|-------|---------------|---------------|
| 1: 黄昏抵达 | 4 | 45s | Establishing atmosphere, photo reveal |
| 2: 午夜惊醒 | 4 | 35s | Sound design, practical lighting |
| 3: 电话真相 | 3 | 25s | Off-screen dialogue, reaction shots |
| 4: 阁楼门前 | 5 | 45s | Character consistency (阿秀 hand and eye) |
| 5: 终极反转 | 6 | 50s | Doppelganger reveal, flashback integration |
| **Total** | **22** | **200s** (~3:20) | |

The 22 shots are comfortably within the target of a 3-minute short film. Each shot averages ~9 seconds.
