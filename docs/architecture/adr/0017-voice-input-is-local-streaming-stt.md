# ADR-0017: Voice input is a local streaming STT capability behind the capability boundary

- **Status:** Accepted
- **Date:** 2026-09-13
- **Deciders:** Project owner / architecture maintainer
- **Class:** Standard
- **Reversibility:** Reversible
- **Source:** 产品要求为 Zivith 增加语音输入；2026-09-13 开源选型调研（sherpa-onnx / whisper.cpp / vosk / transformers.js / Azure Speech SDK / Windows Win+H）。

## Context

Creator Chat 与各文本输入面需要听写式语音输入。四股力量同时成立：

1. **音频是未发表的 IP 内容。** 用户口述的是角色、剧情与世界规则。Zivith 承诺本地优先（[ADR-0013](0013-local-single-user-mode-no-login.md)、[ADR-0016](0016-local-creative-surface-is-electron.md)），把这类音频默认送往云端与该承诺相抵触。
2. **微软阵营没有可嵌入的开源本地 STT。** Windows 11「语音输入」（Win+H）闭源且走在线识别；Azure Speech SDK 本身 MIT，但识别必须在 Azure 云端完成且需密钥；`microsoft/VibeVoice` 2026-09 新增的流式 ASR 自述「仅供研发」、GB 级权重、依赖 vLLM。PowerToys 没有语音模块。
3. **社区引擎已经可用，但各有代价。** k2-fsa/sherpa-onnx（Apache-2.0）提供 `sherpa-onnx-node` 预编译 N-API 绑定与真流式双语 zipformer-small 模型（int8 约 47.5MB）；ggerganov/whisper.cpp（MIT）体积最小（tiny-q5_1 约 31MB）但伪流式、无热词机制、Windows 需编译工具链；vosk 模型极轻但 npm 绑定 2022 年停更；`@huggingface/transformers` 可在渲染进程跑 whisper-tiny（约 39MB）但同样伪流式且中文精度受限。Electron 的 Web Speech API 从未实现后端（electron#46143），即使可用也把音频送 Google 云。
4. **Zivith 的专名密度高于通用听写。** 角色名、地名、组织名多为生造词，通用模型必错；若识别器支持热词偏置，世界词汇表就是现成的偏置源——这是云听写给不了的产品能力。

体积与供应链同样是真实的力：任何本地引擎都意味着原生依赖加模型文件进入安装面（约 70MB 量级），并带来锁版本、完整性校验与升级义务。

## Principles at Stake

- **Serves P3（核心无头）：** 转写首先是 API 操作——本机 API 上的流式端点；输入框麦克风按钮是一号客户端，浏览器开发模式同样可用。
- **Serves P4（能力边界）：** STT 引擎是按能力寻址的外设，隔离在端口/适配器之后；更换引擎不动领域代码，领域不出现 provider 概念。
- **Serves P6（人类权威）：** 转写文本只是提案——先落在输入框中供编辑与确认，人类发送才生效；语音不直接产生任何落库副作用。
- **Serves ADR-0010 围栏（类比）：** 转写稿是会话工作底稿，不是创作产物：不进领域模型、不参与导出、不做版本化。
- **Strains P4：** 与「外设经服务寻址」的默认形态不同，本决策把一个具体引擎二进制与模型随产品分发（约 70MB），波动性从调用面进入安装面。可接受，因为它仍在边界之后：版本锁定、校验后加载、可整体替换。
- **Strains P7（弱，argued）：** 听写不是生成交易，不入 usage/billing；响应元数据携带引擎与模型版本以便追溯。若未来 STT 进入 agent 流水线，provenance 义务在那一层履行。

## Decision

**语音输入是本地流式 STT 能力：引擎运行在本机 API 进程内，经能力边界隔离；首选引擎为 sherpa-onnx（`sherpa-onnx-node`）加流式双语 zipformer-small（int8）；云端转写被默认拒绝。**

- 音频路径：渲染进程 `getUserMedia`（AudioWorklet 16kHz PCM）→ `127.0.0.1` 本机 API → 引擎。音频与转写稿零持久化。
- 引擎与模型以精确版本锁定；模型在构建期由脚本下载，sha256 校验通过才可加载，失败即拒绝启动该能力（fail closed）。
- 引擎或模型缺失时该能力显式禁用并提示，**绝不回退云端**；系统听写（Win+H）只是用户侧兜底，产品不集成、不调用。
- 热词：从当前世界实体的名称构建只读热词表注入识别器（具体支持度以 V0 spike 实测为准）。
- 不新增领域实体，不改任何既有契约。

## Alternatives Considered

- **系统/输入法听写（Win+H，即现状）：** 零成本且今天就能用，但无 API（不能放按钮、拿不到部分结果）、依赖网络、Windows 专属、不支持热词。降级为文档化兜底，不作为产品能力。
- **Azure Speech SDK（MIT）：** 中文流式识别质量最好，但识别在云端、需密钥、免费额度 5 音频小时/月，音频出机器。与本地优先冲突；仅当未来显式需要云后端时另开 ADR。
- **Web Speech API：** Electron 未实现其后端（缺 Chrome 专有云组件），Chromium 可用时同样走云。排除。
- **whisper.cpp（MIT）：** 保留为边界后的第一备选引擎。输在：Windows 编译工具链负担、npm 封装质量参差、伪流式（滑窗重解码）、无热词机制。
- **@huggingface/transformers + whisper-tiny（WASM，约 39MB）：** 无原生依赖、可在渲染进程运行；但伪流式、tiny 中文精度不足、占用渲染进程算力。备选。
- **vosk（Apache-2.0）：** 中文小模型仅 42MB 且真流式，但 npm 绑定 2022 年停更、依赖已死的 ffi-napi。供应链健康度不可接受。
- **microsoft/VibeVoice-ASR：** 方向对口（流式、多语言、热词）但研究级定位、GB 级权重、vLLM 推理。列入再议触发，暂不集成。

## Trade-off Record

| We gained | We gave up | Horizon |
|-----------|------------|---------|
| 离线可用、音频不出机器（对未发表 IP 内容的隐私承诺） | 约 70MB 安装体积（引擎约 22MB + 模型约 48MB） | 若体积成为普遍抱怨，可改为「首次使用时下载」 |
| 真流式 UX（边说边出字）+ 世界热词偏置 | 中文精度略逊顶级云引擎；原生依赖的锁版本/校验/升级义务 | 当可嵌入的开源本地模型在中文精度上追平云引擎（VibeVoice 级成熟）时重选引擎；引擎替换走边界，不重开本决策 |
| 跨平台一致（同一引擎同一模型）；零密钥零调用费 | 放弃「一行代码都不写」的现状路径 | 系统听写始终并存为用户侧兜底，无协调成本 |

## Consequences

- `apps/api` 新增 `voice` 上下文：`STTEngine` 端口 + sherpa-onnx 适配器 + 流式转写端点（复用 workflow-events 的 SSE 先例或改用 WS，实现时定）；API 仅绑定 `127.0.0.1`，端点不得暴露到外网。
- 依赖治理：`sherpa-onnx-node` 及各平台包精确锁版并记录 shasum；模型文件不入 git，由 `scripts/setup.*` 增量下载并固化 sha256；引擎相关测试在模型缺失时跳过。
- Electron：`session.setPermissionRequestHandler` 仅对应用自身 origin 放行 `'media'`；CSP 不为任何语音云端点开口。
- 许可留档：第三方声明登记 sherpa-onnx（Apache-2.0：保留 LICENSE/NOTICE 与修改声明）与模型来源（URL + sha256 + 许可）；SenseVoice（FunASR 自定义许可、非 OSI）默认不随产品分发，引入前须单独法务确认。
- 文档欠账：Technical-Architecture、Product-Positioning 能力清单、根 README；[ADR 索引](README.md)登记本 ADR。
- 负面后果诚实记录：热词偏置在选定模型上的实际收益未知（V0 spike 前不得宣称）；模型与引擎版本耦合，升级需要发版协调；渲染进程新增麦克风权限请求对首次启动体验有打扰。

## Compliance

- **单一适配器边界：** 除 voice 适配器模块外，任何代码不得 import sherpa-onnx（code review 强制；必要时加 lint 边界规则）。
- **零持久化：** 音频与转写稿不得出现任何写盘/写库路径；转写文本不进入导出与版本化。
- **零云端转写：** 仓库不得出现语音云服务调用；能力失败路径必须是禁用而非回退。
- **供应链可审计：** lockfile 中引擎依赖为精确版本；模型加载前强制 sha256 校验，失败拒绝加载。
- CI 无法自动验证以上全部——由代码评审与定期架构评审抽查承担（诚实边界）。

## Appendix — V0 spike 证据（2026-09-13，仅追加）

V0 spike（脚本与原始数据在仓库外 `../voice-v0-spike/`）对决策内的模型选择做出修正；引擎决策本身不变（换模型属于 P4 重配置阶梯第 1 级，在边界后进行，不重开本决策）：

- **small 模型（2023-02-16，int8 ≈47.5MB）未通过质量门禁**：对官方自带的真人测试音频即出现截断与重复字循环（其官方文档预期输出本身即为中英夹杂的「昨天是 MONDAY TODAY IS THEY AFTER TOMORROW是星期三」）；SAPI 与 Edge 神经 TTS 生成音频对照均复现。拒绝采用。
- **改用标准版流式双语 zipformer（2023-02-20，int8 全套 ≈190MB）**：中英均完整成句（自造词「凛冬议会」「Zivith」基本正确）；RTF ≈ 0.05–0.07（int8、2 线程、100ms 分块流式）；首字部分结果 500–1400ms。体积代价：安装面从约 70MB 增至约 210MB（引擎 ≈22MB + 模型 ≈190MB）——落入权衡表「体积/精度」行的预期区间，再议触发不变。
- **热词机制可用，但配置必须正确**：`decodingMethod: 'modified_beam_search'` 与 `hotwordsFile`/`hotwordsScore` 必须位于 `OnlineRecognizerConfig` **顶层**（放在 `modelConfig` 内的同名字段被静默忽略）；score 2.0 时合成音频上效果温和（重复字瑕疵被修正），真实麦克风收益待 V3 实测。
- **已知瑕疵**：流式 final 文本含重复字伪影（如「今天今天天天天天气」），生产端须按停顿做 endpoint 检测 + `reset()` 按句重置，UI 层允许用户编辑后再提交（P6）。
- 供应链固化：`sherpa-onnx-node` / `sherpa-onnx-win-x64` 1.13.8（N-API 预编译，无 install 脚本，runtime 内含 onnxruntime 1.28.2）；sha256 已记录——归档 `27ffbd9e…`，encoder int8 `8fa76418…`、decoder `1a70c593…`、joiner `1ed689c5…`、tokens `a8e0e4ec…`，V1 据此实现构建期下载校验。
