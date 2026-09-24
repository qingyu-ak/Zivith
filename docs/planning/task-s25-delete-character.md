# Feature

功能名称：Studio 删除角色卡

> Status: **Implemented** — 2026-09-24。`feat/delete-character`。Studio 可删除可扮演角色卡（软删）；「我」不能删；不级联对话和事件。
>
> 所属 Journey：**B（创建世界）**「数据可删除」，服务 **A/C** 的恢复：导错人、建错人能拿掉
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) Journey B 验收「数据可删除」、§5 六态、§12 用户控制、§25
>
> **确认前不写代码。** 不改数据模型，不新建 `World` 表。角色仍是 `Asset(type=character)`。不插队安装包。

## User Problem

用户遇到的问题：

刚能从其他世界导入角色。导错了、建错了，Studio 里地点/事件/关系有「删除」，角色没有。导入任务单的恢复写的是「用现有 Studio 删除」——现有没有。

核对现状（2026-09-24，`develop` `e6e0b09`）：

- Inspector 删除只对 `world_event` / `location` / `relationship`。地点走已有 `DELETE /assets/:id`（软删）。
- 角色 Inspector 能改卡，没有删除。
- 「我」这张 `user_self` 说话卡不能当可扮演角色删掉（没有删除入口也不该加）。
- Chat 角色 Tab / 开始扮演弹层能新建角色，没有导入，也没有删除。本刀不把删除做到 Chat。

## User Goal

用户希望完成：

在当前世界 Studio 选中一张可扮演角色卡，确认后这张卡从本世界消失。不再出现在树、扮演选择里。源世界（若是导入来的）不变。

成功时用户知道：是这张卡没了，不是整个世界没了。

## Entry

入口（当前世界 Studio）：

1. 选中角色 → Inspector 与地点相同位置出现「删除」。
2. 确认文案说清：角色卡从本世界去掉；不自动删对话全文、不删已经写入的世界事件。

Chat 开始扮演弹层、角色 Tab 本刀不第二套删除。

## Main Flow

```text
Studio 选中可扮演角色
        ↓
删除
        ↓
确认
        ↓
DELETE /assets/:id（现有软删）
        ↓
树里没有这张卡；Inspector 回到项目
```

## States

### Empty

- 没有角色：没有删除按钮（本来就没有卡）。
- 选中「我」：不出现删除。

### Loading

- 删除中：按钮忙碌，不能连点。

### Success

- 本世界角色列表少一张。
- 地点/事件/其他角色不变。
- 已有扮演线程还在侧栏（不级联删除对话）。再点该角色「对话」入口已不存在；旧线程能打开则仍是旧对白，不能再从树上开新的。
- 该角色亲历/短事实不再挂在一张可见卡上（不在本刀做记忆级联清理）。

### Error

- 已删 / 网络失败：中文错误，卡还在，可关可重试。
- 取消确认：不写库。

### Retry

- 失败后可再点删除。已成功的不会再删出第二张洞。

### Cancel

- 确认框取消：不删。

## Data

- 读：当前选中 `Asset(character)`。
- 写：现有 `DELETE /assets/:id` 软删。不改 Prisma。
- 谁消费：Studio 树、Chat 扮演选择（`playableCharacters` 已过滤软删后的列表）、Inspector。
- 改了之后：只当前世界角色列表变。导入来源世界不变。

## Cross-module Impact

- Web：Inspector 删除条件加上 `character`（排除 `user_self`）。
- API：不新路由。
- 对话 / 事件 / 关系：本刀不级联删。旧线程残留是已知缺口，另开一刀（删角色时关掉扮演线程或提示「还有 N 场对话」）。
- 数据模型：不改。

## User Control

删除必须确认。高风险（级联清对话、清事件）本刀不做，所以确认文案必须写明「对话和已写入事件还在」。

## Recovery

删错了：本刀不做「从回收站恢复」。可从其他世界再导入，或新建一张同名卡（记忆不会自动回来）。

## Acceptance Criteria

1. 开折 Studio 删除导入的「林晚 副本」：树里没有；信使甲还在；走查雾城信林晚还在。
2. 取消确认：开折角色数不变。
3. 「我」没有删除按钮。
4. 开折「与林晚对话」旧线程还在侧栏（不因为删副本而消失；删的是副本不是正在聊的那张则更干净）。走查时删副本，不删正在用的林晚主卡，除非所有者同意。
5. 单测或契约：`user_self` 不走删除 UI 条件；取消不调 DELETE。

## Out of Scope

- Chat 第二套导入/删除入口。
- 级联删除扮演线程、记忆原子、世界事件、关系。
- 故事/场景/维度删除。
- 从回收站恢复。
- 安装包、日历替代事件锚点、World Builder 抽取引擎。

## Implementation Constraints

- 从 `develop` 开 `feat/delete-character`。
- 不改 Prisma。
- 世界 = `Project`。删除 = 当前 Project 软删 Asset。
- 安装包仍不插队。
