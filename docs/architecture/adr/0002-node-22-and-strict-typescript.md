# ADR-0002: Standardize on Node.js 22 and strict shared TypeScript

- **Status:** 已接受
- **Date:** 2026-07-20
- **Deciders:** Phase 0 团队
- **Class:** Standard
- **Reversibility:** 代价高

> 于 2026-07-22 自根目录 `ARCHITECTURE-DECISIONS.md`（原 ADR-002）迁入。
> 本记录早于架构宪章；*Principles at Stake（攸关原则）*
> 分析尚未回溯补全。

## 背景

Web、API 与共享领域包需要统一的受支持运行时与类型基线。

## 决策

统一采用 Node.js 22 与严格的共享 TypeScript 配置。使用 ESLint 的 flat
configuration，配合类型感知的 TypeScript 规则，并以 Prettier 负责格式化。

## 后果

开发者与 CI 使用同一运行时主版本。包级配置可扩展
根默认值，但不得在未记录决策的情况下削弱领域安全规则。
