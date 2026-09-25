# Feature

功能名称：Chat「开始扮演」也能从其他世界导入角色

> Status: **Implemented** — 2026-09-25。`feat/chat-import-character`。Chat「开始扮演」复用 Studio 导入弹层。
>
> 所属 Journey：**C（第一次与角色生活）** 入口：进入 Chat → 选择/得到角色 → 开始聊天
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) Journey A/C、Character「创建角色」、§5 六态、§25
>
> **确认前不写代码。** 不改数据模型。复用已有 `importWorldCharacter` / `ImportCharacterDialog`。不插队安装包。

## User Problem

用户遇到的问题：

人已经在 Chat 侧栏点「开始扮演」，世界里还没有能开口的人（或想从别的世界带一个人来）。现在只能在弹层里填名字新建，或先绕去 Studio 点「从其他世界导入」再回来。

核对现状（2026-09-25，`develop`）：

- Studio 角色旁有「从其他世界导入」，弹层选世界→选人→确认。
- Chat「开始扮演」：无角色时只有 `CreateCharacterForm`；有角色时只列出本世界卡 + 新建/改卡。没有导入。
- 「开始群聊」弹层本刀不加第三套入口（避免分叉；群聊仍从本世界已有卡里选）。

## User Goal

用户希望完成：

在当前世界的「开始扮演」弹层里，也能从本机另一个世界导入一张可扮演卡。确认后这张卡出现在本世界，可以立刻开口。源世界不变，不搬记忆和事件。

## Entry

1. Chat 侧栏角色 Tab：某世界旁「开始扮演」。
2. 弹层内：「从其他世界导入」（有角色时与列表同层；没有可扮演角色时与「新建」并列）。
3. 点开后复用 Studio 那套弹层（选世界 → 选角色 → 确认 / 取消）。

没有当前世界：先打开世界。本功能不创建世界。

## Main Flow

```text
Chat → 开始扮演
        ↓
从其他世界导入
        ↓
选世界、选可扮演角色、确认
        ↓
本世界新建 Asset(character)
        ↓
弹层列表出现这张卡，可点开口 / 可取消回到列表
```

空世界：导入成功后不再只剩新建表单，改为列表（含刚导入的人）。

## States

### Empty

- 本机没有其他带可扮演角色的世界：导入弹层空说明（已有文案）+ 关闭。开始扮演弹层仍可新建。

### Loading

- 拉可导入列表：导入弹层加载中。
- 写入中：确认忙碌，不能连点。

### Success

- 本世界多一张卡，字段与 Studio 导入相同。
- 开始扮演列表能看见；可点「开始」进本世界新扮演。
- 源世界不变。

### Error

- 源角色已删 / 写入失败：中文错误，可关可重试。本世界不留半张卡。

### Retry

- 失败后再确认。成功后不要自动再插一张。

### Cancel

- 关导入弹层：不写库，开始扮演弹层还在。
- 关开始扮演：不写库。

## Data

- 读/写与 Studio 导入同一套：`POST /projects/:id/assets`。不新路由。
- 谁消费：开始扮演列表、Studio 树、扮演启动。
- 改了之后：当前世界角色列表变；源世界不变。

## Cross-module Impact

- Web：`chat-panel`「开始扮演」复用 `ImportCharacterDialog`。导入成功后刷新 `pickerAssets` / world resources。
- API / 数据模型：不改。
- 群聊弹层：本刀不加导入。

## User Control

导入前必须选世界、选人、点确认。

## Recovery

导错了：用已有 Studio 删除（下一刀会顺带关对话）。本刀不新做删除。

## Acceptance Criteria

1. 开折 Chat「开始扮演」导入走查雾城信的陈叔：开折出现陈叔，雾城陈叔/事件/对话不变。
2. 取消导入：开折角色数不变，开始扮演弹层还在。
3. 开折本来没有可扮演角色时，弹层同时能新建和导入（不只能填名字）。
4. 导入后可在该弹层开口，线程属于开折。
5. 单测：取消不调创建；同名冲突仍用「原名 副本」。

## Out of Scope

- 开始群聊弹层导入。
- 删角色、关对话（下一刀）。
- 从文件/JSON 导入。
- 安装包。

## Implementation Constraints

- 从 `develop` 开 `feat/chat-import-character`。
- 不改 Prisma。世界 = `Project`。
- 导入弹层继续 portal 到 `document.body`，避免被 Studio/Chat 层叠挡住。
