// ADR-0017 — 语音输入能力边界(P4):STT 引擎是按能力寻址的外设,
// 领域只依赖本端口;更换引擎(whisper.cpp / 云后端)只动 adapters/,不动领域与路由。

export interface SttEvent {
  type: 'partial' | 'segment';
  text: string;
}

export interface SttFinal {
  type: 'final';
  text: string;
}

export interface SttStream {
  /** 送入一段单声道 PCM;返回当前句的部分识别文本。 */
  accept(samples: Float32Array, sampleRate: number): SttEvent[];
  /** 结束输入并冲刷剩余解码;返回整段(含全部已完成分句)的最终文本。 */
  finish(): SttFinal;
  close(): void;
}

export interface SttEngineInfo {
  engine: string;
  model: string;
  sampleRate: number;
  hotwords: number;
}

export class SttUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SttUnavailableError';
  }
}

export interface SttEngine {
  /** 引擎不可用时为 null(模型缺失/校验失败/原生绑定加载失败)。 */
  readonly info: SttEngineInfo | null;
  /** info 为 null 时的人类可读原因。 */
  readonly unavailableReason?: string;
  /** info 为 null 时抛出 SttUnavailableError。 */
  start(): SttStream;
}
