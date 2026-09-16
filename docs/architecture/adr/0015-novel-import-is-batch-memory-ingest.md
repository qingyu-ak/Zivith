# ADR-0015: Novel import is batch memory ingest with pre-authorized world writes

- **Status:** Accepted
- **Date:** 2026-08-30
- **Deciders:** Project owner / architecture maintainer
- **Class:** Standard
- **Reversibility:** Costly（撤销可级联，但已批准实体可能已被后续创作引用）
- **Source:** [Memory-Novel-Roleplay-Design.md](../../planning/Memory-Novel-Roleplay-Design.md) §5；实现 `NovelImportService`（2026-08-23）

## Context

创作者要把整本小说灌进已有 Project：角色、地点、事件、关系与记忆卡应一次出现在世界工作区，而不是逐条走 Creator Chat 提案。ADR-0010 规定世界实体须经确认后以 `draft` 进入；逐章确认会把导入变成不可用的向导。另一方面，静默写入已批准状态会绕过评审门禁。需要一条与「对话提案」不同、但仍可撤销的写入边界。

## Principles at Stake

- **Serves P8（记忆复利）：** 小说文本成为可检索的 L1/L2 记忆与世界实体，而不是一次性解析结果。
- **Serves P3（人类权威）：** 导入是显式用户动作（选文件、点导入）；报告可审阅；`DELETE` 按 importId 整体撤销。
- **Strains ADR-0010 混合制：** 导入路径不逐条弹出提案确认。可接受，因为预授权范围限于这一次上传，且必须可整体撤销；运行中新发现的规则冲突仍只报告不自动修（H9）。

## Decision

**小说导入是分层记忆管线的批量摄取模式，不是第二条世界写入管线。**

- 输入是章节文本（multipart txt；UTF-8 优先，非法则 GB18030），产出同一套 `MemoryAtom` / `MemoryCore`，并归档写入 `Asset` / `WorldEvent` / `Relationship`。
- 导入视为**批量预授权**：产物直接落库，不逐条 `apply-intent`。角色分层（全量卡上限 / 轻量 draft）、规模上限由配置约束。
- **不**把 `Project.worldview` 静默整组覆盖；要点只进导入报告的 `worldviewHighlights`，世界观仍走 World Builder 提案。
- 每条导入记录保存报告（实体 ID 清单）。`DELETE /novel-imports/:id` 按该清单级联软删世界层、删除记忆层、关闭相关扮演线程。
- 扮演对话（M3）**当时**不是本决策的写入通道：扮演只沉淀 episodic 记忆，不创建或修改世界实体。

## Product Constitution overlay（2026-09-16）

[产品宪法](../../product/Product-Constitution.md) 要求与角色的对话可以产生需确认的世界变化（Journey E）。因此：

- **仍有效：** 已有世界内的 TXT 导入是批量预授权，用报告 + 整体撤销，不逐条提案。
- **覆盖：** 「扮演永远不是世界写入通道」不再是产品完成定义。扮演若写入 `WorldEvent` / `Relationship` / 角色状态，必须走提案确认（[ADR-0010](0010-creator-chat-is-the-world-first-continuous-conversation-surface.md) 围栏），不得静默落库。
- **未覆盖：** 不得把导入路径改成「上传 TXT 即自动新建世界且无确认」。从 TXT **新建**世界的预览确认流，若要做，须单独设计并确认，不自动扩大本 ADR。

## Alternatives Considered

- **逐条提案确认：** 拒绝。数十个角色与事件会使导入无法完成；与「显式上传即授权本批」的用户意图不符。
- **只写记忆层、不写世界层：** 拒绝。世界工作区与时间线将看不到小说人物与事件，导入无法服务 G4（讨论书中事件与地点）。
- **导入直接写入 `approved`：** 拒绝。绕过评审门禁（P6）。当前实现角色全量卡为 `active`、次要为 `draft`、事件/关系为 `approved` 以便立刻出现在世界线——后续若收紧状态机须另开 ADR，不得在无撤销的前提下再放宽。

## Trade-off Record

| We gained | We gave up | Horizon |
|-----------|------------|---------|
| 一次上传得到可用世界与记忆 | 放弃逐条提案确认 | 当导入开始写入已被后续 Shot 引用的实体时，撤销语义必须再议 |
| 报告 + 整体撤销 | 初版没有按章 retry / 轻量升级 | 已补 `POST /novel-imports/:id/retry` 与 `upgrade`，不必改本 ADR |
| 编码与停用词启发式 | 规则抽取仍会漏/误实体 | 有密钥 LLM 抽取晋级时再评 D7 上限 |

## Consequences

- API：`POST/GET/DELETE /api/v1/novel-imports`，以及 `POST /novel-imports/:id/retry`、`POST /novel-imports/:id/upgrade`。世界工作区提供导入面板。原文存在 `NovelImport.config.sourceText`，列表与详情不回传。
- 数据：`NovelImport` / `NovelImportChapter`；报告 JSON 为撤销的权威 ID 清单。
- 合规：CI 与本地均须从 `@zivith/database` 进口 Prisma 类型（与实现文件一致）。
- 再议触发：导入产物被制作层引用后撤销会破坏 Shot；或用户要求导入写入 `approved` 且不可撤销。

## Compliance

- 无 `POST /novel-imports` 却走 `apply-intent` 逐条确认，视为违反本 ADR。
- 无报告 ID 却硬删世界实体，视为违反本 ADR。
- 扮演路由若开始静默 `asset.create` / `worldEvent.create`（无用户确认），视为违反 ADR-0010。经提案确认的写入不再要求先写取代 ADR；见本文件 Product Constitution overlay。
