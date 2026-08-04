# ADR-0004: Commit environment templates only; keep secrets external

- **Status:** 已接受
- **Date:** 2026-07-20
- **Deciders:** Phase 0 团队
- **Class:** Standard
- **Reversibility:** 可逆

> 于 2026-07-22 自根目录 `ARCHITECTURE-DECISIONS.md`（原 ADR-004）迁入。
> 本记录早于架构宪章；*Principles at Stake（攸关原则）*
> 分析尚未回溯补全。

## 背景

开发、测试与生产需要不同的端点与凭证。真实密钥
不得进入源码控制。

## 决策

仅提交示例模板。忽略所有已填充的 `.env` 变体。开发与测试
值为明确可丢弃的占位符；生产值引用外部
密钥管理器。

## 后果

部署必须在运行时注入密钥。应用在所需
生产值未解析时必须快速失败，且绝不可将仅服务端可用的值暴露给前端。
