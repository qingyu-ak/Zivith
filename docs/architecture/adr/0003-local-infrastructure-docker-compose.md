# ADR-0003: Provide local infrastructure through Docker Compose

- **Status:** 已接受
- **Date:** 2026-07-20
- **Deciders:** Phase 0 团队
- **Class:** Standard
- **Reversibility:** 可逆

> 于 2026-07-22 自根目录 `ARCHITECTURE-DECISIONS.md`（原 ADR-003）迁入。
> 本记录早于架构宪章；*Principles at Stake（攸关原则）*
> 分析尚未回溯补全。

## 背景

开发与测试需要在 Windows 与 Linux 上具备关系型数据库、队列/缓存，以及
S3 兼容的对象存储。

## 决策

通过 Docker Compose 使用 PostgreSQL 16、Redis 7 与 MinIO。命名卷保留本地
开发数据。健康检查作为 setup 完成的门禁，一次性 MinIO client 以幂等方式创建
私有媒体 bucket。

## 后果

本地服务在能力上贴近生产环境，且无需本机原生安装。
生产部署可使用托管等价物，前提是保持 PostgreSQL、
Redis 与 S3 兼容契约。
