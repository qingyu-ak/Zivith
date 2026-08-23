# ADR-0014: 分层记忆系统

- 状态：Accepted
- 日期：2026-08-23
- 关联：ADR-0007、ADR-0008、ADR-0010、ADR-0013；[Memory-Novel-Roleplay-Design.md](../../planning/Memory-Novel-Roleplay-Design.md)

## 背景

Creator Chat 每轮只携带近期消息 + 世界状态快照：跨会话遗忘、上下文溢出只能截断、对话中的细节大量流失。业界成熟方案（Mem0 / Letta / Zep / 腾讯 AgentMemory）均收敛于「提取-分层-检索」管线。

## 决策

1. 三层记忆：L0 原文（CreatorChatMessage，永不删改）→ L1 原子（MemoryAtom，最小事实单元，带指纹与时间效度）→ L2 核心（MemoryCore，分主题凝练）。
2. PostgreSQL 为唯一事实源；本地 sqlite 向量文件是可随时重建的派生索引（`data/memory-vectors/<projectId>.sqlite`）。
3. 双路径管线：同步规则快速路径（当轮归档 + SSE 反馈）+ 队列驱动异步深加工（LLM 精炼 / L2 聚合 / 向量化），复用 QueuePort 双实现。
4. 写入边界（沿用 ADR-0010 混合制）：补充性事实自动沉淀记忆层；世界实体仍走提案确认；规则冲突（反义词对）上报不写入。
5. 记忆操作可审计：每次提炼显式产出 ADD/UPDATE/NOOP/CONFLICT（Mem0 式）。
6. 双时态：事实被取代置 superseded + validTo，不物理删除（Zep 式）。
7. 检索三路混合（实体链接 + 向量 + bigram 关键词）RRF 融合；无密钥轨全功能可用（Mock embedding = bigram 哈希向量）。
8. 上下文窗口（ThreadContextState）：滚动摘要 + 最近 K 条原文按预算分配；压缩只作用于 prompt，事实已在 L1/L2 无损保存。

## 后果

- Creator Chat 获得跨会话长期记忆与自动压缩；M2 小说导入、M3 角色扮演直接复用该管线。
- 新增本地依赖 better-sqlite3（预编译二进制）；向量文件损坏可从 PG 全量重建。
- 冲突确认流程（写库持久化）与 SiliconFlow 真实 embedding 适配器推迟到 M2。
