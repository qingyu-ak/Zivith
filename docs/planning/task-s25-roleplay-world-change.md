# Feature

功能名称：扮演对话的世界变化确认

> Status: **Implemented — 2026-09-16 已按「实现约束」8–13 落地；待产品所有者人工走一遍 Journey E（Acceptance 最后一项）**
>
> 日期：2026-09-16
>
> 所属 Journey：**E（世界变化）**，并补 **C（与角色生活）** 里「聊完世界没变」
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) §8–10、§19 Journey E、立宪裁决「聊天与世界」
>
> 确认前不写代码。若应先做 Journey A（新建世界），这份作废。

## User Problem

用户遇到的问题：

已经能和一个角色聊天，角色也会回。但聊完一件事之后：

- Studio 时间线没有这件事
- 关系没有变
- 再聊时，世界好像没发生过刚才那件事

用户无法完成「进入世界 → 互动 → 世界真的往前走 → 我能看见并修改」。
普通聊天机器人到回复就结束了；Zivith 不应在这里结束。

## User Goal

用户希望完成：

1. 和一个已有角色说话，说清楚一件会发生在这个世界里的事。
2. 系统用明白的中文列出「世界可能因此发生的变化」（事件 / 关系 / 角色状态）。
3. 用户点确认或拒绝。确认后，Studio 里看得到；拒绝后，世界不变。
4. 再进入同一角色对话，角色按更新后的世界回应。

成功时用户知道：我确认了什么、世界因此多了什么、下一步可以去时间线看看或继续聊。

## Entry

入口：

- 已有世界、已有角色。
- Chat 侧栏「角色」Tab，或 Studio 角色「与此角色对话」，进入**单角色扮演**线程（现有 `RoleplayThread`）。
- 不新开独立页面，不改应用默认首页。

空世界、没有角色时：不走本功能。沿用现有「先创建角色」空态，不在本任务里做新建世界向导。

## Main Flow

正常流程：

```text
进入单角色扮演
    ↓
用户说话（例如：你把这件事告诉了陈默）
    ↓
角色按当前世界 / 时间锚点 / 记忆回复
    ↓
若这一轮使世界可能变化：同一条回复下出现提案卡
    ↓
用户确认或拒绝
    ↓
确认 → 既有 apply-intent 写入（draft 事件 / 关系 / 实体更新）
    ↓
Studio 时间线、关系、角色卡可看到
    ↓
用户继续聊或换锚点再聊 → 用更新后的世界
```

不是每一轮都必须有提案。没有世界变化时，只有对白，不假装「已记录」。

## States

### Empty

- 扮演线程还没有世界变化提案：正常，提示不必出现。
- 世界里没有角色：不能从本功能开始；现有空态引导去创建角色即可。
- 提案列表为空却说「已写入世界」：禁止。

### Loading

- 角色回复：沿用现有 SSE。长时间等待可停止（现有 Stop）。
- 分析「是否产生世界变化」不得另开无反馈的转圈。提案应跟在本轮回复上，或明确「正在整理世界变化…」且可取消（取消 = 本轮不提案，对白保留）。

### Streaming

- 对白可流式；提案在回复结束后一次给出，避免边说边改世界。
- Stop：停对白；未发出的提案不落库。
- 网络中断 / API 超时：对白按现有失败处理；不得留下半写入的世界实体。

### Success

- 确认后：提案卡变为已应用；中文说明写入了哪类对象（事件 / 关系 / 更新）。
- 数据已保存。提供「在 Studio 中查看」（现有进入 Studio / 实体链接即可）。
- 拒绝后：明确「未写入世界」，对白仍在。

### Error

禁止只显示 Error / 500。

例如：

```text
没能把这次对话写入世界。

可能是确认时保存失败。

[重试确认]
[查看原因]
```

角色回复失败与提案失败要分开说。

### Retry

- 回复失败：重新生成这一轮对白（现有能力则复用）。
- 确认失败：对同一条提案重试 apply，不重新聊天、不新建第二条提案。
- 幂等：同一 `message_id + proposal_key` 不创建第二个事件。

### Cancel

- 拒绝提案 = 取消写入。世界不变。
- 停止生成 = 取消本轮 AI；已发出的对白按现有消息处理；无提案则无世界变化。
- 离开页面：未确认提案保持未确认（回来仍在），不自动确认、不自动丢弃。

## Data

涉及数据：

| 数据 | 谁写 | 谁读 |
|------|------|------|
| `CreatorChatMessage` 对白 | 扮演路由（现有） | 本线程、上下文窗口 |
| `CreatorChatMessage.proposal` / `proposal_state` | 扮演本轮新增（现世界构建已有） | 提案卡、apply |
| `WorldEvent` | 用户确认后，经 `proposal-applier` | Studio 时间线、下一轮扮演亲历 |
| `Relationship` | 同上 | Studio、下一轮关系快照 |
| `Asset` 更新（`update_entity`） | 同上 | 角色卡、下一轮人设 |
| `MemoryAtom` / `MemoryCore` | 现有 `memory.ingest` 补充事实（自动） | 下一轮记忆摘要 |
| `ThreadContextState` | 现有压缩 | 仅 prompt，不是世界 |

不新增顶层实体，不新建 `World` 表，不把对话记录当成世界。

补充性记忆仍可自动沉淀（ADR-0014 混合制）。**事件、关系、角色/地点设定**必须确认。记忆冲突仍要确认（现有 CONFLICT）。

## Cross-module Impact

影响哪些模块：

| 模块 | 变化 |
|------|------|
| 扮演 Chat | 回复可带提案卡（复用 `ProposalCard`） |
| 世界构建 Chat | 不改主路径；apply API 共用 |
| Studio 时间线 | 确认后应出现新事件，无需手工刷新才能看见（至少再进入 / 再拉 resources 可见） |
| 关系 / 角色卡 | 确认后 Inspector / 档案同步 |
| 下一轮扮演 | `buildCharacterState` 读到新事件与关系（仍受时间锚点过滤） |
| 小说导入 | 不动 |
| 制作 / Shot | 不动；新事件保持 draft，不进生成流水线 |

若 Studio 仍显示旧数据：算本任务失败，不是「以后再说」。

## User Control

哪些操作需要用户确认：

- 创建 / 修改 `WorldEvent`
- 创建 / 修改 `Relationship`
- `update_entity`（角色或地点的世界设定）
- 记忆 CONFLICT（已有）

不需要确认（保持现状）：

- 角色对白本身
- 补充性记忆原子（不构成新世界实体）

禁止：

- 自动确认
- 扮演静默 `asset.create` / `worldEvent.create`
- 「完全访问」若已存在于世界构建，扮演默认仍逐步确认；若复用写入模式，必须让用户看得见当前是「每步确认」

高风险（删除世界、覆盖历史）本任务不做。

## Recovery

如何撤销 / 恢复：

- 确认前：拒绝即可，等于没发生。
- 确认后：实体为 draft。用户可在 Studio 编辑或删除该事件 / 关系（走现有删除；没有的要在验收里列为缺口，不得假装有 30 秒撤销）。
- 本任务不做客制「世界历史时间机器」。
- apply 失败不得留下半个事件；失败则 `proposal_state` 保持未应用。

## Acceptance Criteria

完成标准：

```text
[ ] 单角色扮演里，用户说出一件世界里会发生的事，回复后出现中文提案（事件和/或关系）
[ ] 确认前 Studio 时间线没有这条新事件
[ ] 确认后时间线 / 关系可见；拒绝后不可见
[ ] 再聊时角色能用到已确认的事件（在时间锚点允许的范围内）
[ ] 无提案的闲聊不出现「已记录」空承诺
[ ] 无密钥 mock 路径也能走出「回复 → 提案 → 确认 → Studio 看见」（与世界构建 mock 提案同级）
[ ] 确认失败可重试；取消/拒绝不写库
[ ] 不新增领域表；写库只走现有 apply-intent
[ ] Empty / Loading / Success / Error / Retry / Cancel 都有中文说明
[ ] 人工走一遍 Journey E：聊 → 事件提案 → 确认 → Studio 看 → 再聊
```

未完成：只在对白里说「我记住了」但没有提案；或确认后 Studio 看不到。

## Out of Scope

本次明确不做：

- 多角色群聊（Journey D）
- 新建世界 / TXT 导入新建 / `.zivith` 包
- 扮演里新建角色或地点（那是世界构建）
- 自动推进「当前世界时刻」时钟
- 把自动记忆改成全部手动
- Universe / World Map / 宇宙可视化
- 账号、云同步、官网
- 重构提案系统、记忆表、时间线组件
- 30 秒软删除撤销条（除非现有删除已经够用，不另做一套）

## Implementation Constraints

实现约束：

1. 先复用：`CreatorChatMessage.proposal`、`ProposalCard`、`POST .../proposals/:id/apply`、`proposal-applier`、`create_world_event` / `create_relationship` / `update_entity`。
2. 扮演 Agent 只**起草**提案，确认后才写世界。对白与提案可在同一条 assistant 消息。
3. 时间锚点与防剧透规则保持：不能用尚未发生的事件喂给角色；新确认的事件若晚于锚点，当前锚点下的角色仍不应「已经历」。
4. 一次最多提案数跟世界构建努力程度走，不另发明额度。
5. 用户文案称「世界」，存贮仍是 `Project`。
6. 不改 Prisma schema。若必须改字段，停下来报告。
7. 测试至少：正常、无变化闲聊、拒绝、确认、确认失败重试、再进入扮演、无密钥。

### 确认时补充的修订（2026-09-16，依据 [架构审计](../../ZIVITH_ARCHITECTURE_AUDIT.md) P0-3 / P0-4 / P1-1）

8. **前置修复 `update_entity` 的 `data` 整体替换**（审计 P0-3）：`proposal-applier.ts` 对角色 / 地点 `fields.data` 改为浅合并，否则任何经提案的角色更新都会抹掉 personality 等其它字段。本任务顺带修，附测试。
9. **起草范围 v1 = 事件 + 关系**：扮演起草器只产出 `create_world_event` / `create_relationship`。「角色状态变化」在 v1 通过事件参与（`character_ids`）与既有阶段修订表达；`update_entity` 由 applier 支持但扮演不主动起草，避免用一句对白整段覆盖角色描述。与 Acceptance「事件和/或关系」一致。
10. **提案卡必须列出内容**（审计 P1-1 的最小版）：事件显示标题 + 描述 + 参与角色；关系显示双方 + 关系；若出现 `update_entity`，列出 `fields` 的字段名与新值。不做 before / after diff。
11. **扮演线程恒为「每步确认」**：`chat-panel.tsx` 的自动写入判定对扮演线程恒返回 `ask`，卡片上标明「每步确认」。世界构建线程的写模式另议（已裁定改为可撤销的自动确认，独立任务）。
12. **起草分级**：无密钥 / `fast` 走规则起草；`balanced` / `deep` 在对白结束后再调一次结构化 LLM 起草，失败回落规则，不影响对白。规则起草复用世界构建的名字抽取，但**不得**产出自指关系或「未命名」实体（审计 P0-4，同处修复世界构建 mock）。
13. **锚点提示**：线程带时间锚点时，确认成功后提示「当前锚点在《X》之后，切换锚点后角色才会经历此事」。

## 实现记录（2026-09-16）

| 层 | 文件 | 说明 |
|----|------|------|
| API | `contexts/roleplay/world-change-drafter.ts` | 起草器：规则（`draftWorldChangesByRule`）/ LLM 结构化（`roleplayWorldChangeSchema` + `sanitizeLlmChanges`）；只产 `create_world_event` / `create_relationship`；未知 id、自指、已有关系一律丢弃；上限跟 effort |
| API | `contexts/world-builder/text-extract.ts` | 规则抽取共用：认已存在角色、关系词 → kind、事件动作信号、疑问/闲聊过滤、句子 → 标题 |
| API | `routes/roleplay.ts` | 对白落库并流出后再 `status: drafting_world_change` → 起草 → 挂到同一条 assistant 消息（`proposal` / `proposal_key` / `proposal_state=pending`）；客户端已断开则不落提案；`messageDto` 带提案字段 |
| API | `contexts/world/proposal-applier.ts` | `update_entity` 的 `data` 浅合并（`mergeAssetData`） |
| API | `contexts/world-builder/world-builder-agent.ts` | mock 不再产出自指关系 / 「未命名」实体（`isNamePlaceholder`、双角色识别） |
| Web | `lib/agent-write-mode.ts` | `decideWriteAction(..., { roleplay: true })` 恒 `ask` |
| Web | `components/creator-chat/chat-panel.tsx` | 扮演线程不自动写入；`status` 事件显示「正在整理这一轮对世界的影响…」；确认后刷新世界资源；锚点提示 |
| Web | `lib/chat-proposals.ts` / `components/creator-chat/proposal-card.tsx` | `describeProposal`：事件列标题 / 描述 / 参与角色，关系列双方，更新列字段；单条待确认提案默认展开；错误文案分开说「对白已保留 / 可重试确认 / 拒绝则世界不变」 |

测试：`test/roleplay-world-change.test.ts`（起草规则、LLM 清洗、回落、上限、世界构建 mock 守卫）、`test/roleplay-world-change-flow.test.ts`（内存 Prisma 走完 闲聊无提案 → 事件提案 → 拒绝不写 → 确认落 draft 且 resources 可见 → 重复确认 409 → 下一轮角色亲历）、`test/proposal-applier.test.ts`（`data` 合并）、web `agent-write-mode` / `chat-proposals` 测试。

未做（按 Out of Scope）：多角色、`update_entity` 起草、30 秒撤销、Studio 即时广播刷新（回 Studio 重挂即重拉）。
