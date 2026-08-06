# 实施计划

> Zivith 实施计划
>
> Version: 2.4
>
> Status: Active — 进度已于 2026-07-30 同步；2026-07-31 围绕 IP Core 重新排序（[ADR-0008](../architecture/adr/0008-zivith-is-an-ai-understandable-ip-creation-system.md)）；2026-08-04 创造层优先转向（分支 `feat/creator-layer-first`，ADR-0010 修订 + 0011 / 0012 / 0013），实施细节以 [Next-Tasks.md](Next-Tasks.md) 为准
>
> Strategy: B-Line — AI Agent 流水线优先，视频生成用 Mock；IP Core 先于生成生产化
>
> Related: [Product-Positioning.md](../product/Product-Positioning.md), [Technical-Architecture.md](../engineering/Technical-Architecture.md), [AI-Agent-Collaboration.md](../domain/AI-Agent-Collaboration.md), [Core-Domain-Model.md](../domain/Core-Domain-Model.md), [Next-Tasks.md](Next-Tasks.md), [Entity + State + Timeline + Track](../architecture/entity-state-timeline-track.md), [IP World Model Repositioning RFC](../architecture/rfc/IP-World-Model-Repositioning-RFC.md)

---

# 1. 目的

本文档定义 Zivith 的分阶段实施路线图。

**策略决策（2026-07）：** MVP 遵循 B-Line — 先建设 AI Agent 创作流水线，真实视频生成使用 Mock Adapter。这优先演示「AI 作为创作伙伴」工作流，而非视频质量，并将视频模型选型推迟到提供商格局更清晰的后期阶段。

**重新排序（2026-07-31，[ADR-0008](../architecture/adr/0008-zivith-is-an-ai-understandable-ip-creation-system.md)；2026-08-04 创造层优先）：** Zivith 的定位现为「AI 可理解的 IP 创作系统」。**IP Core** — Entity、State、Relationship、WorldEvent、Timeline — 是产品基础，并排在生成生产化之前。实践上这与其说是反转，不如说是确认：Track H 已经*是* IP Core 基础，并将不间断继续。变化的是它之后做什么。Track I（世界实体）与 Track J（Creator Chat 持续对话创作面）现在排在 Phase 3–5 之前，且 MVP 在验证视频质量之前先验证四个问题：

1. 用户是否愿意创建 IP？
2. AI 能否帮助用户组织世界？
3. 用户是否需要管理角色与关系？
4. 世界结构能否持续扩展？

### 实时进度（2026-07-30）

| 阶段 | 进度 | 摘要 |
|-------|----------|---------|
| 0 Foundation | ~95% | Monorepo、认证、Compose、CI、BullMQ 已接线；无 staging 部署 |
| 1 Core Domain | ~90% | 完整创作 CRUD + 继承 + Character/Location 资产 |
| 2 AI Agent + Mock Gen | ~95% | Mock Story→Video E2E（A1）+ WorkflowPanel 门禁/SSE/队列/恢复 |
| 2.5 First Providers | ~85% | DeepSeek + SiliconFlow 适配器 + 提供商 UI；BYOK 稍后（C7） |
| **V0.4（间奏）** | ~95% | W1–W7 首轮已落地（`usage_records` 记录；freeze/limits 稍后）。见 [V0.4-Modification-Plan.md](../archive/V0.4-Modification-Plan.md) |
| 2.5 polish（Track G） | **已完成** | 真实密钥 Story→Video E2E；Wan 加固 + MinIO 持久化 + 余额告警 + 无自动重复计费 |
| **IP Core foundation（Track H）** | H3 已完成；H4/H5 世界线 v1 已落地 | Entity + State + Timeline + Track。双写助手 + 按 Entity 开关（默认关）；H4/H5 世界线视图 v1 于 2026-08-05 在 `feat/creator-layer-first` 落地（`/projects/:id/world` 三轨道 + 关系连线），Production 视图后续 |
| **IP Core world entities（Track I）** | I1 / I2 已落地 | WorldEvent 已落库（[ADR-0011](../architecture/adr/0011-world-event-is-a-domain-creative-entity.md)）；Relationship 已提升为独立实体（[ADR-0012](../architecture/adr/0012-relationship-is-an-independent-queryable-entity.md)）；Organization 待偿 |
| **Creator Chat 持续对话（Track J）** | 主体已落地 | 世界优先的持续对话创作面；后端（会话运行时 + World Builder Agent + 提案→确认→落库 + 知识上下文）与 Web 对话页/提案卡片已落地（E2E 48 项全过）；chat 页右侧世界状态面板待补。由 ADR-0010（2026-08-04 修订）划界 |
| **World-first UI（Track K）** | K1/K3/K5 已完成；K2/K4 世界视图 v1 | 项目首页已拆分为 World Overview + `/production` + `/settings`（2026-08-05，侧栏新增 制作/设置）；Creator Chat 已为默认页 `/`（2026-08-05）；`/world` 三栏工作区 v1 只读（2026-08-05）；**世界观 Chat→Studio 核心闭环已落地（2026-08-05）：`Project.worldview Json` + 自动提炼落库 + Explorer「世界观」组 + 副驾驶只读摘要 + chat「进入 Studio」入口**。见 [UI-Information-Architecture.md](../product/UI-Information-Architecture.md) |
| 3–5 | 0% | 生成生产化现排在 IP Core 之后 |

**近期工程待办：** [Next-Tasks.md](Next-Tasks.md) **Track H**（H3 已完成；H4/H5 世界线 v1 已落地 2026-08-05）、Track I（I1/I2 已落地）、Track J（主体已落地）、Track K（K1/K3 已完成 2026-08-05；K5 世界观 Chat→Studio 核心闭环已完成 2026-08-05）已闭环；下一步：J3 右侧世界状态面板 + K4 Production 视图。设定表 / 地点表与 T2I·I2I·T2V·I2V 矩阵见 [Asset-Model.md](../domain/Asset-Model.md)。

### Entity + State + Timeline + Track 实施门禁

ADR-0007 已 Accepted；Track H 已明确排期。运行时历史表尚未成为基线。增量推进：

1. **V1 Entity + State：** `[x]` 规范快照（H1）→ `[x]` EntityRevision/ChangeEvent 表 + 基线回填（H2）→ `[x]` 事务双写助手/开关（H3）；
2. **V2 Timeline：** 从既有 Scene/Shot 顺序得到只读 Presentation Time；World Time 默认跟随；
3. **V3 Track System：** 在 Scene/Character/Shot 验证之后增加可变 World Time 维度与高级派生 Track；
4. **V4 AI consistency：** 跨 Entity/时间绑定检查，修复经人工确认；
5. **稍后 CreativeBranch：** 备选 State 对比/合并，明确与 Timeline Track 分离。

迁移全程既有资源表仍为权威。ChangeEvent 历史不得暴露为创作 Timeline；World Time 值不得强制进单一日历；Timeline 移动不得静默变更 Entity State；分支工作不得在 V1–V3 语义稳定前开始。

复选框图例：`[x]` 已完成 · `[~]` 部分完成 · `[ ]` 未开始。

---

# 2. 阶段总览
```
Phase 0: Foundation             (2-3 weeks)
    ↓
Phase 1: Core Domain             (3-4 weeks)
    ↓
Phase 2: AI Agent Pipeline       (4-5 weeks)   ← Moved earlier (B-Line)
    │   Video generation: Mock Adapter
    ↓
Phase 2.5: First Provider Integration (2-3 weeks)
    │   Controlled DeepSeek + SiliconFlow (image / video / audio) loop
    ↓
─────────────  IP Core (product foundation, ADR-0008)  ─────────────
    ↓
Track H: Entity + State + Timeline + Track       [H3 done]
    │   H4 read-only Presentation Timeline is the next action
    ↓
Track I: IP Core world entities  (3-5 weeks, slice-gated)
    │   I1 WorldEvent (ADR-0011 done) → I2 Relationship (ADR-0012 done) → I3 Organization
    ↓
Track J: Creator Chat continuous conversation (2-3 weeks)
    │   May run in parallel with Track I
    │
    │   Track K: world-first UI information architecture
    │   K1 · K2 / K3 in progress (feat/creator-layer-first) · K4 after Production Skill
    ↓
─────────────  Generation productionization  ─────────────
    ↓
Phase 3: Productionize Real Generation (3-4 weeks)
    ↓
Phase 4: Asset & Refinement      (3-4 weeks)
    ↓
Phase 5: Polish & Launch         (2-3 weeks)
```

Phase 0–2.5 建成了表达层并端到端证明了流水线。IP Core 建设表达层所依赖的世界层。生成生产化随后进行，因为值得拍摄的世界必须先存在，拍好它才会成为硬约束。

**MVP 总估算：24–34 周**（IP Core 在 Phase 3 之前增加 5–8 周）

Track I 每次推进一块，且每块在下一块开始前需要晋级证据 — 见 [IP World Model Repositioning RFC](../architecture/rfc/IP-World-Model-Repositioning-RFC.md) §5。进入领域契约的实体（`WorldEvent`、`Organization`，以及被晋级的 `Relationship`）各自需要先有 ADR。

---

# 3. Phase 0：基础

**目标：** 项目脚手架、核心基础设施与开发环境。

### 范围

- [x] Monorepo 与包管理设置
- [x] 数据库 schema 迁移框架
- [x] 带路由、中间件、错误处理的 API 框架
- [x] 认证（注册、登录、JWT 会话）
- [x] 带路由的前端应用壳（中文 UI）
- [x] UI 组件库基础（中文标签）
- [x] 对象存储集成
- [~] 任务队列设置 — BullMQ 适配器已存在；尚未接入 server/worker 路径
- [x] CI/CD 流水线
- [~] 开发、staging、生产环境 — 本地 Compose + env 模板；无 staging 部署

### 交付物

| 交付物 | 说明 | 状态 |
|-------------|-------------|--------|
| Repository structure | 含 `apps/`、`packages/`、`docs/` 的 Monorepo | 已完成 |
| Database schema | Project、Story、Scene、Shot、Asset、User 全部表 | 已完成 |
| API skeleton | 剩余 Phase 2.5+ stubs 返回 501 | 基本完成 |
| Auth flow | 完整注册 / 登录 / 会话管理 | 已完成 |
| App shell | 导航、项目切换、路由（中文标签） | 已完成 |
| Dev environment | 含全部服务的 Docker Compose、种子数据脚本 | 已完成 |

### 完成标准

- [x] 开发者可运行 `setup.sh` / `setup.ps1` 并获得可用本地环境
- [x] 已实现 API 路由有响应；剩余 stubs 返回 501
- [x] 用户可注册、登录并看到中文工作室壳
- [x] 每个 PR 定义了 lint、类型检查、测试、构建的 CI

---

# 4. Phase 1：核心领域

**目标：** 创作层级的完整 CRUD。用户可手动创建与组织 Project、Story、Scene 与 Shot。

### 范围

- [x] Project CRUD（API + UI）
- [x] Story CRUD（API + UI）
- [x] Scene CRUD 含重排（API + UI）
- [x] Shot CRUD 含完整 schema（API + UI）
- [x] 继承解析逻辑（经 `packages/domain` 读时合并）
- [x] Shot 生命周期状态机
- [x] 基础 Asset CRUD（Character、Location）
- [x] 资产引用解析
- [x] Character 参考图上传与存储

### 交付物

| 交付物 | 说明 | 状态 |
|-------------|-------------|--------|
| Project Dashboard | 列出、创建、删除项目 | 已完成 |
| Story Editor | 故事元数据与场景列表 | 已完成 |
| Scene Canvas | 含镜头的场景列表、重排 | 已完成 |
| Shot Editor | 按 Shot-Specification.md 的完整 Shot 字段表单 | 已完成 |
| Asset Browser | Character 与 Location 的列表与详情视图 | 已完成 |
| Inheritance Engine | 后端读时解析；已批准镜头使用快照 | 已完成 |
| Reference Image Upload | 上传并挂接图像到 Character 与 Location | 已完成 |
### 完成标准

- [x] 用户可创建 Project、添加 Story、划分为 Scene，并定义 Shot
- [~] 继承经读时解析工作（不是向所有 shot 写级联）
- [x] Shot 状态机正确转换（approve / unfreeze / duplicate）
- [x] 资产引用在 API 响应中正确解析
- [x] Character 参考图正确上传与显示

### 关键 API 端点（可用）
```
Projects:    CRUD
Stories:     CRUD
Scenes:      CRUD + reorder
Shots:       CRUD + reorder + duplicate + approve/unfreeze
Assets:      CRUD (Character, Location only) + list/filter
Media:       Upload reference images
```

---

# 5. Phase 2：AI Agent 流水线（含 Mock 生成）

**目标：** 完整 AI Agent 编排与 mock 视频生成。用户在每一阶段获得 AI 协助，从想法到结构化创作产出，但视频产出为占位符。

这是 B-Line MVP：创作流水线完全可用，视频模型集成推迟。

### 范围

- [x] Story Agent（从 brief 生成故事）— Mock LLM
- [x] Scene Agent（将故事分解为场景）— Mock LLM
- [x] Visual Prep Agent（识别每 Scene 的 Character/Location 视觉需求与复用建议）
- [x] Shot Agent（将场景分解为带字段配置的镜头）
- [x] Prompt Agent（从已解析 Shot 数据构造提示词）
- [x] Asset Agent（从描述生成角色/地点）
- [x] Orchestrator（协调多 Agent 工作流）
- [x] 工作流状态机与持久化
- [x] 每阶段自动化级别配置
- [x] 每阶段人机协同审阅门禁
- [x] 每次视频生成请求前的强制提示词审阅
- [x] **Mock Generation Adapter** — 返回占位视频
- [x] 生成队列 UI 与 mock 进度模拟 — 项目页任务列表 + BullMQ/内存 worker
- [~] 场景视觉资产审阅面板 — 嵌入 WorkflowPanel；非独立画廊

### Mock Adapter 规格

Mock Adapter 实现 `VideoGenerationAdapter` 接口，但产出占位结果：
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

占位视频以文本叠加显示 Shot 的结构化数据，使用户可端到端验证提示词构造与生成流程。

### 交付物

| 交付物 | 说明 | 状态 |
|-------------|-------------|--------|
| Agent Runtime | 通用 Agent 执行框架 | 已完成 |
| Individual Agents | Story、Scene、Shot、Prompt、Asset、Visual Prep | 已完成（Mock） |
| Orchestrator | 带审阅门禁的工作流 DAG 执行器 | 已完成 |
| Workflow UI | 项目页 `WorkflowPanel` + 镜头提示词/产出流 | 已完成（待稳定） |
| Automation Settings | 启动载荷上的每阶段自动化级别 | 已完成 |
| Asset Agent UI | Character/Location AI 辅助流程 | 部分完成（经工作流） |
| Mock Adapter | 占位视频生成 | 已完成 |
| Generation Queue UI | 项目页 `GenerationQueuePanel` | 已完成 |

### 完成标准

- [x] 用户可输入创作 brief 并获得完整 Story（含 Scene 与 Shot）（Mock）
- [x] 用户可批准必需的 Scene、视觉资产与提示词门禁；全自动模式不可绕过提示词审阅
- [x] Shot Agent 配置 Shot 字段（镜头、灯光、角色动作、对白）
- [x] Prompt Agent 从 Shot 数据构造完整提示词
- [x] Mock 生成产出带正确元数据的占位视频
- [x] 工作流可取消；中断运行在 API 启动时重新入队；暂停/恢复已延期（取消 + 恢复）

### Agent 质量指标（Phase 2）

| Agent | 目标质量 |
|-------|---------------|
| Story Agent | 用户对叙事结构评分 ≥4/5 |
| Scene Agent | 场景拆解每场景人工编辑 ≤1 次 |
| Shot Agent | 镜头描述每镜头字段调整 ≤2 次 |
| Prompt Agent | 生成提示词结构良好并遵循模板 |
| Asset Agent | 生成的 Character/Location 描述完整可用 |

---

# 6. Phase 2.5：首批提供商集成

**目标：** 验证受控、最小的真实提供商回路：适配器契约、异步任务、成本记录与失败恢复。这是 2–3 周的非生产体验，不是生产级生成产品或完整审阅 UI。

| 能力 | 提供商 | 集成范围 |
|------------|----------|-------------------|
| Text | DeepSeek | Story、Scene、Shot、Prompt Agent 的结构化输出 |
| Image | SiliconFlow | Character/Location 关键图与 Scene 变体生成 |
| Video | SiliconFlow | 使用已批准参考图的文生视频 / 图生视频 |
| Audio | SiliconFlow | 对白 TTS → Media（与图像/视频同一轮） |

提供商凭证位于服务端 `.env`（全局）。UI 可在运行时选择模态厂商 + 自定义模型 ID（进程覆盖）；项目级 BYOK 仍属稍后。

### 范围

- [x] 用于补全与结构化输出的 `DeepSeekAdapter`
- [x] 用于文生图的 `SiliconFlowImageAdapter`
- [x] 用于视频提交 + 状态轮询的 `SiliconFlowVideoAdapter`
- [x] 用于语音合成的 `SiliconFlowAudioAdapter`
- [x] 缺少密钥时回退 Mock 的提供商注册表
- [x] 运行时提供商/模型选择 API + 项目 UI
- [ ] 仅服务端的按项目 BYOK 凭证存储（替换 stubs）
- [ ] 统一的按次用量/成本记录
- [x] 适配器契约测试（mock fetch）
### 完成标准

- [x] 配置密钥后 DeepSeek 路径可用于 schema 有效的 Story/Scene/Shot/Prompt
- [x] Visual prep 可调用 SiliconFlow（或 Mock）图像生成
- [x] 视频生成使用所选 SiliconFlow/Mock 适配器
- [x] 可生成对白音频并存为 Media
- [ ] 提供商失败保留创作数据，且可重试而不产生重复 Media 或 Output 记录

---

# 7. Phase 3：真实生成生产化

**目标：** 将 Phase 2.5 验证过的适配器——DeepSeek 与 SiliconFlow——生产化，并交付完整的生成、审阅与版本管理体验。

适配器模式继续允许在不改动领域的情况下加入 Qwen、GPT、Claude、GPT Image、FLUX、Vidu 与 Veo。

### 范围

- [ ] 已验证适配器的生产限流、队列、重试与监控
- [ ] 使用已批准 Scene 视觉资产绑定的图生视频支持
- [ ] 真实生成任务队列与 worker
- [ ] 真实任务的基于 SSE 的实时进度
- [ ] Review Agent（分析生成视频，建议改进）
- [ ] 带并排 Shot 规格 vs. 生成视频的 Review Panel
- [ ] 产出版本管理
- [ ] Shot Editor 中的提示词预览面板

### 角色一致性策略

角色一致性使用图生视频方法：
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

这不需要 LoRA 训练或模型微调。首条生产路径使用 Kling 图生视频；其他视频提供商可通过同一适配器接口加入。

### 交付物

| 交付物 | 说明 |
|-------------|-------------|
| Real Generation Adapter | 与生产视频生成 API 集成 |
| Image-to-Video Pipeline | 用于角色一致性的参考图条件生成 |
| Generation Worker | 后台任务处理器（真实 API 调用） |
| Generation Queue UI | 全部生成任务的实时进度 |
| Output Management | 版本历史、激活版本切换 |
| Review Panel | 并排 Shot 规格 vs. 生成视频 |
| Review Agent | 自动产出分析与改进建议 |

### 完成标准

- [ ] 用户可从任意 Shot 生成真实视频
- [ ] Character 参考图被传给生成模型
- [ ] Review Agent 对生成视频提供结构化反馈
- [ ] 用户可批准/拒绝/重试生成视频
- [ ] 多个产出版本可存储并可切换

---

# 8. Phase 4：资产与精炼

**目标：** 高级资产管理、完整资产分类、视频组装与 UX 打磨。

### 范围

- [ ] 完整 Asset 分类支持（Prop、Style、Knowledge、Prompt Template）
- [ ] 资产引用图可视化
- [ ] 批量操作（重新生成 Scene 内全部 Shot、将 Style 应用到 Project）
- [ ] 高级 Shot Editor 功能（类关键帧对比、A/B 测试）
- [ ] 经 FFmpeg 的视频组装（将已批准产出拼接为最终视频）
- [ ] 导出（下载组装视频、将项目导出为归档）
- [ ] 提示词模板编辑器
- [ ] 带关系图的知识库编辑器
- [ ] 跨全部实体类型的高级搜索

### 经 FFmpeg 的视频组装

视频组装使用 FFmpeg 作为后端进程。MVP 无嵌入式时间线编辑器 — 组装为批量操作。
```
Shot 1 (approved) ─┐
Shot 2 (approved) ─┼─→ FFmpeg concat → transitions → audio mix → Final Video
Shot N (approved) ─┘
```

**支持的 FFmpeg 操作：**

| 操作 | FFmpeg 命令模式 |
|-----------|----------------------|
| Concatenation（拼接） | `concat` demuxer 或 filter |
| Crossfade transition（交叉淡化转场） | `xfade` filter |
| Audio normalization（音频归一化） | `loudnorm` filter |
| Subtitle burn-in（字幕烧录） | `subtitles` filter |
| Format conversion（格式转换） | 编解码选择、分辨率缩放 |

未来阶段可集成基于时间线的编辑器，但 Phase 4 使用 FFmpeg 做自动化批量组装。

### 交付物

| 交付物 | 说明 |
|-------------|-------------|
| Asset Taxonomy | 全部 7 种资产类型的完整支持 |
| Reference Graph | 显示项目中资产用法的可视化图 |
| Batch Operations | 多选与批量动作 |
| Video Assembly | 基于 FFmpeg 的 Shot 拼接为最终视频 |
| Prompt Template Editor | 创建与编辑提示词模板的 UI |
| Knowledge Editor | 世界观文档的富文本编辑器 |
| Export | 项目归档与视频导出 |

### 完成标准

- [ ] 全部 7 种 Asset 类型（Character、Location、Prop、Style、Media、Knowledge、Template）完全可用
- [ ] 用户可从 Character 详情页看到哪些 Shot 引用该 Character
- [ ] 用户可一键将 Style 应用到整个 Project
- [ ] 用户可经 FFmpeg 导出完整组装视频

---

# 9. Phase 5：打磨与发布

**目标：** 生产就绪、性能优化与发布准备。

### 范围

- [ ] 性能优化（懒加载、缓存、查询优化）
- [ ] 错误边界与优雅降级
- [ ] 加载状态与骨架屏
- [ ] 响应式设计审计
- [ ] 无障碍审计（WCAG 2.1 AA）
- [ ] 安全审计
- [ ] 负载测试
- [ ] 文档（中文用户指南、英文 API 文档）
- [ ] 分析与用量追踪
- [ ] 计费集成
- [ ] 入门流程

### 交付物

| 交付物 | 说明 |
|-------------|-------------|
| Production Deployment | 完整配置的生产环境 |
| User Documentation | 入门指南、功能导览（中文） |
| API Documentation | OpenAPI 规格、用法示例（英文） |
| Onboarding Flow | 首次用户交互教程（中文） |
| Monitoring Dashboard | 生产指标与告警 |

### 完成标准

- [ ] 页面加载时间 < 2 秒（p95）
- [ ] CRUD 端点 API 响应时间 < 200ms（p95）
- [ ] 零严重安全漏洞
- [ ] 符合 WCAG 2.1 AA
- [ ] 在 100 并发用户下负载测试性能可接受
- [ ] 完整用户入门流程经 5 名外部用户测试

---

# 10. 语言与本地化策略

| 层 | 语言 | 理由 |
|-------|----------|-----------|
| UI Labels | Chinese | 目标用户为讲中文的个人创作者 |
| Source Code Comments | English | 与文档及开源约定一致 |
| Database Field Values | 源语言（按输入为中文或英文） | 保留创作者原始表达 |
| AI Agent System Prompts | 海外模型用英文，国内模型用中文 | 针对各模型训练数据分布优化 |
| Video Generation Prompts | 默认英文；使用国内模型时用中文 | 提示词效果随模型训练数据而异 |
| Technical Documentation | English | 供代码 Agent 消费与开源兼容 |
| User-Facing Documentation | Chinese | 目标用户群体 |

---
# 11. 风险登记

| 风险 | 可能性 | 影响 | 缓解 |
|------|-----------|--------|------------|
| 视频生成 API 不稳定 | Medium | High | 业务适配器抽象；Phase 2 已有 Mock Adapter |
| LLM 输出质量不一致 | High | Medium | 每阶段审阅门禁；默认人机协同 |
| AI API 调用成本超支 | Medium | High | BYOK 用量记录与按项目、按提供商可强制成本限额；生成前显示预估成本 |
| 继承复杂度缺陷 | Medium | Medium | 完整解析测试套件；继承 vs 本地字段可视化 diff |
| 并发生成竞态 | Low | High | 幂等任务设计；严格状态机转换 |
| Shot Editor 范围蔓延 | High | Medium | 严格遵循 Shot-Specification.md schema；自定义字段推迟到 Phase 4 |
| 角色一致性限制 | High | Medium | 带参考图的图生视频；迭代至可接受 |
| 双语提示词复杂度 | Low | Medium | 模型特定提示词模板；自动语言检测 |

---

# 12. 团队与资源估算

对于 2–3 名具备 AI/ML 经验的全栈工程师团队：

| 阶段 | 工程师 | 周数 | 关键技能要求 |
|-------|-----------|-------|----------------------|
| Phase 0 | 2 | 2-3 | DevOps、全栈、数据库设计 |
| Phase 1 | 2-3 | 3-4 | 全栈、领域建模 |
| Phase 2 | 2-3 | 4-5 | LLM 提示工程、Agent 架构、工作流引擎 |
| Phase 2.5 | 2-3 | 2-3 | 提供商适配器、异步任务、契约测试、BYOK 防护 |
| Phase 3 | 2-3 | 3-4 | 后端（队列、SSE）、前端（实时 UI）、生产 AI API 集成 |
| Phase 4 | 2 | 3-4 | 前端（复杂 UI）、FFmpeg、媒体处理 |
| Phase 5 | 2 | 2-3 | DevOps、性能、安全、无障碍 |