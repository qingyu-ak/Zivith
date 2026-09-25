# Feature

功能名称：Studio 角色行「对话」失败时要说出来

> Status: **Implemented** — 2026-09-25。`feat/studio-talk-error`。开折点陈叔「对话」失败显示「没能打开这场对话」且不跳走；恢复后再点进入 `2024610d`。
>
> 所属 Journey：**C（第一次与角色生活）** Studio 看角色 → 一键开口
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) Journey C、§5 六态、§12、§25
>
> **确认前不写代码。** 不改数据模型。不顺手改 Chat 调整记忆。不插队安装包。

## User Problem

用户遇到的问题：

Studio 左树角色旁有「对话」。点下去本应开一场扮演。接口失败时 `.catch(() => undefined)`，页面完全没动静。用户会以为按钮坏了，或已经进了对话其实没有。

核对现状（2026-09-25，`develop` `2f5ad85`）：

```451:456:apps/web/components/world/entity-explorer.tsx
              onAction={() => {
                void createRoleplayThread(resources.project.id, item.id)
                  .then((created) => {
                    router.push(`/creator-chats/${created.thread_id}`);
                  })
                  .catch(() => undefined);
              }}
```

- 同文件创建实体已有 `createError` 红字。
- Inspector「与 TA 对话」走 `RoleplayLaunchButton`，本刀不改那条。

## User Goal

用户希望完成：

在 Studio 点角色旁「对话」，如果暂时开不成：能看见中文失败、能再点一次。成功则仍跳到 Chat 那场扮演。取消就是不去点。

## Entry

Studio 左树：可扮演角色行上的「对话」。不是 Chat 侧栏「开始扮演」（上一刀已做失败态）。

## Main Flow

```text
Studio 树 → 角色旁「对话」
        ↓
创建或打开本世界这场 1:1 扮演
        ↓
成功 → 进入 /creator-chats/:threadId
失败 → 树附近中文错误，按钮可再点
```

## States

### Empty

- 不改「还没有角色」。没有可扮演卡时本来没有「对话」。

### Loading

- 请求中：该行「对话」忙碌（或整树这一动作忙碌），不能连点开两场。

### Success

- 跳到扮演页。开折点陈叔应进「与「陈叔」对话」（可复用已有线程，与现网行为一致）。

### Error

- 创建失败：中文说明。不要静默。

### Retry

- 再点「对话」。成功后清掉错误。不要自动连开第二场。

### Cancel

- 用户不再点。不写入半个线程（失败则服务端不应留下可点进的扮演；若现网已有幂等，保持）。

## Data

- 写：现有 `createRoleplayThread`（已有 API）。失败则不应让用户看到一场空扮演。
- 谁消费：Chat 侧栏、Studio 对话列表。
- 改了之后：失败可见；角色卡、事件不动。

## Cross-module Impact

- Web：`entity-explorer` 角色「对话」的 Error + Loading。可复用已有 `createError` 区域或并列一条 `talkError`。
- API / Prisma：不动。

## User Control

失败必须说出来。不静默。高风险删卡不在本刀。

## Recovery

网络恢复后再点「对话」。

## Acceptance Criteria

1. 故意让创建扮演失败：开折点陈叔「对话」出现中文错误，不跳走，树还在。
2. 恢复后再点：能进「与「陈叔」对话」。
3. 忙碌时不能连点开出两场。
4. 信使甲仍在；雾城林晚对话不动。
5. 单测或最小 helper：失败要有文案，不能当成功。

## Out of Scope

- Chat 调整记忆失败整块消失。
- Inspector「与 TA 对话」按钮（已有 RoleplayLaunch）。
- 群聊从树上一键开。
- 安装包、Agent、数据模型。

## Implementation Constraints

- 从 `develop` 开 `feat/studio-talk-error`。
- 不改 Prisma。世界 = `Project`。
- 一个提交只做这一刀。
