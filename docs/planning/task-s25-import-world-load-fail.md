# Feature

功能名称：导入时单个世界拉失败不要悄悄跳过

> Status: **Implemented** — 2026-09-25。`feat/import-world-load-fail`。Studio 龙族导入：其他世界 resources 全失败出现「有的世界没加载到…」+重试+关闭，不是「没有可导入的角色」；重试后开折/信使甲下拉。部分失败由单测覆盖（fog 成功 + down 计 failedCount）。
>
> 所属 Journey：**B（创建世界）/ C（第一次与角色生活）** 从其他世界导入角色卡
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) Journey B/C、§5 六态、§12、§25
>
> **确认前不写代码。** 不改数据模型。不插队安装包。弹窗整表失败的重试已在 `feat/import-dialog-retry`，本刀只补「单个世界被 continue」。

## User Problem

用户遇到的问题：

打开导入弹窗，`GET /projects` 成功了，但某个（或全部）世界的 resources 失败。代码把失败的世界 `continue` 掉。若全部失败，弹窗写成「没有可导入的角色」——其实是加载失败。若只失败一部分，那个世界像没人，用户会以为角色还在别的世界、这里导不出来。

核对现状（2026-09-25，`develop` `a4ecdcf`）：

```119:133:apps/web/lib/create-world-character.ts
  for (const project of projects) {
    if (!project.id || project.id === currentProjectId) continue;
    try {
      const resources = await api<WorldResourcesDTO>(`/world/projects/${project.id}/resources`);
      const characters = playableCharacters(resources.entities?.characters ?? []);
      if (characters.length === 0) continue;
      worlds.push({ ... });
    } catch {
      continue;
    }
  }
```

上一刀只修了 `/projects` 本身抛错。这条 `catch { continue }` 仍把失败装成空。

## User Goal

用户希望完成：

某个世界暂时拉不下来时：不要假装它没有角色。一个都没列出来且有失败 → 错误 + 重试。列出了一部分、另一些失败 → 列表还在，说清楚有世界没加载到，能重试。真正一个角色都没有（全部成功且空）才走「没有可导入的角色」。

## Entry

Studio「从其他世界导入」，或 Chat「开始扮演」里导入。同一对话框。本刀不新入口。

## Main Flow

```text
打开导入弹窗
        ↓
GET /projects 成功
        ↓
逐个 GET 其他世界 resources
        ↓
有失败且一个世界都没列出来 → 错误 + 重试 + 关闭
有失败但仍列出了世界 → 列表 + 说明 + 重试
全部成功且没有角色 → 现有空文案
全部成功且有角色 → 现有下拉
```

## States

### Empty

- 每个世界都加载成功，只是都没有可导入角色：现有空文案 + 关闭。

### Loading

- 第一次打开、点重试：「正在查找可导入的角色…」。

### Success

- 全部 resources 成功且有角色：现有世界/角色下拉。

### Error

- `/projects` 仍失败：沿用上一刀错误 + 重试 + 关闭。
- `/projects` 成功，但没有任何世界列出来，且至少一次 resources 失败：同一套错误 + 重试 + 关闭。不要「没有可导入的角色」。

### Retry

- 再调 `listImportableWorlds`。成功后按上面分流。不要自动确认导入。

### Cancel

- 关闭/取消/点遮罩：关掉弹窗，不写入。

## Data

- 不写库。仍只读 `GET /projects` 与各世界 `GET /world/projects/:id/resources`。
- `listImportableWorlds` 需要把「跳过了几次失败」一并返回（或抛错、或返回 `{ worlds, failedCount }`），供弹窗区分空与失败。
- 谁消费：同一导入对话框。
- 改了之后：失败可见；确认导入仍只拷角色卡。

## Cross-module Impact

- Web：`listImportableWorlds` 不再吞掉 resources 失败；`import-character-dialog` 用失败计数区分空/错/部分成功。可扩展上一刀 helper，或新开一个只测 failedCount 的函数。
- 不改确认导入、CharacterArchive、EntityStages、API / Prisma。

## User Control

失败必须说出来。重试、关闭由用户点。部分成功时仍让用户从已列出的世界里选，不强迫重试。

## Recovery

网络恢复后点重试。或关闭后再开。

## Acceptance Criteria

1. `GET /projects` 成功，故意让所有其他世界 resources 失败：弹窗错误 + 重试 + 关闭；不要「没有可导入的角色」。
2. 重试成功：出现世界/角色下拉（龙族打开时应能看到开折等）。
3. 点关闭：弹窗关掉，不写入。
4. 若走查时能做到「只搞垮一个世界」：列表仍在，并说明有世界没加载到；做不到就记在走查里，不挡验收 1–3。
5. 雾城林晚线程 `7efb1748`、天台事件 `8bc44d4e`、路明非线程 `f8f881f8` 不删。
6. 单测：`worldCount === 0` 且 `failedCount > 0` ≠ 空。

## Out of Scope

- 安装包、Agent、数据模型。
- 确认导入 POST 失败的重试（外层 busy 已有）。

## Implementation Constraints

- 从 `develop` 开 `feat/import-world-load-fail`。
- 不改 Prisma。世界 = `Project`。
- 一个提交只做这一刀。
