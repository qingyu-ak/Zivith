# Feature

功能名称：CharacterArchive 加载失败时可以重试

> Status: **Implemented** — 2026-09-25。`feat/character-archive-retry`。路明非「调整记忆」cores/atoms 失败出现「无法加载这个角色记得的事」+「重试」，没有「新建档案」；重试后重要聊天 50 条、档案正文「编辑档案」回来。对白还在。保存失败不走这条加载重试。
>
> 所属 Journey：**E（对话改变世界）** §1.6 调整记忆；Studio 检视同一组件一并带上
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) Journey E、§5 六态、§12、§25
>
> **确认前不写代码。** 不改数据模型。不顺手改 EntityStages、导入对话框。不插队安装包。

## User Problem

用户遇到的问题：

已经点开「调整记忆」或 Studio 里角色的「TA 记得什么」，档案正文和重要聊天拉不下来。页面只剩一条红字，没有重试。用户只能收起再打开，或离开再进。亲历事件、关系仍可能显示（它们来自已加载的 `resources`），档案和重要聊天这一块像坏了。

核对现状（2026-09-25，`develop` `0423963`）：

```94:116:apps/web/components/world/character-archive.tsx
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [coresPage, atomsPage] = await Promise.all([
        api<{ items?: MemoryCoreItem[] }>(`/memory/projects/${projectId}/cores`),
        api<{ items?: MemoryAtomItem[] }>(
          `/memory/projects/${projectId}/atoms?entity_type=character&entity_id=...`,
        ),
      ]);
      // ...
      setError('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [projectId, characterId, characterName]);
```

```291:298:apps/web/components/world/character-archive.tsx
      {error ? (
        <p className="mt-2 ..." role="alert">
          {error}
        </p>
      ) : null}
```

`load()` 已有，失败也写了 `error`，但没有按钮再调一次。保存/忘掉另走同一条 `error`，本刀不要把保存失败当成「再加载」。

## User Goal

用户希望完成：

档案和重要聊天暂时拉不下来时：看得见失败、能点重试。重试成功后列表回来。不必收起面板或离开页面。

## Entry

Chat 扮演里点「调整记忆」（开折陈叔或龙族路明非均可）。Studio 点开同一角色检视也会走到这个组件，不另开入口。

## Main Flow

```text
打开「调整记忆」/ 角色档案
        ↓
GET cores + atoms
        ↓
失败 → 错误 + 重试（这一块）
        ↓
重试成功 → 档案 / 重要聊天按现有成功路径显示
```

## States

### Empty

- 加载成功但没有档案、没有重要聊天：仍走现有空态（亲历/关系也可能有）。不是本刀。

### Loading

- 第一次打开、点重试：这一块「正在加载档案…」。对白、Studio 树不必整页转圈。

### Success

- cores/atoms 拉下来后，与现在成功路径相同。

### Error

- 加载失败：中文说明 + 重试。不要把失败装成「这个角色没有记忆」。亲历/关系若已有 `resources` 数据，可以继续显示；档案正文走错误，不要假装加载成功的空档案。

### Retry

- 再调现有 `load()`（同一 `projectId` + `characterId`）。成功后清加载错误。不要自动打开编辑。

### Cancel

- 用户可以不点重试，收起「调整记忆」或离开检视。不写入世界。编辑草稿不因加载重试被偷偷保存。

## Data

- 不写库。只读现有 `GET /memory/projects/:id/cores` 与 `GET /memory/projects/:id/atoms?...`。
- 谁消费：Chat「调整记忆」、Studio 角色检视（同一 `CharacterArchive`）。
- 改了之后：失败可见可重试；扮演消息、Studio 树、世界事件不动。

## Cross-module Impact

- Web：`character-archive.tsx` 加载错误与保存错误分开；加载失败旁加「重试」调已有 `load()`。可抽 helper 方便单测：加载失败 ≠ 空档案。
- EntityStages、导入对话框：不动。
- API / Prisma：不动。

## User Control

失败必须说出来。重试由用户点。保存失败仍用现有红字，不在保存失败上套「重新加载」（以免冲掉正在改的草稿）。

## Recovery

网络恢复后点重试。

## Acceptance Criteria

1. 故意让 cores 或 atoms 失败：打开路明非或陈叔「调整记忆」，出现错误 + 重试；不要只剩红字；不要出现「新建档案」当成成功空。
2. 重试成功：档案/重要聊天按成功路径回来。
3. 收起再打开：重新拉；成功则正常。
4. 保存档案失败：仍是保存红字，不出现「重试加载」去冲草稿。
5. 雾城林晚 `7efb1748`、天台事件 `8bc44d4e`、路明非线程 `f8f881f8` 不删。
6. 单测：加载失败 ≠ 空档案成功态。

## Out of Scope

- EntityStages 阶段状态失败重试。
- 导入角色对话框 Retry。
- 亲历事件 / 关系本身的 GET（它们来自已加载的 `resources`）。
- 安装包、Agent、数据模型。

## Implementation Constraints

- 从 `develop` 开 `feat/character-archive-retry`。
- 不改 Prisma。世界 = `Project`。
- 一个提交只做这一刀。
