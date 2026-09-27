# Feature

功能名称：Studio 左侧项目树加载失败可以重试

> Status: **Implemented** — 2026-09-25。`feat/studio-tree-retry`。龙族资源失败时左树「无法加载项目树」+ 重试；重试后路明非回来。开折树仍有信使甲、陈叔。
>
> 所属 Journey：**B（创建世界） / C** 进 Studio 第一屏：树是找角色、地点、对话的入口
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) Journey B/C、§5 六态、§12、§25
>
> **确认前不写代码。** 不改数据模型。不顺手改角色行「对话」按钮、Chat 调整记忆。不插队安装包。

## User Problem

用户遇到的问题：

打开某个世界的 Studio，左侧项目树拉资源失败时，只看到红字或「无法加载项目树」。中栏世界线已经有「重试」，左树没有。用户只能刷新整页，选中态和未保存编辑会一起丢。

核对现状（2026-09-25，`develop` `64054a0`）：

- `ExplorerTree`（`app-shell.tsx`）在 `!resources` 时只渲染一行文案。
- 同一壳里的 `useStudioSelection()` 已经提供 `reload`、`error`、`loading`。
- `world-workspace.tsx` 中栏失败有重试按钮，左树没有对齐。

## User Goal

用户希望完成：

进 Studio 时如果左树暂时打不开：能看见失败、能点重试、重试成功后树回来。不要把失败停成死字。真空（还在加载）仍显示「正在加载项目树…」。

## Entry

打开 `/projects/:id/world`（或 Studio 其他页带左树）。左树是壳级 `ExplorerTree`，不新入口。

## Main Flow

```text
进 Studio
        ↓
左树拉世界资源
        ↓
失败 → 中文错误 + 重试
        ↓
重试成功 → 原有角色/地点/对话树
```

## States

### Empty

- 本刀不改「世界里还没有任何角色」的树空态。那是成功加载后的真空。

### Loading

- 第一次进入、点重试：已有「正在加载项目树…」。重试中按钮忙碌或暂时换成加载文案，不能连点。

### Success

- 树与现在成功路径相同。开折应仍能看见信使甲、陈叔。

### Error

- 资源失败：显示已有错误文案（或「无法加载项目树」），带重试。不要空白树冒充没实体。

### Retry

- 点重试调用现有 `reload()`。成功进入 Success。不要自动新建实体。

### Cancel

- 没有进行中的写入要取消。用户可以离开 Studio。不在失败时偷偷改世界。

## Data

- 不写库。只再读现有世界资源接口（`useStudioSelection` / `reload` 已有）。
- 谁消费：Studio 左树、间接影响 Inspector 选中。
- 改了之后：左树可恢复；中栏重试逻辑不拆掉、不合并成一个新抽象，除非现成函数能直接复用。

## Cross-module Impact

- Web：`ExplorerTree` 失败 UI 加按钮。可抽 helper 方便单测（loading / error / ready）。
- API / Prisma：不动。

## User Control

失败必须说出来。重试由用户点。不静默轮询。

## Recovery

网络恢复后点重试即可。

## Acceptance Criteria

1. 故意让 Studio 资源失败：左树显示错误 + 重试；不是只有一行红字、也不是空树。
2. 重试成功：开折树里仍有信使甲、陈叔；对话 2（世界构建 + 陈叔扮演）还在。
3. 加载中仍是「正在加载项目树…」，不闪错误。
4. 中栏世界线原有重试不回退。
5. 单测：失败态 ≠ 就绪空树。

## Out of Scope

- 角色行「对话」按钮静默失败。
- Chat 调整记忆因资源失败消失。
- CharacterArchive / EntityStages 无重试。
- 导入弹窗 Retry。
- 安装包、Agent、数据模型。

## Implementation Constraints

- 从 `develop` 开 `feat/studio-tree-retry`。
- 不改 Prisma。世界 = `Project`。
- 一个提交只做这一刀。
