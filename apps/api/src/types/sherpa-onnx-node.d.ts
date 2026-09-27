// sherpa-onnx-node 是无类型的 CJS 原生绑定包;此处只声明语音输入适配器用到的面。
// 命名与 node_modules/sherpa-onnx-node/streaming-asr.js 一致(1.13.8)。
declare module 'sherpa-onnx-node' {
  export interface SherpaOnlineStream {
    acceptWaveform(wave: { samples: Float32Array; sampleRate: number }): void;
    inputFinished(): void;
  }

  export interface SherpaRecognizerResult {
    text?: string;
    tokens?: string[];
    timestamps?: number[];
  }

  export interface SherpaOnlineRecognizerConfig {
    modelConfig: {
      transducer: { encoder: string; decoder: string; joiner: string };
      tokens: string;
      numThreads?: number;
      sampleRate?: number;
      featureDim?: number;
      debug?: boolean;
    };
    decodingMethod?: 'greedy_search' | 'modified_beam_search';
    enableEndpoint?: boolean;
    hotwordsFile?: string;
    hotwordsScore?: number;
  }

  export class OnlineRecognizer {
    constructor(config: SherpaOnlineRecognizerConfig);
    createStream(): SherpaOnlineStream;
    isReady(stream: SherpaOnlineStream): boolean;
    decode(stream: SherpaOnlineStream): void;
    isEndpoint(stream: SherpaOnlineStream): boolean;
    reset(stream: SherpaOnlineStream): void;
    getResult(stream: SherpaOnlineStream): SherpaRecognizerResult;
  }
}
