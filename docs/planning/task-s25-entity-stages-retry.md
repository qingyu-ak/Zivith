# Feature

功能名称：EntityStages 加载失败时可以重试

> Status: **Implemented** — 2026-09-25。`feat/entity-stages-retry`。Studio 路明非 revisions 失败出现「无法加载阶段状态」+「重试」，角色卡还在；重试后「最初 / 觉醒」阶段列表回来。
>
> 所属 Journey：**C（第一次与角色生活）** Studio 检视角色/地点的「阶段状态」
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) Journey C、§5 六态、§12、§25
>
> **确认前不写代码。** 不改数据模型。不顺手改导入对话框。不插队安装包。CharacterArchive 已有重试，本刀不动。

## User Problem

用户遇到的问题：

在 Studio 点开角色或地点，下方「阶段状态」拉修订失败。只剩一行红字，没有重试。用户只能换选别的条目再点回来，或整页刷新。失败没有被装成「这个角色没有阶段」（现有错误分支不会 `return null`），但停成死字。

核对现状（2026-09-25，`develop` `f81c77f`）：

```30:67:apps/web/components/world/entity-stages.tsx
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api<EntityRevisionListDTO>(
      `/world/projects/${projectId}/entities/${entityType}/${entityId}/revisions`,
    )
      .then(...)
      .catch((reason) => {
        if (!cancelled) setError(errorMessage(reason));
      })
      ...
  }, [projectId, entityType, entityId]);

  if (error) {
    return (
      ...
      <p className="mt-1 text-xs text-red-600">{error}</p>
    );
  }
  if (revisions.length === 0) return null;
```

加载在 `useEffect` 里，失败没有按钮再调一次。

## User Goal

用户希望完成：

阶段修订暂时拉不下来时：看得见失败、能点重试。重试成功后列表回来。不必换选角色或刷新整页。

## Entry

Studio 打开龙族，点选路明非（或开折陈叔）。地点同组件，不另开入口。Chat「调整记忆」不走这里。

## Main Flow

```text
Studio 点开角色/地点
        ↓
GET .../entities/:type/:id/revisions
        ↓
失败 → 「阶段状态」错误 + 重试
        ↓
重试成功 → 现有阶段列表；仍无修订则保持现在的空（整块不出现）
```

## States

### Empty

- 加载成功且没有修订：仍 `return null`（这一块不出现）。不是本刀要改的空文案。

### Loading

- 第一次点开、点重试：这一块「正在读取修订…」。左树、画布不必整页转圈。

### Success

- 有修订：与现在成功路径相同。

### Error

- 加载失败：中文说明 + 重试。不要 `return null` 装成没有阶段。角色卡正文仍显示。

### Retry

- 再拉同一 `projectId` + `entityType` + `entityId`。成功后清错误。不要自动选中某条修订。

### Cancel

- 用户可以不点重试，换选别的条目或离开 Studio。不写入世界。

## Data

- 不写库。只读现有 `GET /world/projects/:id/entities/:type/:id/revisions`。
- 谁消费：Studio 检视角色、地点（同一 `EntityStages`）。
- 改了之后：失败可见可重试；扮演页、左树、世界事件不动。

## Cross-module Impact

- Web：`entity-stages.tsx` 把加载抽成可再调的函数；错误旁加「重试」。可抽 helper 方便单测：加载失败 ≠ 空阶段。
- 导入对话框、CharacterArchive：不动。
- API / Prisma：不动。

## User Control

失败必须说出来。重试由用户点。

## Recovery

网络恢复后点重试。

## Acceptance Criteria

1. 故意让 revisions 失败：Studio 点开龙族路明非，角色卡还在；「阶段状态」出现错误 + 重试；不要整块消失。
2. 重试成功：有修订则列表回来；没有修订则这一块按现有空态消失。
3. 换选再点回来：重新拉；成功则正常。
4. 雾城林晚线程 `7efb1748`、天台事件 `8bc44d4e`、路明非线程 `f8f881f8` 不删。
5. 单测：加载失败 ≠ 空阶段成功态。

## Out of Scope

- 导入角色对话框 Retry。
- CharacterArchive（已做）。
- 安装包、Agent、数据模型。

## Implementation Constraints

- 从 `develop` 开 `feat/entity-stages-retry`。
- 不改 Prisma。世界 = `Project`。
- 一个提交只做这一刀。
