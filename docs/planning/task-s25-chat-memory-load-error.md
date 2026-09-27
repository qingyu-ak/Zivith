# Feature

功能名称：Chat 扮演里世界资源失败时，「调整记忆」不要整块消失

> Status: **Implemented** — 2026-09-25。`feat/chat-memory-load-error`。路明非资源失败时对白还在，出现「无法加载这个世界的角色与记忆」+「重试加载记忆」；重试后「调整记忆」回来。不因 resources 失败清掉扮演线程。
>
> 所属 Journey：**E（对话改变世界）** §1.6 调整记忆 / 再聊验证
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) Journey E、§5 六态、§12、§25
>
> **确认前不写代码。** 不改数据模型。不顺手改 CharacterArchive 内部无重试（可顺带给这一块外层重试即可）。不插队安装包。

## User Problem

用户遇到的问题：

已经在和角色说话，标题还在，但「调整记忆」没了。其实是本世界资源接口失败，被当成「这个对话没有世界」。用户会以为记忆功能坏了，或这个角色没有记忆可调。

核对现状（2026-09-25，`develop` `e9a9db2`）：

```377:384:apps/web/components/creator-chat/chat-panel.tsx
      } catch {
        if (!cancelled) {
          setRoleplayThreads([]);
          setCharacters([]);
          setCharacterAssets([]);
          setWorldEvents([]);
          setWorldResources(null);
        }
      }
```

```1742:1743:apps/web/components/creator-chat/chat-panel.tsx
                  {activeRoleplay && thread?.project_id && worldResources ? (
```

扮演对白本身（thread + messages）仍可能是成功的。失败被装成没资源。

## User Goal

用户希望完成：

扮演页资源暂时拉不下来时：对白还在，能看见失败、能重试。重试成功后「调整记忆」回来。不要把失败装成「这个角色没有记忆入口」。

## Entry

Chat 打开一场扮演（开折陈叔或龙族路明非均可）。本刀不新入口。

## Main Flow

```text
打开扮演
        ↓
拉本世界 resources + 扮演线程列表
        ↓
失败 → 扮演页错误 + 重试（调整记忆位置）
        ↓
重试成功 → 「调整记忆」按钮回来
```

## States

### Empty

- 资源成功但没有记忆条目：仍走 CharacterArchive 现有空态。不是本刀。

### Loading

- 第一次进入、点重试：这一块忙碌，对白不必整页转圈（对话消息已有自己的 loading）。

### Success

- `worldResources` 有值，「调整记忆」与现在成功路径相同。

### Error

- 资源失败：中文说明（无法加载这个世界的角色与记忆一类）+ 重试。对白仍显示。不要藏掉入口。

### Retry

- 再拉同一 `project_id`。成功后清错误。不要自动打开记忆面板。

### Cancel

- 用户可以不点重试，继续看已加载的对白（若有）。不写入世界。

## Data

- 不写库。只读现有 `GET /world/projects/:id/resources` 与 `listRoleplayThreads`。
- 谁消费：扮演页「调整记忆」、切换角色下拉、时间锚点下拉（后两者失败时也可沿用同一错误，不要再造第三套）。
- 改了之后：失败可见；已加载消息不动；Studio 树不动。

## Cross-module Impact

- Web：`chat-panel` 该 `useEffect` 的 catch + 扮演页一块 Error/Retry。可抽 helper 方便单测。
- CharacterArchive 内部红字无重试：本刀外层重试即可，不改档案组件，除非确认同一刀必须碰到。
- API / Prisma：不动。

## User Control

失败必须说出来。重试由用户点。

## Recovery

网络恢复后点重试。

## Acceptance Criteria

1. 故意让扮演页 resources 失败：开折陈叔对话仍显示标题；出现错误 + 重试；不出现「再创建一个角色」一类假空；「调整记忆」不以成功形态藏起来。
2. 重试成功：「调整记忆」按钮回来，可点开。
3. 关闭再进同一线程：重新拉；成功则正常。
4. 雾城林晚 `7efb1748`、天台事件不动。
5. 单测：资源失败 ≠ `worldResources` 当成功空。

## Out of Scope

- CharacterArchive / EntityStages 内部每条请求的独立重试（除非外层不够）。
- 导入弹窗 Retry。
- 安装包、Agent、数据模型。

## Implementation Constraints

- 从 `develop` 开 `feat/chat-memory-load-error`。
- 不改 Prisma。世界 = `Project`。
- 一个提交只做这一刀。
