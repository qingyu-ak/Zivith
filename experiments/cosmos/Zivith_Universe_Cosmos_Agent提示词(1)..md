# Zivith Universe / Cosmos —— Agent 实现提示词

> **用途：直接交给 Coding Agent / Claude Code / Codex / Cursor Agent。**
>
> 本文不是单纯的 UI 需求，而是产品语义、交互模型和实现边界。  
> **先理解 Zivith，再改代码；禁止为了视觉效果破坏已有 World Model。**

---

# 1. 本次任务

请基于当前 Zivith 项目代码，重新设计并实现：

```text
Zivith
  ↓
Universe
  ↓
Project World
  ↓
Cosmos
  ↓
Space
  ↓
Location
  ↓
Scene
  ↓
Entity / Timeline / Shot
```

最终效果要形成一种：

> **“我正在进入并探索自己的创作世界”**

的体验。

参考方向：

- Google Earth 的层级缩放与地点跳转
- 星际探索 / 星图的空间导航
- 3D 宇宙中的世界切换

但**不要复制 Google Earth、游戏或其他产品的 UI、素材和实现**。

---

# 2. Zivith 的核心定位

Zivith 不是：

- AI 聊天工具
- AI 写作工具
- AI 视频生成器
- Prompt 管理器
- 普通知识图谱
- 项目文件夹

Zivith 的核心是：

> **建立一个持续存在的 Creative World Model，让 AI 能长期理解一个 IP / Project，并允许用户持续修改这个世界。**

因此：

```text
Space      = Where / 在哪里
Timeline   = When / 什么时候
Entity     = Who / What / 谁和什么
Scene      = What happens / 发生什么
Shot       = What to generate / 最终生成什么
Agent      = Understand + Modify / 理解并修改
```

**Cosmos 不是 Zivith 的终点。**

Cosmos 是：

> **Zivith World Model 的空间入口。**

---

# 3. 最重要的产品结构

## 第一层：Universe

Zivith 最外层是 Universe。

```text
一个 Universe Bubble
        =
一个 Project / 一个独立创作世界
```

例如：

```text
🌌 北境疑云
🌌 银河远征
🌌 深海城
🌌 赛博北京
🌌 无名之国
```

多个 Universe Bubble 围绕一个远处的中心点排列：

```text
                   ○ Project C

       ○ Project B                 ○ Project D


                       ◎
                  当前 Project


       ○ Project E                 ○ Project F
```

交互：

- 拖拽 / 滑动旋转
- 当前 Bubble 靠近镜头
- 远处 Bubble 缩小
- 远处 Bubble 降低视觉权重
- 点击 / 双击当前 Bubble
- Camera 飞向 Project
- 进入该 Project 的 Cosmos

### 硬性原则

**Universe Bubble 不是普通 Project Card。**

它是：

> **Project World 的空间入口。**

---

# 4. 第二层：Project Cosmos

进入某个 Universe：

```text
Universe Bubble
      ↓
Project
      ↓
Project Cosmos
```

Cosmos 表示：

> **当前 Project 内部的空间世界。**

例如现实 / 架空地球：

```text
🌍 北境世界

   ● 帝都
             ● 雾港

       ● 北境城

                     ● 黑石镇
```

用户可以：

- Zoom In
- Zoom Out
- Pan
- Orbit
- Focus
- Fly To
- Back
- Breadcrumb

核心感受：

> **不是点击一个节点，而是“飞到那个地方”。**

---

# 5. 最重要的视觉语义：不要把地点做成多个星球

假设：

```text
一个 Project = 一颗星球
```

里面有：

```text
帝都
雾港
北境
黑石城
南方森林
```

正确：

```text
                    🌍
          ┌─────────┼─────────┐
          ↓         ↓         ↓
        帝都       雾港       北境
          ●         ●          ●
```

错误：

```text
🌍 帝都
🌍 雾港
🌍 北境
🌍 黑石城
```

### 规则

> **同一个 Planet 上的多个地点，必须属于同一个 Planet。**

地点使用：

- Marker
- Pin
- Region
- Area
- Label
- Route

表现。

---

# 6. 什么东西可以是“大球体”

只有真正具有独立空间尺度的对象才可以成为大型空间节点：

```text
Galaxy
 ↓
Star System
 ↓
Planet
 ↓
Moon
```

不要这样：

```text
Planet
 ↓
Character 球
 ↓
Event 球
 ↓
Scene 球
 ↓
Prop 球
```

Character、Event、Prop、Scene、Shot：

> **不是 Space。**

它们是：

> **存在于 Space 中的 Entity / Content。**

---

# 7. Space 必须是动态层级

不要把系统写死成“地球”。

支持：

### 地球型

```text
Planet
 ↓
Continent
 ↓
Region
 ↓
Country
 ↓
City
 ↓
District
 ↓
Location
 ↓
Scene
```

### 星际型

```text
Galaxy
 ↓
Star System
 ↓
Planet
 ↓
Colony
 ↓
City
 ↓
Facility
 ↓
Scene
```

### 奇幻型

```text
World
 ↓
Kingdom
 ↓
Region
 ↓
City
 ↓
Castle
 ↓
Room
 ↓
Scene
```

因此推荐抽象为：

```text
Space
├── id
├── projectId
├── parentId
├── type
├── name
├── description
├── position
├── scale
├── visual
└── metadata
```

其中：

```text
parentId
```

构建空间树。

---

# 8. Planet 的地点必须支持 Google Earth 式缩放

例如：

```text
Planet
  ↓
点击「雾港」
  ↓
Camera Fly To
  ↓
Zoom
  ↓
显示雾港区域
  ↓
继续 Zoom
  ↓
显示城市
  ↓
继续 Zoom
  ↓
District
  ↓
Location
  ↓
Scene
```

不要使用：

```text
点击地点
↓
弹出普通 Modal
```

Modal 可以作为辅助信息，但主要体验应该是：

> **Camera 进入空间。**

---

# 9. Space 与 Entity 的关系

正确：

```text
Space
 ├── Location
 ├── Scene
 └── Entity
      ├── Character
      ├── Event
      ├── Prop
      ├── Faction
      └── Shot
```

例如：

```text
Character: 王诚

所在 Space:
北境城

当前 Timeline:
Chapter 7
```

意思是：

> 王诚“在”北境城。

而不是：

> 王诚“等于”北境城。

---

# 10. Zivith 真正的融合点：Space + Timeline + Entity

不要把 Cosmos 做成独立 Demo。

Zivith 的核心应该逐渐变成：

```text
                 WORLD MODEL
                      │
        ┌─────────────┼─────────────┐
        ↓             ↓             ↓
      SPACE          TIME          ENTITY
      Where          When         Who/What
        │             │             │
        └─────────────┼─────────────┘
                      ↓
                    SCENE
                      ↓
                    SHOT
                      ↓
                   Shot Pro
```

这三个维度必须互相连接。

---

# 11. Timeline 与 Cosmos 必须共享数据

例如角色王诚：

```text
Chapter 1 → 帝都
Chapter 4 → 雾港
Chapter 7 → 北境
Chapter 10 → 黑石城
```

那么：

```text
Timeline
     ↓
Character State
     ↓
Space Placement
```

Cosmos 在不同时间点应该能够表现不同的位置。

不要建立：

```text
Cosmos 自己一套位置数据
Timeline 自己一套位置数据
```

然后让两者互相猜。

必须存在统一的 World Model。

---

# 12. AI Agent 与 Cosmos 的融合

这是本项目最重要的部分。

当用户正在：

```text
Galaxy
 → Star System A
 → Planet B
 → North Region
 → Mist Harbor
 → Old Tavern
```

然后打开 Chat：

> “这里发生过什么？”

Agent 自动知道：

```text
Project
World
Galaxy
Star System
Planet
Region
City
Location
Current Scene
Current Timeline
Relevant Characters
Relevant Events
Relevant Shots
```

用户不应该每次重新解释“这里”是什么。

---

# 13. Agent 的空间上下文

建议形成统一 Context：

```ts
interface SpatialContext {
  projectId: string;

  spacePath: SpaceRef[];

  currentSpace?: SpaceRef;

  selectedLocation?: SpaceRef;

  selectedScene?: SceneRef;

  currentTime?: TimelinePosition;

  nearbyEntities?: EntityRef[];

  relevantEvents?: EventRef[];

  relatedShots?: ShotRef[];
}
```

Agent 调用上下文时：

```text
User Prompt
+
Spatial Context
+
Timeline Context
+
Entity Context
+
Project Knowledge
```

一起进入 Agent。

---

# 14. Agent 应该能够修改 Cosmos

例如用户说：

> “把这个城市改成废弃城市。”

Agent 不只是修改描述文本。

应该判断：

```text
City
 ↓
修改 Space metadata
 ↓
修改 Environment description
 ↓
检查相关 Scene
 ↓
检查相关 Character
 ↓
检查相关 Event
 ↓
提示潜在冲突
```

又例如：

> “让王诚去北境。”

应该理解为：

```text
Character = 王诚
Current Space = 当前角色位置
Target Space = 北境
Timeline = 当前时间
Change = 移动
```

然后更新 World Model。

---

# 15. Agent 可以通过“当前空间”理解自然语言

例如用户进入：

```text
北境 → 雾港 → 老酒馆
```

用户说：

> “这里太亮了，改成深夜。”

Agent 应该知道：

```text
“这里”
=
当前 Space / Scene
```

然后修改：

```text
Time of Day
Lighting
Environment
Scene context
```

这就是 Cosmos 对 AI 的实际价值。

---

# 16. Cosmos 与 Scene

Cosmos 负责：

> Where

Scene 负责：

> What happens here

关系：

```text
Location
   ↓
Scene
   ↓
Characters
Events
Props
Timeline
Shots
```

例如：

```text
雾港
 └── 老酒馆
      ├── Scene 07
      ├── Scene 08
      └── Scene 09
```

点击 Scene：

右侧展示：

```text
Scene 07

Location:
老酒馆

Time:
深夜

Characters:
王诚
温度

Events:
秘密交易

Shots:
Shot 01
Shot 02
Shot 03
```

---

# 17. Cosmos 与 Shot Pro

Shot 仍然是 Zivith 最终生产层的 Source of Truth。

Cosmos 不负责直接生成视频。

它提供：

```text
Space Context
+
World Context
+
Timeline Context
+
Entity Context
```

然后：

```text
Scene
 ↓
Context
 ↓
Shot Pro
 ↓
Generation Prompt
 ↓
Image / Video / Audio
```

这样未来模型能力升级时：

> 只需要改变 Shot Pro / Provider Layer，而不需要重建整个世界。

这与 Zivith 的长期方向保持一致。

---

# 18. 当前已有关系图不要粗暴删除

如果当前 Zivith 已经存在：

```text
Character A ─ Character B
Character B ─ Event C
Event C ─ Scene D
```

不要因为 Cosmos 而删除这些关系。

但是：

> **关系图不应该继续作为 Cosmos 的默认视觉。**

建议提供两种模式：

```text
[ Space ]   [ Relations ]
```

### Space Mode

默认。

展示：

- Galaxy
- Star System
- Planet
- Location
- Scene
- Space Marker

### Relations Mode

辅助。

展示：

- Character relationship
- Faction relationship
- Event relationship
- Entity dependency

底层数据仍然统一。

---

# 19. Universe Bubble 与 Project 必须直接融合

Universe Bubble 不维护自己的 Project 数据。

它直接读取 Project。

例如：

```text
Project
├── id
├── name
├── description
├── cover
├── worldType
└── cosmosRootSpace
```

Bubble 可以根据：

```text
Project
+
Cosmos Summary
```

生成视觉。

例如：

### 地球型

```text
Planet
+ Location Markers
```

### 星际型

```text
Star
+ Planet
+ Orbit
```

### 奇幻型

```text
World
+ Kingdom
+ Major Locations
```

因此：

> Universe Bubble 是 Project 的入口，不是第二套数据模型。

---

# 20. Zivith 首页最终可以变成什么

不要把首页永远做成：

```text
Project List
```

而可以变成：

```text
                    ZIVITH

                  Universe Space

       ○                          ○
   《深海城》                  《银河远征》


                   ◎
              《北境疑云》
                当前世界


       ○                          ○
   《赛博北京》                《无名之国》
```

选择：

```text
《北境疑云》
```

↓

```text
Universe
 ↓
Planet
 ↓
北境
 ↓
雾港
 ↓
Scene
```

用户的感觉应该是：

> **进入自己的世界。**

---

# 21. UI 与现有 Zivith 工作区融合

Cosmos 不是替代现有编辑器。

进入具体 Scene 后，仍然需要：

```text
┌───────────────────────────────────────────────┐
│ Zivith   Space Path              Project / Mode│
├───────────────────────────────────────────────┤
│                                               │
│                                               │
│                  COSMOS                       │
│                                               │
│                              ┌─────────────┐  │
│                              │ Details     │  │
│                              │             │  │
│                              │ Location    │  │
│                              │ Characters  │  │
│                              │ Scenes      │  │
│                              │ Shots       │  │
│                              └─────────────┘  │
│                                               │
├───────────────────────────────────────────────┤
│ AI Agent / Chat                               │
└───────────────────────────────────────────────┘
```

可以继续保留 Zivith 原有：

- 左侧 Project / Structure
- 中间 Timeline
- Chat
- 右侧 Resource / Details
- Scene / Shot 编辑
- Assets
- Knowledge

不要为了 Cosmos 把已有生产工作流全部推翻。

---

# 22. 三个尺度必须统一

Zivith 最终要形成：

## 宏观

```text
Universe
 ↓
Galaxy
 ↓
Star System
 ↓
Planet
```

回答：

> **这个世界在哪里？**

## 中观

```text
Planet
 ↓
Region
 ↓
City
 ↓
Location
```

回答：

> **故事发生在哪里？**

## 微观

```text
Location
 ↓
Scene
 ↓
Shot
```

回答：

> **这一幕具体发生什么？**

---

# 23. 最关键的融合关系

请不要把这些功能做成互相独立的页面。

应该是：

```text
                ZIVITH WORLD MODEL
                       │
       ┌───────────────┼───────────────┐
       ↓               ↓               ↓
     Cosmos         Timeline         Entity
       │               │               │
       │               │               │
       └───────────────┼───────────────┘
                       ↓
                     Scene
                       ↓
                      Shot
                       ↓
                   Shot Pro
                       ↓
              Image / Video / Audio
```

同时：

```text
Cosmos
   ↓
Spatial Context
   ↓
Agent
   ↓
Modify World Model
   ↓
Cosmos 更新
```

形成闭环：

```text
用户探索空间
      ↓
选择地点
      ↓
AI 获取空间上下文
      ↓
用户自然语言修改
      ↓
World Model 更新
      ↓
Timeline / Entity / Scene 更新
      ↓
Cosmos 自动反映变化
```

**这才是“融合 Zivith”，而不是单纯加一个 3D 页面。**

---

# 24. MVP 不要做得过重

第一阶段只需要：

## P0：Space 数据模型

实现：

```text
Space
 ├── id
 ├── projectId
 ├── parentId
 ├── type
 ├── name
 ├── position
 └── metadata
```

---

## P1：Project Cosmos

```text
Project
 ↓
Root Space
 ↓
Child Spaces
```

支持：

- Zoom
- Pan
- Orbit
- Focus
- Fly To
- Back
- Breadcrumb

---

## P2：Planet + Locations

一个 Planet：

```text
🌍
 ├── Location A
 ├── Location B
 ├── Location C
 └── Location D
```

地点用 Marker 表示。

---

## P3：Scene

```text
Location
 ↓
Scene
```

点击 Scene 后显示 Detail。

---

## P4：Agent Context

当前 Space 自动注入 Agent。

---

## P5：Timeline

实现：

```text
Entity
+
Time
+
Space
```

例如角色移动。

---

## P6：Universe Bubble

最后实现：

```text
Project A
Project B
Project C
Project D
```

围绕中心旋转。

---

# 25. 不要在 MVP 做这些东西

暂时不要做：

- GIS
- 真实卫星地图
- 真实地理数据
- 真实天文学物理模拟
- 游戏级地形
- 真实星系物理
- 复杂粒子系统
- VR
- 多人在线宇宙
- 游戏引擎级场景系统

当前目标不是做 Google Earth。

目标是：

> **做出“Google Earth 式的世界探索感”，并将它连接到 Zivith 的语义世界模型。**

---

# 26. 实现前必须先检查现有代码

禁止直接重写。

第一步分析当前：

```text
1. Project 数据结构
2. Cosmos 数据结构
3. Space / Location 数据
4. Entity 数据结构
5. Scene 数据结构
6. Shot 数据结构
7. Timeline 数据结构
8. 当前球体 / 节点生成逻辑
9. Camera / Zoom
10. 点击交互
11. Detail Panel
12. Chat Agent
13. Agent Context
14. 路由
15. 状态管理
```

然后先输出：

```text
Current Architecture
        ↓
Current Cosmos
        ↓
Current World Model
        ↓
Gap Analysis
        ↓
Minimal Refactor Plan
        ↓
Implementation
```

---

# 27. 修改原则

## 原则 1：产品语义优先于视觉

如果当前代码把：

```text
Character = 球
Location = 球
Planet = 球
```

全部混在一起：

> 必须重构语义。

不要为了“改动少”而继续保留错误模型。

---

## 原则 2：不要大规模重写

优先：

```text
现有 Project
      ↓
增加 / 重构 Space 层
      ↓
连接现有 Scene
      ↓
连接 Entity
      ↓
连接 Timeline
      ↓
连接 Agent
```

而不是重新创建一个独立 Cosmos App。

---

## 原则 3：数据模型必须先于视觉

顺序：

```text
Data Model
 ↓
World Model
 ↓
Navigation
 ↓
UI
 ↓
Animation
```

不要反过来。

---

## 原则 4：Cosmos 必须可被 Agent 理解

任何用户看到的空间：

```text
当前在哪
父级是什么
子级有什么
这里有什么 Entity
当前时间是什么
这里有哪些 Scene
```

都应该可以被 Agent 查询。

---

# 28. 验收标准

## Universe

- [ ] 一个 Bubble = 一个 Project
- [ ] Bubble 空间排列
- [ ] Bubble 可旋转
- [ ] 当前 Project 有明确视觉焦点
- [ ] 可以进入 Project
- [ ] 不存在第二套 Project 数据

## Cosmos

- [ ] Project 有 Root Space
- [ ] Space 支持 parent / child
- [ ] 支持动态层级
- [ ] Zoom
- [ ] Pan
- [ ] Orbit
- [ ] Focus
- [ ] Fly To
- [ ] Back
- [ ] Breadcrumb

## Planet

- [ ] 一个 Planet 可以有多个 Location
- [ ] Location 不生成独立 Planet
- [ ] Location 可以定位
- [ ] 点击 Location 可以平滑飞入
- [ ] 可以继续进入 Scene

## Entity

- [ ] Character 不是 Space
- [ ] Event 不是 Space
- [ ] Prop 不是 Space
- [ ] Shot 不是 Space
- [ ] Entity 可以关联 Space

## Timeline

- [ ] Entity 可以随时间改变 Space
- [ ] 可以表达角色移动
- [ ] Cosmos 与 Timeline 读取同一 World Model

## Agent

- [ ] Agent 可以获得当前 Space
- [ ] Agent 可以获得 Space Path
- [ ] Agent 可以获得当前 Scene
- [ ] Agent 可以获得当前时间
- [ ] Agent 可以获得相关 Entity
- [ ] Agent 可以修改 Space / Entity / Scene
- [ ] 修改后 Cosmos 自动更新

## Zivith

- [ ] Cosmos 不是孤立 3D Demo
- [ ] Cosmos 与 World Model 绑定
- [ ] Cosmos 与 Timeline 绑定
- [ ] Cosmos 与 Entity 绑定
- [ ] Cosmos 与 Scene 绑定
- [ ] Cosmos 与 Agent Context 绑定
- [ ] Cosmos 可以为 Shot Pro 提供空间上下文

---

# 29. 最终产品模型

```text
                         ZIVITH
                           │
                  ┌────────┴────────┐
                  │                 │
            Universe Space      Project / Agent
                  │
             Project World
                  │
               Cosmos
                  │
       ┌──────────┼──────────┐
       ↓          ↓          ↓
     Galaxy    Star System  World
       │          │          │
       └──────────┼──────────┘
                  ↓
                Planet
                  ↓
             Region / City
                  ↓
               Location
                  ↓
                Scene
                  ↓
         ┌────────┼────────┐
         ↓        ↓        ↓
      Character  Event     Prop
         │
      Timeline
         │
         ↓
        Shot
         │
      Shot Pro
         │
         ↓
  Image / Video / Audio
```

---

# 30. Zivith 的真正差异化

最终不要把这个项目理解成：

> “我们做了一个很酷的 3D 项目列表。”

真正的产品价值是：

> **Zivith 把一个 IP 变成一个可被人和 AI 共同探索、修改和生产的世界。**

用户可以：

```text
进入世界
 ↓
飞到地点
 ↓
查看这里发生过什么
 ↓
查看谁在这里
 ↓
切换时间
 ↓
查看角色在不同时间的位置
 ↓
与 Agent 对话
 ↓
修改世界
 ↓
影响 Scene
 ↓
影响 Shot
 ↓
进入 Shot Pro
 ↓
生成内容
```

所以：

> **Universe 是世界之间的导航。**
>
> **Cosmos 是世界内部的空间导航。**
>
> **Timeline 是世界的时间轴。**
>
> **Entity 是世界中的对象。**
>
> **Scene 是世界中发生的事件。**
>
> **Shot 是世界最终被生产成媒体的最小单元。**
>
> **Agent 是理解并修改这个世界的智能层。**

---

# 31. 最高优先级的一句话

> **不要把 Zivith 做成“有 3D 宇宙效果的项目管理器”；要把 Cosmos 做成 Zivith World Model 的空间表达，让用户像探索 Google Earth 一样进入自己的世界，而 AI 能同时理解“在哪里、什么时候、谁、发生了什么”，并通过这些上下文直接修改世界，最终把世界状态传递到 Scene → Shot → Shot Pro。**
