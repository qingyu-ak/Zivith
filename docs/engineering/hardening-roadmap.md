# Zivith Engineering Hardening Roadmap

> Status: Active — Stage A（理解 / 冻结）
>
> Synced: 2026-09-13
>
> Source: 用户提供的 `Zivith_Engineering_Hardening_Roadmap(2).md`（仓库外原稿）
>
> Binding: 本文是**工程流程**，不是新宪法。与 ADR / 架构宪章冲突时，以 ADR 为准。当前基线见 [hardening-baseline.md](hardening-baseline.md)；待办见 [Next-Tasks.md](../planning/Next-Tasks.md) Track Eng。

### 与现行决策的绑定（读正文前先看）

| 路线图章节 | Zivith 落地方式 | 禁止误读 |
|-----------|----------------|----------|
| Phase 4 登录 / Session / 密码重置 | [ADR-0013](../architecture/adr/0013-local-single-user-mode-no-login.md)：打开即用，无登录门禁 | **不要**为加固而做登录、注册、OAuth |
| Project A 不能读 Project B | 本机按 `projectId` 隔离；API 仅绑 `127.0.0.1`。IDOR 仍要测，但是单用户本机威胁模型 | **不要**做多租户 IAM |
| Phase 5 Agent Tool 不得直连 SQL | 已有端口/适配器 + 提案确认（P4/P6）。加固 = 查绕过，不是重做编排器 | **不要**另起一套 Tool Registry |
| Phase 8 CI/CD | CI 已有（[ADR-0005](../architecture/adr/0005-single-portable-ci-quality-gate.md)：format/lint/typecheck/test/build） | 下一刀是 **CD / 打包 / 干净机器安装**，不是再写一套 CI |
| Phase 9–11 发布 | Electron 桌面壳已有（[ADR-0016](../architecture/adr/0016-local-creative-surface-is-electron.md)） | 不引入 K8s / Service Mesh / 云 staging |
| 继续加功能 | 本阶段**冻结新功能**。I3 / W2 / Phase 3 生成生产化仍不插队 | Track V 已入库 `7900f7e`，纳入冻结 |

执行顺序以文末 **§16 Stage A→F** 为准。ENG0 已冻结（`c6d2157`）。当前做 Stage A：整理系统地图、理解核心数据流与 Agent 调用链。

---

> **目标**：将 Zivith 从"AI
> 辅助开发、功能基本可用"的项目，逐步推进到"可以交给真实用户测试，并具备基本安全性、可测试性、可维护性、可发布性和运行可观测性"的产品。
>
> **定位**：本阶段不是追求真正意义上的 Enterprise Production
> Grade，而是通过 Zivith 完整经历一次接近真实软件团队的工程流程。
>
> **核心原则**：不推倒重来，不为了技术而加技术。以当前 Zivith
> 为实验场，在真实问题中学习并补齐工程能力。

------------------------------------------------------------------------

## 0. 当前阶段目标

### 当前状态

Zivith 已经具备：

-   产品设计
-   UI/UX 设计
-   核心领域模型
-   Project / Entity / Timeline 等创作语义层
-   AI Agent 能力
-   AI 辅助编码
-   基本功能开发

当前主要缺口：

-   对现有 AI 生成代码的理解和接管程度不足
-   系统化 Code Review 经验不足
-   自动化测试不足
-   安全审计经验不足
-   Agent Security / Agent Evaluation 尚未系统实践
-   CI/CD 尚未完整实践
-   打包、安装、发布流程需要验证
-   Logging / Observability 不完善
-   缺少真实用户反馈闭环

### 本阶段最终目标

完成：

``` text
功能开发
    ↓
代码理解
    ↓
Code Review
    ↓
Testing
    ↓
Security Audit
    ↓
Agent Security
    ↓
Agent Evaluation
    ↓
CI/CD
    ↓
Packaging
    ↓
Release
    ↓
Real Users
    ↓
Feedback
    ↓
Iteration
```

------------------------------------------------------------------------

# 1. Phase 0：冻结当前版本

## 1.1 为什么先冻结

当前最重要的不是继续无限加功能，而是建立一个明确的基线。

否则后面很难判断：

-   哪些问题是旧代码的问题
-   哪些问题是新功能引入的问题
-   当前版本到底能不能发布
-   加固完成后到底提升了什么

------------------------------------------------------------------------

## 1.2 建立版本基线

记录：

-   当前版本号
-   当前 Git Commit
-   当前能够正常运行的功能
-   已知 Bug
-   已知限制
-   当前部署方式
-   当前数据库结构
-   当前依赖版本
-   当前环境变量
-   当前 API Provider
-   当前 Agent 能力

建议建立：

``` text
docs/
└── engineering/
    ├── hardening-roadmap.md
    ├── system-overview.md
    ├── security-checklist.md
    ├── testing-strategy.md
    └── release-checklist.md
```

------------------------------------------------------------------------

## 1.3 完成标准

能够明确回答：

> "当前 Zivith 这个版本到底是什么状态？"

而不是：

> "应该差不多能用了。"

------------------------------------------------------------------------

# 2. Phase 1：接管 AI 生成的代码

这是整个阶段最重要的部分。

目标不是把 AI 写的代码全部重写，而是：

> **逐渐做到能够理解、解释、审查和维护 AI 生成的代码。**

------------------------------------------------------------------------

## 2.1 建立系统地图

先整理整体架构。

例如：

``` text
User
 ↓
UI
 ↓
API
 ↓
Application
 ↓
Domain
 ↓
Infrastructure
 ↓
Database
```

Agent 链路：

``` text
User
 ↓
Chat
 ↓
Agent Orchestrator
 ↓
LLM
 ↓
Tool
 ↓
Application Service
 ↓
Domain
 ↓
Database
```

最终形成：

``` text
docs/engineering/system-overview.md
```

------------------------------------------------------------------------

## 2.2 每个核心模块必须搞清楚

对于每一个核心模块，至少回答四个问题：

### ① 输入是什么？

例如：

``` text
message
projectId
conversationId
```

### ② 输出是什么？

例如：

``` text
AgentResponse
```

### ③ 依赖什么？

例如：

``` text
LLM
Memory
ToolRegistry
ProjectRepository
```

### ④ 出错怎么办？

例如：

``` text
LLM Timeout
Tool Error
Invalid Arguments
Database Error
```

------------------------------------------------------------------------

## 2.3 优先理解核心链路

不要求立刻理解整个项目。

优先搞懂：

``` text
用户输入
 ↓
Agent
 ↓
Context
 ↓
LLM
 ↓
Tool Calling
 ↓
Domain
 ↓
Database
 ↓
结果
 ↓
UI
```

以及：

``` text
Project
Character
Scene
Timeline
Memory
Shot
Asset
```

之间的关系。

------------------------------------------------------------------------

## 2.4 完成标准

能够向别人解释：

-   Zivith 整体架构
-   Agent 如何运行
-   Agent 如何获取上下文
-   Agent 如何调用 Tool
-   Tool 如何修改数据
-   数据如何持久化
-   UI 如何获得修改后的结果

不需要背代码，但必须理解数据流。

------------------------------------------------------------------------

# 3. Phase 2：AI Code Review

以后不要：

``` text
AI 写代码
 ↓
看一眼
 ↓
直接 Merge
```

改成：

``` text
AI Implementation
 ↓
Git Diff
 ↓
AI Code Review
 ↓
人工确认
 ↓
Tests
 ↓
Merge
```

------------------------------------------------------------------------

## 3.1 Code Review 检查项

### Correctness

检查：

-   业务逻辑是否正确
-   边界情况
-   Null / Undefined
-   错误状态
-   状态转换
-   并发情况
-   数据一致性

------------------------------------------------------------------------

### Architecture

检查：

-   是否破坏模块边界
-   是否绕过 Application / Domain 层
-   是否直接从 UI 操作数据库
-   是否产生不必要的耦合
-   是否产生循环依赖
-   是否出现重复业务逻辑

------------------------------------------------------------------------

### Security

检查：

-   Authentication
-   Authorization
-   Input Validation
-   SQL Injection
-   XSS
-   SSRF
-   Path Traversal
-   Secret Leakage
-   File Upload
-   不安全反序列化

------------------------------------------------------------------------

### Reliability

检查：

-   Timeout
-   Retry
-   Exception Handling
-   无限循环
-   并发问题
-   数据丢失
-   外部 API 失败

------------------------------------------------------------------------

### Maintainability

检查：

-   重复代码
-   巨型函数
-   魔法数字
-   命名
-   注释
-   不必要的抽象
-   复杂度

------------------------------------------------------------------------

## 3.2 Review 原则

AI Reviewer 不应该只回答：

> "代码很好。"

必须要求它：

1.  找问题
2.  解释原因
3.  判断严重程度
4.  给出修复建议
5.  指出可能需要测试的场景

------------------------------------------------------------------------

# 4. Phase 3：建立测试体系

AI 代码最危险的地方之一：

> **看起来是对的。**

因此必须开始建立自动化测试。

------------------------------------------------------------------------

# 4.1 Unit Test

优先测试：

-   Domain
-   Application Service
-   核心业务规则

Zivith 优先测试：

``` text
Character State 修改
Timeline State 修改
状态继承
权限判断
Shot Context 生成
Memory 更新
```

------------------------------------------------------------------------

# 4.2 Integration Test

测试：

``` text
API
 ↓
Application
 ↓
Domain
 ↓
Database
```

例如：

``` text
创建 Project
创建 Character
修改 Character State
创建 Timeline
查询 Timeline
```

------------------------------------------------------------------------

# 4.3 E2E / Smoke Test

不需要一开始做得很复杂。

至少保证：

``` text
启动
 ↓
登录
 ↓
创建 Project
 ↓
创建 Character
 ↓
创建 Timeline
 ↓
Agent 修改 Character
 ↓
查看结果
```

整个关键链路能够跑通。

------------------------------------------------------------------------

## 4.4 测试原则

以后代码修改：

``` text
修改
 ↓
自动测试
 ↓
Pass
 ↓
Merge
```

而不是：

``` text
修改
 ↓
手动点几下
 ↓
应该没问题
```

------------------------------------------------------------------------

## 4.5 完成标准

至少拥有：

-   核心业务 Unit Test
-   核心 API Integration Test
-   核心用户流程 Smoke / E2E Test

不追求一开始就达到 90%+ Coverage。

------------------------------------------------------------------------

# 5. Phase 4：Security Audit

## 5.1 基本原则

不要自己凭感觉设计所谓"企业级安全体系"。

以成熟安全实践作为学习地图，例如：

-   OWASP Top 10
-   OWASP API Security
-   Authentication
-   Authorization
-   Secrets Management
-   File Upload Security

------------------------------------------------------------------------

# 5.2 Authentication

检查：

-   登录
-   Session / Token
-   密码安全存储
-   Token 生命周期
-   Logout
-   密码重置
-   暴力破解防护

------------------------------------------------------------------------

# 5.3 Authorization

这是 Zivith 的重点。

假设：

``` text
Project A
Project B
```

用户 A 请求：

``` text
GET /projects/B
```

必须：

``` text
403 Forbidden
```

不能因为用户知道 Project ID 就访问。

重点检查：

``` text
Project
Character
Scene
Timeline
Asset
Conversation
Memory
Shot
```

每一个资源都必须回答：

> 当前用户是否拥有访问 / 修改权限？

------------------------------------------------------------------------

# 5.4 Input Validation

所有外部输入都视为不可信数据。

包括：

-   用户输入
-   API 参数
-   JSON
-   文件名
-   文件路径
-   上传文件
-   Agent Tool 参数

------------------------------------------------------------------------

# 5.5 Secrets Management

检查：

``` text
API Key
Database Password
JWT Secret
OAuth Secret
```

不能进入：

``` text
Git
README
前端代码
日志
Docker Image
```

重点检查：

``` text
.env
.gitignore
Git History
CI/CD Secrets
```

------------------------------------------------------------------------

# 5.6 文件安全

Zivith 未来会处理：

-   图片
-   音频
-   视频
-   项目文件

检查：

-   文件大小
-   MIME Type
-   扩展名
-   文件名
-   文件路径
-   存储位置
-   用户权限

重点防御：

``` text
Path Traversal
```

例如：

``` text
../../something
```

------------------------------------------------------------------------

# 5.7 API Security

检查：

-   Authentication
-   Authorization
-   Rate Limit
-   Timeout
-   Request Size
-   Input Validation
-   Error Response

------------------------------------------------------------------------

# 6. Phase 5：Agent Security

这是 Zivith 最值得重点学习的一部分。

因为 Zivith 的 Agent 不只是聊天。

它可以：

``` text
读取 Project
读取 Entity
修改 Character
修改 Timeline
创建 Shot
```

因此：

> **Agent 本身就是一个具有能力边界的执行主体。**

------------------------------------------------------------------------

# 6.1 Tool Boundary

禁止：

``` text
LLM
 ↓
SQL
 ↓
Database
```

推荐：

``` text
LLM
 ↓
Tool
 ↓
Validation
 ↓
Authorization
 ↓
Domain Service
 ↓
Database
```

例如：

``` text
update_character_state(
    characterId,
    stateId,
    changes
)
```

Agent 只能调用定义好的 Tool。

------------------------------------------------------------------------

# 6.2 Tool 参数验证

例如：

``` text
characterId
stateId
changes
```

检查：

-   类型
-   长度
-   是否存在
-   是否属于当前 Project
-   是否允许修改

------------------------------------------------------------------------

# 6.3 Agent Capability

明确 Agent 可以做什么。

例如：

``` text
READ
 ├── get_project
 ├── get_character
 ├── get_scene
 └── get_timeline

WRITE
 ├── update_character
 └── update_timeline

CREATE
 └── create_shot
```

危险操作单独控制：

``` text
DELETE
EXPORT
PUBLISH
```

不要让 Agent 默认拥有这些权限。

------------------------------------------------------------------------

# 6.4 Agent Loop Protection

防止：

``` text
Agent
 ↓
Tool
 ↓
Agent
 ↓
Tool
 ↓
Agent
 ↓
……
```

至少设置：

``` text
max_iterations
max_tool_calls
timeout
token_budget
```

------------------------------------------------------------------------

# 6.5 Prompt Injection

Zivith 可能读取：

-   剧本
-   世界观
-   项目文件
-   用户上传内容
-   外部资料

这些内容都可能包含类似：

``` text
忽略之前的指令……
```

因此必须区分：

``` text
Instruction
Data
```

项目内容不能天然获得系统指令权限。

------------------------------------------------------------------------

# 7. Phase 6：Agent Evaluation

不要只测试：

> Agent 能不能聊天？

而要测试：

> Agent 能不能正确完成任务？

------------------------------------------------------------------------

## 7.1 建立 Evaluation Dataset

例如：

``` text
Case 001

任务：
把 Alice 在第三幕的状态改为受伤。

Expected:
Alice.state = injured
Timeline = Act 3
```

------------------------------------------------------------------------

``` text
Case 002

任务：
修改不存在的角色。

Expected:
Agent 拒绝执行并说明原因。
```

------------------------------------------------------------------------

``` text
Case 003

任务：
修改不属于当前 Project 的 Character。

Expected:
Authorization Failed
Agent 不得执行。
```

------------------------------------------------------------------------

# 7.2 记录指标

初期可以记录：

``` text
Task Success Rate
Tool Selection Accuracy
Tool Argument Accuracy
Invalid Tool Calls
Unauthorized Actions
Average Latency
Token Usage
Estimated Cost
```

------------------------------------------------------------------------

# 7.3 失败案例库

建立：

``` text
docs/engineering/agent-evaluation.md
```

记录：

``` text
问题
 ↓
Agent 行为
 ↓
实际原因
 ↓
修复
 ↓
Regression Test
```

这样以后新增代码不会重复踩坑。

------------------------------------------------------------------------

# 8. Phase 7：Logging / Observability

上线以后最怕：

> 用户说"Agent 改错了"，但你不知道为什么。

因此至少需要：

``` text
Request ID
User ID
Project ID
Agent Run ID
Tool Call
Tool Result
Error
Latency
```

例如：

``` text
Agent Run
 ↓
Tool: update_character_state
 ↓
characterId: xxx
 ↓
success
 ↓
duration: 240ms
```

------------------------------------------------------------------------

## 8.1 Agent Debug Trace

重点记录：

``` text
Agent Run
 ├── Context
 ├── Model
 ├── Tool Call
 ├── Tool Arguments
 ├── Tool Result
 ├── Error
 └── Final Result
```

注意：

> 不要把 API Key、完整 Secret 或不必要的敏感用户数据写进日志。

------------------------------------------------------------------------

# 9. Phase 8：CI/CD

开始建立真实的自动化开发流程。

------------------------------------------------------------------------

## 9.1 Pull / Push Pipeline

例如：

``` text
git push
 ↓
GitHub Actions
 ↓
Lint
 ↓
Unit Test
 ↓
Integration Test
 ↓
Build
 ↓
Security Scan
 ↓
Artifact
```

------------------------------------------------------------------------

## 9.2 Release Pipeline

例如：

``` text
Tag v0.4.0
 ↓
CI
 ↓
Test
 ↓
Build
 ↓
Package
 ↓
GitHub Release
```

------------------------------------------------------------------------

## 9.3 完成标准

做到：

> 一个正常的 Git Push 不需要人工执行一堆重复检查。

CI 能够自动告诉你：

``` text
PASS / FAIL
```

------------------------------------------------------------------------

# 10. Phase 9：Dependency / Supply Chain Security

AI 非常容易给项目加入大量依赖。

因此定期检查：

-   package.json
-   lock file
-   Dockerfile
-   其他依赖管理文件

检查：

-   是否有不必要依赖
-   是否存在已知高危漏洞
-   版本是否过旧
-   License 是否存在问题
-   是否锁定依赖版本

建立：

``` text
Dependency Audit
```

------------------------------------------------------------------------

# 11. Phase 10：Packaging

目标：

> 普通用户不需要理解开发环境，也可以安装并运行 Zivith。

理想流程：

``` text
Download
 ↓
Install
 ↓
Launch
 ↓
Configure API
 ↓
Create Project
 ↓
Start Using
```

------------------------------------------------------------------------

# 11.1 Clean Machine Test

非常重要：

不要只在自己的开发电脑测试。

准备一个尽可能干净的环境。

模拟：

> 一个完全不了解 Zivith 的用户。

记录：

``` text
Installation Time
Missing Dependency
Configuration Problem
Error Message
First-use Confusion
```

------------------------------------------------------------------------

# 11.2 用户第一次启动

重点检查：

-   是否知道下一步做什么
-   API 配置是否清楚
-   是否知道如何创建 Project
-   是否知道 Agent 能做什么
-   错误提示是否能够帮助用户解决问题

------------------------------------------------------------------------

# 12. Phase 11：Release Checklist

以后每次发布都走：

``` text
□ Feature Complete
□ Known Bugs Checked
□ Unit Tests Pass
□ Integration Tests Pass
□ E2E / Smoke Test Pass
□ Security Checklist Pass
□ Dependency Audit Pass
□ Secrets Checked
□ Build Successful
□ Package Tested
□ Clean-machine Installation Tested
□ Documentation Updated
□ Version Updated
□ Release Notes Written
```

------------------------------------------------------------------------

# 13. Phase 12：真实用户测试

第一批不需要很多。

建议：

> **3～10 个用户。**

让用户完成明确任务。

例如：

``` text
创建 Project
 ↓
导入内容
 ↓
创建 Character
 ↓
修改 Character Memory
 ↓
建立 Timeline
 ↓
让 Agent 操作
 ↓
查看结果
```

------------------------------------------------------------------------

# 13.1 不要只问"好不好用"

不要只问：

> "你觉得怎么样？"

应该问：

-   哪一步不知道该怎么操作？
-   哪个按钮和你的预期不一样？
-   哪里让你困惑？
-   哪个功能出错？
-   如果只能保留三个功能，你会留下什么？
-   哪个地方最希望自动化？

------------------------------------------------------------------------

# 13.2 建立 Feedback Loop

``` text
User
 ↓
Feedback
 ↓
Issue
 ↓
Prioritize
 ↓
Design
 ↓
Implementation
 ↓
Review
 ↓
Test
 ↓
Release
 ↓
User
```

这才是完整产品闭环。

------------------------------------------------------------------------

# 14. Phase 13：Engineering Report

这是整个阶段非常值得留下的成果。

建立：

``` text
docs/engineering/
├── architecture-review.md
├── code-review.md
├── testing-report.md
├── security-audit.md
├── agent-evaluation.md
├── performance-report.md
├── release-process.md
└── user-feedback.md
```

------------------------------------------------------------------------

## 14.1 Security Audit 示例

``` text
问题：

Agent Tool 可以绕过 Project Authorization。

影响：

理论上用户可以构造其他 Project ID，
访问不属于自己的资源。

原因：

Tool 直接调用 Repository，
没有经过统一 Authorization Layer。

修复：

所有 Project Resource 操作统一经过
Authorization Layer。

验证：

新增 Unauthorized Access Integration Test。

结果：

Pass
```

------------------------------------------------------------------------

## 14.2 性能问题示例

``` text
问题：

Timeline 页面加载缓慢。

调查：

发现一次请求加载了大量 Entity。

解决：

增加分页 / 懒加载 / 必要字段查询。

验证：

页面平均响应时间从 X ms 降低到 Y ms。
```

不要为了"写报告"制造数据。

所有数字必须来自实际测试。

------------------------------------------------------------------------

# 15. 最终开发流程

以后 Zivith 新功能尽量遵循：

``` text
                 Product Need
                      ↓
                    Design
                      ↓
               AI Implementation
                      ↓
                  Git Diff
                      ↓
                Code Review
                      ↓
                    Tests
                      ↓
              Security Check
                      ↓
              Agent Evaluation
                      ↓
                 CI / CD
                      ↓
                  Package
                      ↓
                  Release
                      ↓
                Real Users
                      ↓
                  Feedback
                      ↓
                Product Need
```

------------------------------------------------------------------------

# 16. 实际执行顺序

不要同时做所有事情。

推荐严格按照：

## Stage A：理解

``` text
1. 冻结当前版本
2. 整理系统架构
3. 理解核心数据流
4. 理解 Agent 调用链
```

------------------------------------------------------------------------

## Stage B：质量

``` text
5. AI Code Review
6. Unit Test
7. Integration Test
8. E2E / Smoke Test
```

------------------------------------------------------------------------

## Stage C：安全

``` text
9. Authentication Audit
10. Authorization Audit
11. Input Validation
12. Secrets
13. File Security
14. API Security
15. Agent Tool Security
16. Prompt Injection
17. Agent Loop Protection
```

------------------------------------------------------------------------

## Stage D：Agent Engineering

``` text
18. Agent Evaluation Dataset
19. Tool Selection Evaluation
20. Tool Argument Evaluation
21. Task Success Evaluation
22. Failure Case Regression Tests
```

------------------------------------------------------------------------

## Stage E：工程化

``` text
23. Logging
24. Observability
25. Dependency Audit
26. CI
27. CD
28. Packaging
29. Clean-machine Test
```

------------------------------------------------------------------------

## Stage F：真实世界

``` text
30. Release
31. 3～10 个用户测试
32. 收集反馈
33. 修复问题
34. 再次 Release
```

------------------------------------------------------------------------

# 17. 每个阶段的学习方式

不要采用：

``` text
先把 Security 学完
再做项目
```

而采用：

``` text
项目发现问题
 ↓
明确问题
 ↓
查官方文档 / 标准 / 高质量资料
 ↓
理解原理
 ↓
应用到 Zivith
 ↓
写测试
 ↓
验证
 ↓
记录
```

例如：

``` text
发现 Agent 可以直接操作数据
 ↓
学习 Tool Calling
 ↓
学习 Authorization Boundary
 ↓
重新设计 Tool
 ↓
加入权限检查
 ↓
增加 Unauthorized Test
 ↓
完成
```

这就是本阶段推荐的学习方法。

------------------------------------------------------------------------

# 18. AI 在这个阶段应该扮演什么角色

不要只让 AI 当程序员。

让不同 AI Agent 扮演不同角色：

### Developer Agent

负责：

``` text
Implementation
Refactoring
Bug Fix
```

### Reviewer Agent

负责：

``` text
Code Review
Architecture Review
Security Review
```

### Tester Agent

负责：

``` text
Test Case
Edge Case
Regression Test
```

### Security Agent

负责：

``` text
Threat Modeling
Security Audit
Vulnerability Discovery
```

### Product Agent

负责：

``` text
UX Analysis
Requirement Analysis
User Feedback Analysis
```

最终：

``` text
AI
 ↓
提出 / 实现 / 审查
 ↓
你
 ↓
最终决策
```

**AI 可以大量写代码，但最终的工程责任和决策不能完全交给 AI。**

------------------------------------------------------------------------

# 19. Zivith 本阶段的核心原则

## 原则 1：不为了技术加技术

没有真实需求：

> 不加。

------------------------------------------------------------------------

## 原则 2：优先解决真实问题

遇到问题：

> 学技术。

不要：

> 先学技术，再找地方用。

------------------------------------------------------------------------

## 原则 3：AI 可以写，但自己必须能解释

目标不是：

> "每一行都是我写的。"

目标是：

> "我知道这套系统为什么这么设计，并且能够维护它。"

------------------------------------------------------------------------

## 原则 4：安全优先于炫技

不要为了：

-   微服务
-   Kubernetes
-   Service Mesh
-   分布式
-   Zero Trust

而过度设计。

当前阶段首先做好：

``` text
Authentication
Authorization
Input Validation
Secrets
File Security
API Security
Agent Tool Security
```

------------------------------------------------------------------------

## 原则 5：先能发布，再持续优化

不要追求：

> "做到完美再上线。"

应该：

``` text
可用
 ↓
安全
 ↓
可测试
 ↓
可发布
 ↓
真实用户
 ↓
反馈
 ↓
迭代
```

------------------------------------------------------------------------

# 20. 最终求职价值

完成这个阶段以后，Zivith 不只是：

> "一个 AI Agent 项目。"

而可以真实地体现：

### Product

-   产品设计
-   UI/UX
-   用户反馈
-   需求迭代

### AI / Agent

-   LLM
-   Agent Orchestration
-   Tool Calling
-   Memory
-   RAG
-   Agent Evaluation
-   Context Engineering
-   Agent Security

### Software Engineering

-   Architecture
-   Testing
-   Code Review
-   CI/CD
-   Dependency Management
-   Logging
-   Packaging
-   Release

### Security

-   Authentication
-   Authorization
-   Input Validation
-   Secrets
-   File Security
-   API Security
-   Agent Permission Boundary

最终形成：

> **"我不是只会调用一个大模型 API，而是能够使用 AI 辅助完成一个真实 AI
> 产品的设计、开发、测试、安全加固和发布。"**

这就是 Zivith 本阶段真正应该达到的目标。
