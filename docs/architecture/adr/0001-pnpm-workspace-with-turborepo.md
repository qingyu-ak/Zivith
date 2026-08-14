# ADR-0001: Use a pnpm workspace orchestrated by Turborepo

- **Status:** 已接受
- **Date:** 2026-07-20
- **Deciders:** Phase 0 团队
- **Class:** Standard
- **Reversibility:** 代价高

> 于 2026-07-22 自根目录 `ARCHITECTURE-DECISIONS.md`（原 ADR-001）迁入。
> 本记录早于架构宪章；*Principles at Stake（攸关原则）*
> 分析尚未回溯补全。

## 背景

Zivith 包含可独立部署的应用与共享 TypeScript 包。
仓库需要快速的本地编排、确定性的依赖归属，以及
任务缓存，同时不把各包的实现耦合在一起。

## 决策

使用 pnpm 10 workspace 管理包，使用 Turborepo 2 编排任务。
应用位于 `apps/*`；共享代码位于 `packages/*`。根命令通过
Turborepo 委托到各包脚本。

## 后果

各包保留对自己构建与测试工具的控制权，同时共享一张依赖
图。每个参与包必须提供命名一致的脚本。CI 当前在
无冻结锁文件的情况下安装，直至首次完整 workspace 安装生成
`pnpm-lock.yaml`；该文件存在后，工作流应切换为 `--frozen-lockfile`。
