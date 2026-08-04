# ADR 索引

> Zivith 的 Architecture Decision Records（架构决策记录）
>
> 流程见 [adr-guide.md](../adr-guide.md)。编号按顺序分配且永久保留。

| ADR | 标题 | 状态 | 日期 |
|-----|-------|--------|------|
| [0001](0001-pnpm-workspace-with-turborepo.md) | 使用由 Turborepo 编排的 pnpm workspace | 已接受 | 2026-07-20 |
| [0002](0002-node-22-and-strict-typescript.md) | 统一采用 Node.js 22 与严格的共享 TypeScript | 已接受 | 2026-07-20 |
| [0003](0003-local-infrastructure-docker-compose.md) | 通过 Docker Compose 提供本地基础设施 | 已接受 | 2026-07-20 |
| [0004](0004-environment-templates-and-external-secrets.md) | 仅提交环境模板；密钥保存在外部 | 已接受 | 2026-07-20 |
| [0005](0005-single-portable-ci-quality-gate.md) | 运行单一可移植的 CI 质量门禁 | 已接受 | 2026-07-20 |
| [0006](0006-story-segments-are-ordered-scene-groupings.md) | Story segment 是 Story 内有序的 Scene 分组 | 已接受 | 2026-07-23 |
| [0007](0007-preserve-current-state-with-immutable-creative-history.md) | 在保留当前领域状态的同时保存不可变创意历史 | 已接受 | 2026-07-29 |
| [0008](0008-zivith-is-an-ai-understandable-ip-creation-system.md) | Zivith 是一个 AI 可理解的 IP 创作系统（**宪章修订**） | 已接受 | 2026-07-31 |
| [0009](0009-skill-is-a-capability-layer-not-a-domain-entity.md) | Skill 是能力层，不是领域实体 | 已接受 | 2026-07-31 |
| [0010](0010-creator-chat-is-a-guided-world-creation-wizard.md) | Creator Chat 是引导式世界创建向导，不是对话式创作界面 | 已接受 | 2026-07-31 |

ADR-0001 至 0005 自根目录 `ARCHITECTURE-DECISIONS.md` 迁入，早于
[架构宪章](../architecture-principles.md)；新 ADR 必须遵循指南中的完整模板。

ADR-0008 是首份 **宪章修订（Constitutional Amendment）**——这是
[architecture-principles.md](../architecture-principles.md) 变更的唯一机制。它在记录本决策的同一次变更中修订了 §1、§3、§9 与 §10。ADR-0008、0009 与 0010 均由
[IP World Model Repositioning RFC](../rfc/IP-World-Model-Repositioning-RFC.md) 催生。
