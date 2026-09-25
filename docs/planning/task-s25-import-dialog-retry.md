# Feature

功能名称：导入角色对话框加载失败时可以重试

> Status: **Implemented** — 2026-09-25。`feat/import-dialog-retry`。Studio 龙族导入弹窗 `/projects` 失败出现「无法加载可导入的角色」+「重试」+「关闭」，没有假空；重试后出现开折/信使甲下拉；取消关掉，未写入。
>
> 所属 Journey：**B（创建世界）/ C（第一次与角色生活）** 从其他世界导入角色卡；Chat「开始扮演」同一对话框
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) Journey B/C、§5 六态、§12、§25
>
> **确认前不写代码。** 不改数据模型。不插队安装包。CharacterArchive、EntityStages 已有重试，本刀不动。

## User Problem

用户遇到的问题：

点「从其他世界导入」，世界列表拉不下来。弹窗只剩红字和「关闭」。用户只能关掉再开。失败没有被装成「没有可导入的角色」（错误分支与空分支是分开的），但停成死字。

核对现状（2026-09-25，`develop` `0422910`）：

```28:49:apps/web/components/world/import-character-dialog.tsx
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void listImportableWorlds(currentProjectId)
      .then(...)
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason));
      })
      ...
  }, [currentProjectId]);
```

```80:91:apps/web/components/world/import-character-dialog.tsx
        ) : error ? (
          <div className="space-y-3">
            <p className="text-xs text-red-600" role="alert">{error}</p>
            <button ... onClick={onCancel}>关闭</button>
          </div>
```

加载在 `useEffect` 里，失败没有按钮再调一次。「关闭」是 Cancel，不是 Retry。

`listImportableWorlds` 里单个世界 resources 失败会被 `continue` 掉，弹窗会当成「这个世界没有角色」。那是另一刀，本刀只修整表 `/projects` 失败（对话框进入 error）时没有重试。

## User Goal

用户希望完成：

导入弹窗暂时拉不下世界列表时：看得见失败、能点重试，也可以关闭。重试成功后出现世界/角色下拉（或真正的空：没有可导入的角色）。不必关掉再开。

## Entry

Studio 角色树「从其他世界导入」，或 Chat「开始扮演」里导入。同一 `ImportCharacterDialog`。本刀不新入口。

## Main Flow

```text
打开导入弹窗
        ↓
listImportableWorlds（先 GET /projects）
        ↓
失败 → 错误 + 重试 + 关闭
        ↓
重试成功 → 有角色则下拉；没有则现有空文案
```

## States

### Empty

- 加载成功但没有可导入角色：仍走现有「没有可导入的角色。先在别的世界创建，或在这里新建。」+ 关闭。不是本刀。

### Loading

- 第一次打开、点重试：「正在查找可导入的角色…」。背后 Studio/扮演页不必整页转圈。

### Success

- 有可导入角色：与现在的世界/角色下拉相同。

### Error

- 列表失败：中文说明 + 重试 + 关闭。不要装成空列表。

### Retry

- 再调 `listImportableWorlds(currentProjectId)`。成功后清错误。不要自动确认导入。

### Cancel

- 「关闭」或点遮罩：关掉弹窗，不写入。与现在相同。

## Data

- 不写库。只读现有 `GET /projects` 以及（成功后）各世界 `GET /world/projects/:id/resources`。
- 谁消费：Studio 导入、Chat 开始扮演导入（同一对话框）。
- 改了之后：失败可见可重试；真正点确认导入仍走现有拷贝角色卡（不带记忆/事件）。

## Cross-module Impact

- Web：`import-character-dialog.tsx` 把加载抽成可再调；错误旁加「重试」，保留「关闭」。可抽 helper 方便单测：加载失败 ≠ 空。
- 不改 `listImportableWorlds` 吞掉单个世界失败的行为。
- CharacterArchive、EntityStages、API / Prisma：不动。

## User Control

失败必须说出来。重试、关闭都由用户点。确认导入仍要用户再点一次。

## Recovery

网络恢复后点重试。或关闭后再开（现有路径仍可用）。

## Acceptance Criteria

1. 故意让 `GET /projects` 失败：Studio 或 Chat 打开导入弹窗，出现错误 + 重试 + 关闭；不要出现「没有可导入的角色」假空。
2. 重试成功：有角色则下拉可选；没有则现有空文案。
3. 点关闭：弹窗关掉，世界不被写入。
4. 雾城林晚线程 `7efb1748`、天台事件 `8bc44d4e`、路明非线程 `f8f881f8` 不删。
5. 单测：加载失败 ≠ 空列表成功态。

## Out of Scope

- `listImportableWorlds` 单个世界 resources 失败被跳过（看起来像那个世界没人）。
- 确认导入本身的失败重试（busy/onConfirm 已有外层）。
- 安装包、Agent、数据模型。

## Implementation Constraints

- 从 `develop` 开 `feat/import-dialog-retry`。
- 不改 Prisma。世界 = `Project`。
- 一个提交只做这一刀。
