# Third-Party Notices

Zivith 捆绑了以下第三方组件。本文件与对应 LICENSE 文本一起分发;分发产物必须保留本文件(ADR-0017 Compliance)。

## sherpa-onnx (sherpa-onnx-node + sherpa-onnx-win-x64 1.13.8)

- 来源: https://github.com/k2-fsa/sherpa-onnx
- 许可: Apache License 2.0
- 用途: 本地流式语音识别引擎(N-API 原生绑定,内含 onnxruntime 运行时)
- 义务: 保留 LICENSE 与 NOTICE 文本;对本仓库内的修改(如有)须显著标注。

## onnxruntime (随 sherpa-onnx 平台包分发,1.28.2)

- 来源: https://github.com/microsoft/onnxruntime
- 许可: MIT License — Copyright (c) Microsoft Corporation.

## 语音模型: sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20 (int8)

- 来源: https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models (HuggingFace 镜像: csukuangfj/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20)
- 许可: Apache-2.0(上游 icefall/k2 训练导出)
- 固化校验和(与 `scripts/voice-model.json` 一致,加载前强制验证):

| 文件                             | sha256                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| encoder-epoch-99-avg-1.int8.onnx | `8fa764187a261844f859d7143ebaa563af5d10adfece4c18a8f414c88cba2a9b` |
| decoder-epoch-99-avg-1.int8.onnx | `1a70c593d71e53f023f5f55b0b4cfff5055abb786ee3992e5f63dc2e273cc4fa` |
| joiner-epoch-99-avg-1.int8.onnx  | `1ed689c5ed19dbaa725d9d191bb4822b5f4855a39e1ffd28cbc1f340d25b2ee0` |
| tokens.txt                       | `a8e0e4ec53810e433789b54a5c0134a7eaa2ffca595a6334d54c00da858841d3` |

- 决策记录: ADR-0017(`docs/architecture/adr/0017-voice-input-is-local-streaming-stt.md`)。

## 明确排除的组件

- **SenseVoice / Paraformer 权重**(FunASR 自定义许可,非 OSI):未经法务确认不得随产品分发。
- **云端语音识别**(Azure Speech SDK / Web Speech API):默认拒绝,不构成任何分发组件。
