# Feature

功能名称：桌面再开回到上次世界或对话

> Status: **Implemented — 2026-09-24**。关桌面再开回到上次扮演或 Studio 世界页。确认本任务单后已落地。
>
> 所属 Journey：**F（回来继续）**
>
> 宪法依据：[Product Constitution](../product/Product-Constitution.md) Journey F、§5 六态、§25
>
> **确认前不写代码。** 不改数据模型，不新建 `World` 表。

## User Problem

用户遇到的问题：

关掉桌面应用再打开，世界没有丢，但窗口总是空的创作面（`/creator-chats`，从左侧选一个项目）。上次正在聊的林晚、或正在看的 Studio，要再点一次。

核对现状（2026-09-24）：

- Electron 每次 `loadURL(http://127.0.0.1:3100)`，首页服务端重定向到 `/creator-chats`。
- 没有记下上次路径。布局宽度等 localStorage 会留，路径不会。
- Journey F 验收里的数据（项目/角色/记忆/事件）已经过了；缺的是「打开就继续」，不是「打开发现世界没了」。

## User Goal

用户希望完成：

关上时在哪，再开还在哪：上次的扮演/群聊/世界构建，或上次的 Studio 世界页。点进去之后能接着说。

成功时用户知道：我回到刚才那件事，不是从项目列表重新挑。

## Entry

入口：

- 关掉桌面窗口 / 退出 Zivith，再启动桌面应用
- 不覆盖：浏览器自己打开 `http://127.0.0.1:3100`（可以顺手用同一套上次路径；不是本刀主验收）

## Main Flow

正常流程：

```text
在扮演或 Studio 世界页里工作
        ↓
关掉桌面
        ↓
再打开
        ↓
直接进入上次那条路径（加载中不装成新建世界）
        ↓
继续聊天或继续看世界
```

## States

### Empty

- 第一次安装、从未进过任何世界：仍是现在的 `/creator-chats` 空态（从左侧选择一个项目）。
- 没有可用的上次路径：同上。

### Loading

- 再开进已有 `/creator-chats/:threadId`：沿用「正在打开对话…」，不要闪「新世界对话」。
- 再开进 Studio：沿用「正在加载项目树…」。

### Success

- 上次在某条扮演/群聊/世界构建：标题、对白、待确认卡还在。
- 上次在 Studio `/projects/:id/world`：还是那个世界。
- 侧栏世界列表仍在，可以换世界。

### Error

- 上次对话已删：现有「对话加载失败 / 对话不存在 / 重试」，侧栏仍可点别的。不自动另开一场新对话。
- 上次项目已删：Studio 现有失败态；不行就退回 `/creator-chats`。
- 记下的路径坏了、不是本应用地址：忽略，走空态。

### Retry

- 对话 404 的「重试」仍拉同一 id。
- 启动加载界面失败：现有「Zivith 界面加载失败」对话框，不另做一套。

### Cancel

- 没有「恢复上次」的确认框。不想留在上次：侧栏点别的世界，或点「新对话」。
- 关掉再开本身就是用户动作，不另要确认。

## Data

涉及数据：

- 只记**路径**（pathname，可选 search）。例如 `/creator-chats/7efb1748-…` 或 `/projects/22afd996-…/world`。
- 存 Electron `userData`（本机文件，不是 Postgres，不是新表）。Web 可同时写 localStorage，方便同一套判定。
- 不产生世界实体。谁消费：桌面启动 `loadURL`。
- 改了之后：关窗再开同步到该路径；删掉的对话仍 404，不复活。

允许恢复的路径：

- `/creator-chats`
- `/creator-chats/:threadId`
- `/projects/:projectId/world`
- `/projects/:projectId/chat`

明确不恢复：登录/注册、`/projects/new`、设置页、制作/镜头深链（本刀不把用户丢进制作向导）。

## Cross-module Impact

影响哪些模块：

- Desktop：`main.cjs` 导航时记下路径，启动时若合法则 `loadURL` 上次地址，而不是永远裸 `WEB_URL`。
- Web：路由变化时写入上次路径（纯函数 + 薄封装，便于单测合法/非法路径）。
- Chat / Studio 页面本身不改业务。加载闪新世界已在 `fix/reenter-no-flash`，本刀不要回退。
- API / 数据模型：不改。

## User Control

哪些操作需要用户确认：无。恢复的是「我刚才在哪」，不是写世界。

## Recovery

如何撤销 / 恢复：

- 不想留在上次：侧栏换世界。
- 清掉记下的路径：删 userData 里那条记录，或忽略坏文件。不提供设置项「不要记住上次」（本刀不做开关）。

## Acceptance Criteria

完成标准：

1. 走查雾城信「与林晚对话」开着 → 关桌面 → 再开：直接进这条扮演（标题是林晚，对白还在），不是先停在「从左侧选择一个项目」。
2. Studio 走查雾城信世界页开着 → 关 → 再开：还是该世界 Studio，角色/交信事件还在。
3. 上次是已删除对话 URL：再开是「对话不存在」，不是一场新的世界构建装成还在。
4. 从未打开过世界：再开仍是 `/creator-chats` 空态。
5. 单测：合法路径收下；外站 URL、`/login`、`/projects/new` 丢掉。
6. 加载中不闪「新世界对话」。

## Out of Scope

本次明确不做：

- 记住滚动位置、输入框半句话、未关的确认框。
- 设置里的「启动时打开…」开关。
- 多窗口。
- 安装包。
- 角色导入。
- 日历时间。
- 改首页服务端重定向策略以外的信息架构。

## Implementation Constraints

实现约束：

- 从 `develop` 开 `feat/restore-last-location`。
- 不改 Prisma，不新建 `World` 表。
- 上次路径必须校验同源 + 允许名单，禁止 `javascript:` 或外站。
- 桌面启动仍先等 web 就绪，再 load 上次 URL；web 没起来时保持现有启动失败对话框。
- 安装包仍不插队。
