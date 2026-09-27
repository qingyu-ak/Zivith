# Feature

功能名称：用小说 TXT 预览后创建世界（P0-01b）

> Status: **Implemented — 2026-09-16**
>
> 所属 Journey：**A（第一次使用）** / **B（创建世界）**
>
> 宪法依据：产品宪法 Journey A/B、§25；世界 = `Project`。用户已确认完善新建世界未完成路径。

## User Problem

新建世界中心里「导入小说 TXT」只能看说明，不能上传。用户必须先建空世界，再在 Dock 里导入，确认前就会写入世界。

## User Goal

上传 `.txt` → 看到角色/地点/事件预览 → 确认名称 → 得到已填充的世界并进入 Studio。取消或失败不留下半成品世界。

## Entry

`/projects/new` →「导入小说 TXT」

## Main Flow

```text
上传 .txt
  → POST /novel-imports/preview（只分析，不写库）
  → 预览 + 可改世界名称
  → 确认并创建世界
  → POST /projects（createWorldProject）
  → POST /novel-imports（既有写库，ADR-0015 仅在确认之后）
  → /projects/:id/world
```

## States

### Empty

尚未选择文件。提示选 `.txt`，不超过 20MB。

### Loading

- 解析中：「正在分析世界观与角色…」，可取消。
- 创建中：「正在创建…」，不可重复提交。

### Success

进入该世界 Studio。预览里列出的角色/地点/事件已在世界中。

### Error

- 非 txt / 过短 / 过大：中文错误，留在上传步。
- 解析失败：留在上传步，可重新选择。
- 创建失败：留在预览；若世界已建但写入失败，撤销该世界后可再确认。

### Retry

同一预览再次确认；或重新选择文件再分析。

### Cancel

- 取消选文件 / 取消解析：不创建世界。
- 预览点返回：不创建世界。

## Data

- 预览：无表。请求内规则抽取，响应不含原文、不含实体 ID。
- 确认后：`Project` + World Line + 既有 NovelImport 写 `Asset` / `WorldEvent` / `Relationship` / 记忆。
- 不新建 `World` 表、不新建草稿表、不改 Prisma schema。

## Cross-module Impact

| 模块 | 变化 |
|------|------|
| `POST /novel-imports/preview` | 新增，免登录，与已有导入同前缀 |
| `NovelImportService.previewFromText` | 与写库共用 `buildImportPlan` |
| `/projects/new` TXT 卡片 | 真实向导 |
| 已有世界 Dock 导入 | 不改，仍预授权直写 + 撤销 |

## User Control

「确认并创建世界」之前不写 `Project` / 世界实体。选文件、看预览、取消都不是确认。

## Recovery

解析取消或失败：无 Project。创建后写入失败：删除刚建的世界；删不掉则提示去列表删除。

## Acceptance Criteria

```text
[x] 上传 txt → 预览有角色等列表，此时库中尚无该世界
[x] 取消 / 返回 → 无新 Project
[x] 确认 → 世界存在，Studio 能看到预览中的主角
[x] 过短 / 非 txt / 过大 → 中文错误
[x] 确认失败可在预览重试，不留下无法打开的死世界（或提示删除）
[x] 已有世界 Dock 导入行为不变
[x] 无密钥可完成规则预览
[x] Empty / Loading / Success / Error / Retry / Cancel 均有中文
```

## Out of Scope

- `.zivith` zip / 单文件包
- epub / docx
- LLM 抽取、草稿表、密钥持久化
- 改 Dock 导入为预览确认
- 新建 `World` 表

## Implementation Constraints

1. 不改 Prisma schema。
2. 预览与写入共用同一套规则聚合，避免「看见的」和「入库的」不一致。
3. 确认前禁止 `createWorldProject` 与 `NovelImportService.start`。
4. 写入仍走既有 `POST /novel-imports`，不平行发明第二套写世界管线。

## 实现记录（2026-09-16）

| 层 | 文件 | 说明 |
|----|------|------|
| API | `import-plan.ts` + `NovelImportService.previewFromText` | 规则抽取预览，不写库；与 `start` 共用聚合 |
| API | `POST /novel-imports/preview` | 免登录，20MB txt，不含原文 |
| Web | `lib/txt-new-world.ts` | 预览；确认后建世界再导入；导入失败则删除刚建世界 |
| Web | `/projects/new` TXT 卡片 | 上传 / 解析中 / 预览 / 创建中 |

测试：`novel-import-preview.test.ts`、`txt-new-world.test.ts`；既有 novel-import 写库测试仍通过。人工：预览后确认进入 Studio，可见预览中的角色。
