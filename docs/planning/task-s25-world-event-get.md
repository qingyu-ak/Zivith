# Feature

功能名称：已写入的世界事件可以按 id 打开；走查留下的外套测试事件用现有删除清掉

> Status: **Implemented — 2026-09-24**。`GET /world/world-events/:id` 对未删除事件返回 200；软删后 404 `WORLD_EVENT_NOT_FOUND`。Studio 已用现有删除清掉外套测试事件。确认本任务单后已落地。
>
> 所属 Journey：**E（确认后看见写入）**，核对 **D（删对话世界还在）**
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) Journey E/D、§5 六态、§25
>
> **确认前不写代码。** 不改数据模型，不新建 `World` 表。

## User Problem

用户遇到的问题：

1. 扮演里确认过的事件，在 Studio 时间线看得到，但按 id 去打开会说「不存在」。用户会以为写入丢了。
2. 龙族时间线上多了一条「路明非把外套搭在天台栏杆上」，和「坦白见过龙王」挤在一起。

核对现状（2026-09-24，未改代码）：

- 「路明非在天台向诺诺坦白见过龙王」`8bc44d4e` **还在列表里**，`GET /api/v1/world/projects/5364ad4e…/world-events` 能拿到。
- `GET /api/v1/world/world-events/:id` 一律 404，`code` 是通用 `NOT_FOUND`，不是 `WORLD_EVENT_NOT_FOUND`。原因：这条路由根本没注册。列表 / PATCH / DELETE / approve 都有；角色资产、场景有 GET by id，世界事件没有。
- Studio 点事件走的是列表 + PATCH/DELETE，不依赖这条 GET。所以界面没崩，但走查脚本和以后深链会误判「丢了」。
- 外套事件 `8d3a5713` 不是确认天台时多写出来的。来源是 Journey D 边「删对话」用的群聊 `542807ce`：外套那句发了两次，一张拒绝、一张确认；对话已删，**已确认写入按产品设计应留在世界里**。

## User Goal

用户希望完成：

确认写入之后，用同一条事件 id 再打开，看到的就是刚才那条，而不是「不存在」。走查留下的外套测试事件可以从 Studio 删掉，时间线只剩用户认的那件天台事。

成功时用户知道：写进去的事件找得到；不想留的测试事件能删掉。

## Entry

入口：

- 扮演确认写入后，Studio 时间线点开该事件
- 按 id 请求 `GET /world/world-events/:id`（走查、深链、以后别的界面）
- Studio 事件上已有的「删除」（清外套用这条，不新做删除）

## Main Flow

正常流程：

```text
确认一张世界变化卡
        ↓
列表里出现该事件
        ↓
GET /world/world-events/:id 返回同一条（title / description / character_ids）
        ↓
若这条是走查垃圾：Studio 删除 → 列表和时间线都没有 → GET 才是 404 WORLD_EVENT_NOT_FOUND
```

## States

### Empty

不新增空列表界面。项目没有事件时，现有 Studio 空态保持。

### Loading

不改 Studio 加载。新 GET 在 API 侧同步返回，无新 Spinner。

### Success

- 未删除：GET 200，字段与列表中该项一致。
- Studio 删除外套后：时间线不再显示该条；天台坦白仍在。

### Error

- id 不存在或已软删：404，`WORLD_EVENT_NOT_FOUND`，「世界事件不存在」。
- 不再把「没这条路由」伪装成事件丢了。

### Retry

GET 失败后重试同一 id。删除失败沿用现有错误条 + 可再点删除。

### Cancel

删除已有 `window.confirm`。取消则事件还在。本切片不改确认文案。

## Data

涉及数据：

- 读：`WorldEvent`（`GET /world/world-events/:id`，`deletedAt = null`）。
- 写：只用现有 `DELETE /world/world-events/:id` 清外套测试行；确认后才删。
- 谁消费：走查、以后深链；Studio 仍以项目 resources / 事件列表为准。
- 改了之后：Chat 提案卡不改；删外套后角色亲历按现有 `forgetChatFactsForEvent` 处理。不回写扮演线程（外套群聊已归档）。

## Cross-module Impact

影响哪些模块：

- API：`registerWorldEventRoutes` 补 GET，与 PATCH/DELETE 同一套 `deletedAt` 判定。
- 单测：存在 → 200；软删/乱 id → 404 `WORLD_EVENT_NOT_FOUND`。
- Studio / Chat：不改界面。清外套是走现有删除按钮。
- 数据模型：不改。

## User Control

哪些操作需要用户确认：

- 删除外套事件：现有删除确认。本切片走查时点一次。
- 补 GET：只读，无需确认。

## Recovery

如何撤销 / 恢复：

- GET 只读，无撤销。
- 误删事件：当前产品没有「从回收站恢复 WorldEvent」。本切片不新做恢复。走查只删外套测试行，不删天台 `8bc44d4e`。

## Acceptance Criteria

完成标准：

1. `GET /api/v1/world/world-events/8bc44d4e-2aff-4e5e-abcd-43a4a0a2515b` 返回天台坦白，不再是通用 `NOT_FOUND`。
2. 乱 id / 已删除 id：404 `WORLD_EVENT_NOT_FOUND`。
3. 单测覆盖存在与 404。
4. 走查：Studio 龙族删除「路明非把外套搭在天台栏杆上」→ 列表与时间线只剩原天台坦白（以及小说导入那些旧事件，不在本切片清理）。删外套时取消一次，事件还在；再确认才消失。
5. 不删 Journey E 主线程 `f8f881f8`，不删天台事件。

## Out of Scope

本次明确不做：

- 删对话时自动撤回该场所确认的世界写入（那会改 Journey D 完成定义）。
- 同一条用户断言拆成多张卡 / 确认时只应用其中一张（apply 仍是整卡）。
- 日历时间、安装包、角色导入。
- 给 Studio 做事件深链路由。
- 清理龙族小说导入产生的大量短标题事件。
- 补 GET `/relationships/:id`（除非实现时发现与事件同一缺口且你另开一刀）。

## Implementation Constraints

实现约束：

- 从 `develop` 开 `fix/world-event-get`。
- 世界事件路由保持免登录（ADR-0013），不要套 `requireMember`。
- 软删后 GET 必须 404，与 DELETE 语义一致。
- 不改 Prisma schema，不新建表。
- 清外套只走现有 DELETE，不写一次性脚本去改库。
- 安装包仍不插队。
