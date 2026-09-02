# ADR-0016: The local creative surface is an Electron window

- **Status:** Accepted
- **Date:** 2026-09-02
- **Deciders:** Project owner / architecture maintainer
- **Class:** Standard
- **Reversibility:** Reversible
- **Source:** 产品要求「Cursor 那种真实工作区路径」；扩展 [ADR-0013](0013-local-single-user-mode-no-login.md)

## Context

Creator Chat 要把用户磁盘上的一个已有文件夹当作世界工作区。浏览器的 `showDirectoryPicker` 只给出目录名（或 FileSystemHandle），拿不到绝对路径，因此无法把「同一路径再次打开 = 同一个世界」做成稳定身份。本机 API 虽能读盘，但若由 Fastify 进程弹出系统对话框，窗口焦点与权限边界都很差。需要一个与 Trae / Cursor 同类的本机窗口，才能用操作系统文件夹对话框拿到真实路径。

同时，把 IP Core、实体、聊天写成该目录里的文件是另一条更大的「世界即仓库」轨道：权威从 PostgreSQL 迁到磁盘布局，涉及同步、冲突与 ADR-0010 围栏。两条工作不能混在同一刀。

## Principles at Stake

- **Serves P3（人类权威）：** 打开哪个文件夹是显式用户动作；系统不 mkdir 空世界。
- **Serves ADR-0013（打开即用）：** 桌面窗口仍无登录；浏览器继续作为开发回退。
- **Strains P4（能力边界）：** 桌面壳能读用户选中的路径。可接受，因为路径只来自系统对话框，且当前不扫描磁盘、不写实体文件。

## Decision

**本地创作面是 Electron 窗口；世界工作区身份是用户选出的绝对路径。**

- `apps/desktop` 加载本机 Web（开发时 `http://127.0.0.1:3100`）。预加载桥 `window.zivithDesktop.openDirectory()` 调用 `dialog.showOpenDialog({ properties: ['openDirectory'] })`，把绝对路径交给 API。
- `Project.workspacePath` 是工作区主键语义：规范化后的绝对路径；同一路径再次打开复用同一项目（含软删恢复）。不按文件夹名字合并。
- Chat 侧栏「+」= 选择已有文件夹，不是新建空项目。项目内可新开聊天、改显示名、改聊天名、删除聊天。改项目名不重命名磁盘目录。
- 浏览器仍可打开 3100 开发，但不能当真路径工作区；提示改用 `pnpm desktop`。
- **不**在本决策内把实体或聊天落到文件夹文件。那是后续 Track W，须另开计划（并在需要时另开 ADR）。

本决策扩展 ADR-0013，不推翻无登录与本机单用户。不把 Postgres / Docker 换成便携 SQLite。

## Alternatives Considered

- **继续用浏览器 File System Access API：** 拒绝。Chrome 不暴露真实 OS 路径，无法做 Cursor 式工作区身份。
- **API 进程弹出 FolderBrowserDialog：** 拒绝。焦点落在后台服务、无窗口上下文，体验不像本地应用。
- **同步把世界写成目录文件：** 推迟。权威存储、导入导出与 ADR-0010 围栏尚未设计。
- **Tauri：** 可达到同样目标，但要引入 Rust 工具链；现有栈是 Node/Electron 更近 Cursor，改动更小。

## Trade-off Record

| We gained | We gave up | Horizon |
|-----------|------------|---------|
| 真实绝对路径作为工作区身份 | 开发时必须再开 Electron；浏览器不能完成「打开文件夹」 | 阶段 F 若以文件为权威，再议路径与 marker |
| 沿用现有 Web + API + Postgres | 第一刀不是免 Docker 安装包 | 便携安装另开轨道 |

## Consequences

- 根脚本 `pnpm desktop` 并行启动 API、Web 与 Electron。
- `POST /world/folders/open` 的合同是 `{ path }`，不再是 `{ name }`。
- 未绑定路径的旧项目仍可出现在侧栏，副标题为「未绑定文件夹」，直到用户用桌面应用打开一个目录。
