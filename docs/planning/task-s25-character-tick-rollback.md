# Feature

功能名称：扮演角色刻度回退（Journey D 走查 2.5 缺口）

> Status: **Implemented — 2026-09-21**。产品所有者确认修：群聊侧边横条点角色句应能回退，不能只弹层后报「只能回退到你发出的那一句」。
>
> 所属 Journey：**D（多角色互动）**；1:1 扮演同样可用。Agent / 世界构建仍只回退用户句。
>
> 宪法依据：产品宪法 Journey D、§8–10。世界 = `Project`。不改数据模型。

## User Problem

Chat 已经给每一句对白打了侧面刻度，点角色条会弹出「回退到这里」。确认后接口拒绝，红字「只能回退到你发出的那一句」。走查 2.5 按文档点角色横条走不通。读者句回退是通的。

## User Goal

用户希望：点诺诺（或任何在场角色）的那条小横条并确认后，那一句还在，后面的对白当作没发生；排在切点之后、本场已确认的写入从时间线拿掉。Agent 对话不要变成每句 AI 都能回退。

## Entry

扮演 / 群聊线程右侧刻度。不改入口、不改顶栏。

## Main Flow

1. 点某条角色侧边横条。
2. 弹层：这一句还在；列出将拿掉的对白、未确认提案、本场因此写入。
3. 确认回退 → 头指针落到这句；后面抑制；切点之后的本场 apply 软删。
4. 取消 → 对话与世界不变。

## States

### Empty

还没有对白：没有刻度，无从回退。

### Loading

确认后按钮「回退中…」，不可连点。

### Success

该句仍在窗口里；后面的句不显示；若撤了本场写入，提示条说明拿掉了几条。

### Error

找不到句 / 线程已归档：现有错误横幅。Agent 点到助手句仍是「只能回退到你发出的那一句」。

### Retry

失败后弹层可再确认，或关掉再点同一刻度。

### Cancel

弹层「取消」或点遮罩：不改历史、不改世界。

## Data

不新建表。仍用 `CreatorChatMessage.suppressed`、`CreatorChatThread.activeHeadMessageId`、本场 `applied_entity_id` 软删。谁消费：对话窗口、刻度、记忆失效、Studio 时间线。Agent 线程没有 `RoleplayThread` 行，继续只允许 `role=user`。

## Cross-module Impact

`POST /world/creator-chats/:id/rollback`。Chat 刻度 UI 已按句打点，不改交互。Studio Agent 刻度仍是用户句。不改角色卡、不改记忆层结构。

## User Control

回退本身已有确认弹层。世界写入只撤本场、切点之后、且未被 Studio 手改 / 未被别的扮演锚定的。

## Recovery

回退不可「反回退」成物理还原；L0 原文不删。再说话从新头往后长。

## Acceptance Criteria

- [x] 扮演 / 群聊：点角色刻度确认后，该句留下，后面的对白视为没发生
- [x] 切点之后本场已确认事件被软删；切点这一句上的已确认写入留下
- [x] 取消弹层不改对话
- [x] Agent / 世界构建仍只能回退用户句
- [x] 空线程、找不到句、失败横幅、取消、再进线程只看见头及之前

## Out of Scope

心情旋钮、Agent 每句刻度、物理删除 L0、把回退做成 Studio 手改的反向操作、重复提案去重（2.4 另洞）。

## Implementation Constraints

不改数据模型。不扩大到世界构建助手句。回退引擎 `rollbackCut` 已按任意 message id 切，只放行扮演的 `assistant` 目标。
