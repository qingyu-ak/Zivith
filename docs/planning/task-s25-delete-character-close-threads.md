# Feature

功能名称：删除角色时关掉与 TA 有关的扮演对话

> Status: **Implemented** — 2026-09-25。`DELETE /assets/:id` 对 character 先 `archiveRoleplayChatsForCharacter` 再软删。开折删林晚：卡和 `bd2cbeae` 扮演关掉；陈叔/信使甲/世界构建还在；雾城 `7efb1748` 与天台 `8bc44d4e` 不动。
>
> 所属 Journey：**B（创建世界）** 恢复 + **C**「错误可以恢复」：人没了，侧栏不再留一场对空气说话
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) Journey B/C、§5 六态、§12 用户控制、§25
>
> **确认前不写代码。** 不改数据模型。对话归档走现有 `archiveCreatorChat`（与用户删对话同一套）。不插队安装包。

## User Problem

用户遇到的问题：

删掉角色卡后，侧栏还挂着「与「林晚」对话」。点进去人已经不在树上。删卡本意是拿掉这个人，对话入口却还活着。

核对现状（2026-09-25）：

- `DELETE /assets/:id` 只软删 Asset。
- 用户删对话：`DELETE /creator-chats/:id` → 线程 `archived`，对应 `RoleplayThread` `closed`。
- 群聊：`participantAssetIds` 含该角色；1:1：`characterAssetId` 即该角色。
- 世界构建对话（非扮演）不应被删角色牵连。
- 已写入世界事件、记忆原子本刀仍不级联删（与上一刀相同）。

## User Goal

用户希望完成：

确认删除一张可扮演角色卡后：本世界没有这张卡，也没有还开着的「和这个人聊」的扮演入口。世界事件还在。源世界（若是导入来的）不变。

## Entry

仍是 Studio Inspector「删除」。确认文案改为说清：将关掉本世界里与 TA 有关的扮演（含 TA 在场的群聊）。取消则卡和对话都不动。

Chat 侧栏本刀不第二套删除角色入口。

## Main Flow

```text
Studio 选中可扮演角色 → 删除
        ↓
确认（文案含将关掉的扮演）
        ↓
服务端同一请求：软删 Asset + 归档相关扮演线程
        ↓
树里没有这张卡；侧栏没有那些扮演
        ↓
若当时正开着被关的对话 → 离开到对话列表或该世界 Studio
```

判定「与 TA 有关的扮演」（仅 `status=active` 且 creator chat `state=active`）：

- 1:1：`characterAssetId === 被删角色` 且不是群聊
- 群聊：`participantAssetIds` 含被删角色

用户只是「你扮演」成这个人、AI 对方是别人：不关（`userCharacterAssetId` 命中但对方还在）。避免删「我自己」的说话卡——「我」本来就不能删。

## States

### Empty

- 没有相关扮演：确认文案写「没有进行中的扮演要关」；仍删卡。

### Loading

- 删除中按钮忙碌，不能连点。

### Success

- 卡软删。命中的扮演线程与用户手动删对话相同：侧栏消失，`GET` 该线程 404「对话不存在」。
- 未命中的扮演、世界构建对话、其他角色、事件、记忆：保留。
- 走查雾城信的林晚对话，不因删除开折的林晚而消失。

### Error

- 删卡失败：对话也不关（同一请求，失败则两边都不算完成）。中文错误，可重试。
- 部分线程已归档：跳过，不报错。

### Retry

- 卡已删、对话还在：再点删除不应出现（卡已不在树）。若 API 重入：已软删返回 404，不误伤别的对话。

### Cancel

- 确认框取消：不删卡、不归档对话。

## Data

- 写：现有 `DELETE /assets/:id` 内，角色类型时调用现有归档。不新表。
- 谁消费：Chat 侧栏、Studio 对话列表、正在看的 Chat 页。
- 改了之后：当前世界扮演列表变；世界事件列表不变。

## Cross-module Impact

- API：`DELETE /assets/:id` 对 character 归档相关扮演。地点删除行为不变。
- Web：确认文案更新；若当前 `pathname` 是被归档线程，跳到 `/creator-chats` 或该世界 Studio。
- 不改 Prisma。

## User Control

删除仍必须确认。确认文案写明对话会被关掉、事件还在。不静默关对话。

## Recovery

删错了：不能从回收站恢复卡或对话（与现有删对话相同）。可从其他世界再导入卡；旧对白不自动回来。

## Acceptance Criteria

1. 开折删除「林晚」：树里没有林晚；「与「林晚」对话」侧栏没有；`GET` 原线程 404。信使甲还在。雾城林晚和 `7efb1748` 还在。天台事件 `8bc44d4e` 不动。
2. 开折若有「林晚+信使甲」群聊：删林晚后该群聊也关；只剩信使甲的 1:1 还在。
3. 取消确认：卡和对话都在。
4. 正在看将被关的对话时删除：不会停在「对话不存在」死页而不给下一步（离开到列表或 Studio）。
5. 单测：删角色归档 1:1 与含该人的群聊；不归档世界构建线程；不归档其他角色的 1:1。

## Out of Scope

- Chat 第二套删角色。
- 级联删事件、记忆、关系。
- 恢复已归档对话。
- 删「我」。
- 安装包。

## Implementation Constraints

- 从 `develop` 开 `feat/delete-character-close-threads`（上一刀 `feat/delete-character` 已合并，不在旧分支上续改）。
- 不改 Prisma。世界 = `Project`。
- 归档语义与用户删对话一致，不硬删消息行。
