# Feature

功能名称：Chat「开始扮演 / 开始群聊」拉角色失败时不要装成没人

> Status: **Implemented** — 2026-09-25。`feat/chat-picker-load-error`。失败显示「无法加载角色列表」+ 重试；开折重试后看见陈叔、信使甲。
>
> 所属 Journey：**C（第一次与角色生活）** 入口：选人开口；走查里「怎么创建不了群聊」会误当成没角色
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) Journey C、§5 六态、§12 用户控制、§25
>
> **确认前不写代码。** 不改数据模型。不插队安装包。不顺手改 Studio 树、记忆面板、导入弹窗。

## User Problem

用户遇到的问题：

Chat 侧栏点「开始扮演」或「开始群聊」，弹层去拉本世界角色列表。接口失败时，现在把列表清空并当作加载完成。有角色的世界会看起来像「再创建一个角色」；群聊会像「没有人可以拉进来」。用户会以为世界是空的，而不是暂时打不开。

核对现状（2026-09-25，`develop` `c049bb1`）：

- `chat-panel.tsx` 拉 `/world/projects/:id/resources` 的 `catch`：`setPickerAssets([])` + `setPickerReady(true)`，不记错误。
- 对话本身加载失败已有「对话加载失败」+ 重试 + 新对话（本刀不改）。
- 世界线中栏加载失败已有重试（本刀不改）。

## User Goal

用户希望完成：

点「开始扮演 / 开始群聊」时，如果角色列表暂时拉不下来：能看见失败、能重试、能关掉。成功后再看到本世界已有的人（或真的没人时才出现新建）。不要把失败装成空世界。

## Entry

1. Chat 侧栏：某世界旁「开始扮演」或「开始群聊」。
2. 弹层正在拉本世界资源。

不新增第二套入口。不改 Studio 角色行「对话」按钮（下一刀另开）。

## Main Flow

```text
Chat → 开始扮演 / 开始群聊
        ↓
拉本世界角色与事件
        ↓
失败 → 中文错误 + 重试 + 关闭
        ↓
重试成功 → 原有列表或空世界新建表单
```

## States

### Empty

- 接口成功、本世界没有可扮演角色：仍走现有「再创建一个角色」/ 群聊空说明。这是真空，不是失败。

### Loading

- 第一次打开、点重试：弹层忙碌（已有 `pickerReady`），不能连点开始。

### Success

- 列表或空态与现在成功路径相同。导入入口仍在「开始扮演」（上一刀已做）。

### Error

- 资源接口失败：中文说明（无法加载角色列表一类），不要空列表冒充没人。

### Retry

- 点重试再拉同一世界。成功后进入 Success / Empty。不要自动新建角色。

### Cancel

- 关闭弹层：不写入、不留下半个扮演。下次再开重新拉。

## Data

- 不写库。只读现有 `GET /world/projects/:id/resources`。
- 谁消费：Chat 开始扮演 / 开始群聊弹层。
- 改了之后：失败可见；Studio 树、已打开的对话、角色卡都不动。

## Cross-module Impact

- Web：只改 Chat 弹层加载错误。可抽一小段文案/状态 helper 方便单测。
- API / Prisma：不动。

## User Control

失败必须说出来。关闭即取消。不在失败时偷偷新建或导入。

## Recovery

网络/API 恢复后点重试即可。不需要清数据。

## Acceptance Criteria

1. 故意让该世界 resources 失败：弹层显示失败 + 重试 + 关闭；不出现「再创建一个角色」冒充空世界。
2. 重试成功：开折能看见陈叔、信使甲；开始扮演可开口。
3. 真的没有可扮演角色的世界：成功加载后仍是现有空态新建（不是错误）。
4. 关闭后再打开：重新拉，不残留上次错误除非又失败。
5. 单测：失败 ≠ 空列表成功。

## Out of Scope（后面单独开刀）

- Studio 左侧树加载失败的重试（`app-shell` 项目树）。
- Studio 角色行「对话」按钮静默失败。
- Chat 里「调整记忆」因 worldResources 失败整块消失。
- CharacterArchive / EntityStages 错误无重试。
- 导入弹窗 Error 后补重试。
- 安装包、Agent、数据模型。

## Implementation Constraints

- 从 `develop` 开 `feat/chat-picker-load-error`。
- 不改 Prisma。世界 = `Project`。
- 一个提交只做这一刀。
