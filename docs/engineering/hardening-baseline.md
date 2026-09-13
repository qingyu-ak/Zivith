# 工程加固基线（Phase 0）

> Status: Frozen — 2026-09-13
>
> Synced: 2026-09-13
>
> Related: [hardening-roadmap.md](hardening-roadmap.md), [Next-Tasks.md](../planning/Next-Tasks.md)

本文件回答：「当前这个版本到底是什么状态？」不是「应该差不多能用了。」

---

## 身份

| 项 | 值 |
|----|-----|
| 产品版本 | `0.1.0-pre`（根 `package.json`） |
| 工作分支 | `zcode`（相对 `origin/zcode` ahead 44） |
| 冻结 commit | `c6d2157`（含 `7900f7e` Track V 语音） |
| 脏工作区 | 世界文件夹若干未提交修补仍留在工作树，**不纳入本次冻结**。`docs/agent connect/` 不入库产品分支。 |
| 运行面 | 本地单用户，无登录（[ADR-0013](../architecture/adr/0013-local-single-user-mode-no-login.md)）。创作面是 Electron 桌面窗口（[ADR-0016](../architecture/adr/0016-local-creative-surface-is-electron.md)）。 |

## 能正常跑的能力（已落地，非「计划中」）

- 创造层 v1：世界线 / WorldEvent / Relationship / Creator Chat；提案 `apply-intent`（全部 draft + 幂等）；H6 世界时间绑定；H7 派生 Track
- M1 分层记忆、M2 小说导入、M3 角色扮演；长篇导入验收（2026-09-01）
- 世界文件夹标记 W1：`.zivith/workspace.json`，搬家靠 id 重绑
- Studio IDE 壳 + Chat 独立壳；Agent 侧栏（世界构建者对话 + 提案卡）
- Mock 与真实提供商：文本 DeepSeek；图像/视频/音频 SiliconFlow；无密钥回退 Mock
- 工作流 Story→Scene→Visual Prep→Shot→Prompt→Video（mock 回路 Track A 已退出）
- CI：GitHub Actions 单 job — format / lint / typecheck / test / build，对照 Compose Postgres+Redis+MinIO（[ADR-0005](../architecture/adr/0005-single-portable-ci-quality-gate.md)）
- 启动：`pnpm desktop`（Electron + Web + API）；开发 `pnpm dev`；数据面 Docker Compose

## 已知限制（产品故意或尚未做）

- **无登录 / 无多租户。** 成员资格校验保留为云扩展点，v1 自动本地会话放行。
- **BYOK 凭证、提供商用量限额/回调** 仍为 stub（501）。
- **I3 Organization** 缺真实项目晋级证据，不插队。
- **W2** 把 IP Core/实体/聊天写成工作区文件：未开始，须另开计划。
- **Phase 3 生成生产化** 后移（ADR-0008）。
- SiliconFlow 真实 embedding 仍 mock / bigram。
- 独立 `/roleplay` 产品路由、完整记忆中心页：非当前轨道。
- SenseVoice 默认不随产品分发（许可未确认）。

## 已知问题（加固开始时挂账，不在本文件发明新 bug）

- Track V 语音：已入库 `7900f7e`。Electron 内「点麦克风 → 系统权限 → 实时听写」仍待手动验收。热词对生造专名的收益未宣称。
- 导入角色记忆：短事实已可编辑/新增（`c6d2157`）。Studio 资源树仍无「新建角色」入口（创建走对话提案或小说导入）。
- API 仅应绑 `127.0.0.1`；浏览器开发模式同样打本机 API。若暴露到局域网，单用户放行即等于开放本机全部世界。
- 历史债务：Agent 侧栏曾与未提交 WIP 合成提交（见协同频道 `cad776e`）；不在本阶段重拆，除非挡住冻结。

## 部署与数据

| 项 | 现状 |
|----|------|
| 数据库 | PostgreSQL（Compose）。权威在库；工作区标记只负责身份重绑。 |
| 对象存储 | MinIO / S3 兼容 |
| 队列 | Redis → BullMQ；无 Redis 时内存队列 |
| 环境变量 | `.env.example`：`DATABASE_URL` / `JWT_SECRET` / 提供商密钥 / `WEB_ORIGIN`；语音模型目录可 `ZIVITH_VOICE_MODEL_DIR` |
| 打包 | `pnpm desktop:pack` 存在；**干净机器安装验收未做** |
| 发布 | 无 tag → GitHub Release 流水线 |

## Agent 能力（基线清单）

| 能力 | 边界 |
|------|------|
| Creator Chat / 世界构建者 | 提案必须人类确认后才落库（ADR-0010 / P6） |
| Story / Scene / Shot / Visual / Prompt agents | 结构化输出；评审关卡强制 |
| 角色扮演 | 项目内身份；记忆冲突确认卡 |
| Tool / 写世界 | 经应用服务与确认链，禁止 LLM→SQL |
| 语音听写 | 本地 sherpa-onnx（`7900f7e`）；音频零持久化；失败不回退云 |

## 本阶段质量门（已有 vs 缺口）

| 门 | 已有 | 缺口 |
|----|------|------|
| Lint / format / typecheck / unit+api 测试 / build | CI 每次 push/PR | — |
| 核心用户 smoke/E2E | 部分 mock 工作流测 | 打开世界 → 对话 → 确认提案 → 看见实体 的桌面冒烟 |
| 安全审计清单 | ADR 与端口/适配器边界 | 对照路线图 Stage C 逐项取证，**不做登录** |
| Agent eval 集 | 无独立数据集 | Stage D |
| 可观测性 | 有日志级别；桌面有 `.data/zivith-desktop.log` | 缺稳定 `agentRunId` / tool 轨迹关联 |
| 依赖审计 | lockfile 精确版本 | 定期漏洞/许可扫描未流程化 |

## 冻结拍板（2026-09-13）

1. **Track V 纳入基线并提交：** `7900f7e`。
2. 用户指出的导入记忆只读：同日补 `c6d2157`，一并算进冻结快照。
3. 下一步：Stage A（ENG1/ENG2）对着代码走通 Chat → Agent → `apply-intent` → UI。
