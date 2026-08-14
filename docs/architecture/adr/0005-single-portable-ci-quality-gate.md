# ADR-0005: Run one portable CI quality gate

- **Status:** 已接受
- **Date:** 2026-07-20
- **Deciders:** Phase 0 团队
- **Class:** Standard
- **Reversibility:** 可逆

> 于 2026-07-22 自根目录 `ARCHITECTURE-DECISIONS.md`（原 ADR-005）迁入。
> 本记录早于架构宪章；*Principles at Stake（攸关原则）*
> 分析尚未回溯补全。

## 背景

每个 pull request 必须证明格式化、lint、类型安全、测试与构建兼容性，
并对照与本地相同的支撑服务。

## 决策

在 Ubuntu 上使用 GitHub Actions，配合 Node.js 22 与 pnpm。在启动可丢弃的
Compose 服务后，按序运行格式化、lint、类型检查、测试与构建。

## 后果

单一 job 提供简单、有序的诊断，并避免重复的依赖
安装。它比完全并行的 job 更慢；在包边界与缓存行为稳定后，可将任务拆分。
