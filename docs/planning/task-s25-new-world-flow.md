# Feature

功能名称：新建世界中心 + 从零开始 + 打开已有 `.zivith/` 文件夹（P0-01a）

> Status: **Implemented — 2026-09-16**。总任务书第一项的第一刀已落地。
>
> 详细设计：[new-world-flow.md](../features/new-world-flow.md)
>
> 所属 Journey：**A（第一次使用）**，并补 **B（创建世界）** 的入口
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) Journey A/B、§25；用户口中的世界 = `Project`

## 已锁定决策

| 项 | 决定 |
|----|------|
| A. TXT 新建 vs 已有世界导入 | 并存。TXT 新建走预览确认；Dock 导入仍预授权直写。 |
| B. `.zivith` | **文件夹工程，不是压缩包。** 有 `.zivith/workspace.json` 即可。不做 zip、不做单文件、不发明第二套数据结构。 |
| C. 从零落点 | World Builder（`/creator-chats/:threadId`） |
| D. 打开已有世界落点 | Studio `/projects/:id/world` |
| E. TXT 卡片 | 已由 P0-01b 做成上传 → 预览 → 确认创建 |

## User Problem

打开 Zivith 后不知道怎样创建或找回世界。入口叫「新建项目」、Chat 会留下没有世界线的「未命名世界」。拷来的世界文件夹和「从零创建」混在一起。

## User Goal

1. 从项目页、文件菜单或 Chat 空态，到达同一个「新建世界」页。
2. 从零填名称，创建后进入 World Builder。
3. 若已有带 `.zivith/` 的世界文件夹：选「导入 Zivith 世界」→ 选文件夹 → 确认名称 → 打开该世界。
4. 取消则不留下半成品。

## Entry

全部进入 `/projects/new`：

- 项目列表 / 空状态「新建世界」
- 菜单「文件 → 新建世界」
- Chat「新建一个世界」

菜单「打开文件夹」保留：可对普通文件夹询问是否作为世界。第三张卡片**更严**：没有 `.zivith/` 就拒绝。

## Main Flow

```text
/projects/new
    ├─ 从零开始 → 名称 → 创建（folders/create 或 POST /projects）→ World Builder
    ├─ 导入小说 TXT → 预览 → 确认创建（P0-01b）
    └─ 导入 Zivith 世界
           ↓ 桌面选文件夹
           ↓ inspect（现有）
           ↓ 没有 .zivith/ → 「这不是一个 Zivith 世界」
           ↓ 有 → 预览名称 → 确认
           ↓ openWorldFromFolder（现有，含损坏/孤儿/复制冲突确认）
           ↓ Studio 世界工作区
```

网页无文件夹选择：第三张卡片只说明「请用桌面应用选择带 .zivith 的世界文件夹」。

## States

### Empty

- 三张卡片就是空态。
- 从零名称为空：不能提交。
- 导入 Zivith：尚未选文件夹。

### Loading

- 创建中：「正在创建…」
- 检查文件夹：「正在查看这个文件夹…」
- 打开中：「正在打开…」
- 禁止二次提交。

### Success

- 从零：进入该世界 World Builder；有 World Line。
- 打开已有文件夹：进入 Studio `/projects/:id/world`。

### Error

- 创建失败：「没能创建世界。请再试一次。」保留表单。
- 不是 Zivith 世界：「这不是一个 Zivith 世界。请选择含 .zivith 文件夹的目录，或改用从零开始。」
- 网页导入：「请使用 Zivith 桌面应用打开世界文件夹。」

### Retry

- 同一表单再创建；同一卡片再选文件夹。

### Cancel

- 返回三选一：不创建、不改绑定。
- 选文件夹对话框关掉：留在当前步。
- 损坏/孤儿/冲突确认框点否：不打开。

## Data

- 从零写入：`Project` + `ProjectTimeline` + World Builder 线程；可选 `.zivith/workspace.json`（现有 create）。
- 打开已有文件夹：不发明新表。复用 `POST /world/folders/inspect` 与 `open`。运行数据仍在本机数据库。
- 不写：zip、草稿表、Asset / 事件（本切片）、API Key。
- 唯一 API 收口：`POST /projects` → 已有 `createWorldProject`（补 World Line）。不新开导入接口。

## Cross-module Impact

| 模块 | 变化 |
|------|------|
| `/projects/new` | 三选一 + 从零表单 + 打开 `.zivith/` 文件夹 |
| 项目列表 / 菜单 / Chat | 入口收口；去掉 `createBareWorld` |
| 帮助快速上手 | 第一步「新建世界」 |
| `POST /projects` | 调用 `createWorldProject` |
| 打开文件夹菜单 | 保留，逻辑不删 |
| TXT 导入引擎 | 不动 |

## User Control

- 从零必须点「创建世界」。
- 打开已有世界必须点「打开这个世界」（inspect 成功之后）。
- 选文件夹不是确认。
- 没有 `.zivith/` 时，第三张卡片不得当成从零创建。

## Recovery

- 取消：无新 Project、绑定不变。
- 打开失败：世界文件夹原样留在磁盘。
- 从零失败：不留下无 Timeline 的 Project。

## Acceptance Criteria

```text
[ ] 项目页、文件菜单、Chat 空态到达同一个 /projects/new
[ ] 三张卡片：从零开始 / 导入小说 TXT / 导入 Zivith 世界
[x] TXT：上传 → 预览 → 确认后创建（见 task-s25-txt-new-world.md）
[ ] 从零创建 → 有 World Line → World Builder
[ ] 桌面从零可选文件夹 → workspace.json 的 worldId 与 Project.id 一致
[ ] 桌面导入：选带 .zivith/ 的文件夹 → 预览名称 → 打开 Studio
[ ] 选无 .zivith/ 的文件夹 → 拒绝且不建世界
[ ] 取消选文件夹 / 取消确认 → 不改绑定
[ ] Chat 不再直建「未命名世界」
[ ] POST /projects 有 ProjectTimeline
[ ] 不做 .zivith 单文件或 zip
[ ] 网页第三张卡片说明用桌面，无假上传
[ ] Empty / Loading / Success / Error / Retry / Cancel 均有中文
```

## Out of Scope

- P0-02 的 LLM 抽取 / epub（规则 TXT 路径已在 P0-01b）
- `.zivith` zip / 单文件包 / 第二套序列化
- 把 `world/` `characters/` 目录写成 Source of Truth（仍按 world-folder-v1：文件夹身份 + 数据库运行）
- 密钥持久化、多角色同场聊
- 新建 `World` 表

## Implementation Constraints

1. 不改 Prisma schema。
2. 用户文案称「世界」，存贮仍是 `Project`。
3. 复用 `createWorldProject`、`createWorldInFolderRequest`、`inspectWorldFolder`、`openWorldFromFolder`。
4. 第三张卡片用更严的包装：`not_a_world` 直接失败，不走 `on_missing=import`。
5. `POST /projects` 只接到 `createWorldProject`。
6. 测试：入口、空名、取消、有 Timeline、拒绝普通文件夹、有 `.zivith/` 可打开（可 mock inspect）、Chat 不再直建。

## 实现顺序（确认后执行）

1. API：`POST /projects` → `createWorldProject`。
2. Web helper：从零创建；打开已有 `.zivith/` 文件夹（拒绝 `not_a_world`）。
3. `/projects/new` 三选一 + 两条真实路径 + TXT 说明。
4. 收口入口与帮助。
5. 测试 + typecheck / lint / format。

## 实现记录（2026-09-16）

| 层 | 文件 | 说明 |
|----|------|------|
| API | `contexts/world/workspace.ts` | `createWorldProject` 可传入 `defaults` |
| API | `routes/resources.ts` | `POST /projects` 调用 `createWorldProject`，补 World Line |
| Web | `lib/create-scratch-world.ts` | 无文件夹 POST + 开线程；有文件夹走 `folders/create` |
| Web | `lib/world-folder.ts` | `openExistingZivithWorldFolder`：无 `.zivith/` 直接拒绝 |
| Web | `app/(studio)/projects/new/page.tsx` | 三选一中心 |
| Web | 项目页 / 菜单 / Chat / 帮助 | 入口收口，去掉直建「未命名世界」 |

测试：`create-world-project.test.ts`、`create-scratch-world.test.ts`、`world-folder.test.ts`。typecheck / lint 已过。人工 Journey A 待产品所有者走一遍。
