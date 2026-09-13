// ADR-0017 — sherpa-onnx STT 适配器。这是能力边界内唯一允许 import 'sherpa-onnx-node' 的模块;
// 更换引擎 = 新增一个 SttEngine 适配器,领域与路由不动(P4)。
// fail closed:模型文件缺失/大小或 sha256 不符/原生绑定加载失败 → 引擎不可用,绝不回退云端。
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SttUnavailableError,
  type SttEngine,
  type SttEngineInfo,
  type SttEvent,
  type SttFinal,
  type SttStream,
} from '../ports/stt.js';

// apps/api/src/adapters → 仓库根
const SPEC_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../scripts/voice-model.json',
);

interface ModelSpec {
  modelId: string;
  label: string;
  sampleRate: number;
  featureDim: number;
  files: Array<{ name: string; sha256: string; bytes: number }>;
}

function loadSpec(): ModelSpec {
  return JSON.parse(readFileSync(SPEC_PATH, 'utf8')) as ModelSpec;
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolveHash(hash.digest('hex')));
  });
}

export interface SherpaSttOptions {
  modelDir: string;
  numThreads?: number;
  hotwordsFile?: string | null;
  hotwordsScore?: number;
}

export async function createSherpaSttEngine(options: SherpaSttOptions): Promise<SttEngine> {
  try {
    const spec = loadSpec();
    for (const file of spec.files) {
      const filePath = path.join(options.modelDir, file.name);
      if (!existsSync(filePath)) throw new Error(`模型文件缺失: ${file.name}`);
      if (statSync(filePath).size !== file.bytes) throw new Error(`模型文件大小不符: ${file.name}`);
      const hash = await sha256File(filePath);
      if (hash !== file.sha256) throw new Error(`模型文件 sha256 不符: ${file.name}`);
    }
    const { OnlineRecognizer } = await import('sherpa-onnx-node');
    const byPrefix = (prefix: string) => {
      const file = spec.files.find((item) => item.name.startsWith(prefix));
      if (!file) throw new Error(`模型规格缺少 ${prefix}`);
      return path.join(options.modelDir, file.name);
    };
    const recognizer = new OnlineRecognizer({
      modelConfig: {
        transducer: {
          encoder: byPrefix('encoder'),
          decoder: byPrefix('decoder'),
          joiner: byPrefix('joiner'),
        },
        tokens: byPrefix('tokens'),
        numThreads: options.numThreads ?? 2,
        sampleRate: spec.sampleRate,
        featureDim: spec.featureDim,
      },
      // 热词偏置要求 modified_beam_search;字段必须位于 config 顶层(V0 spike 实测)。
      decodingMethod: 'modified_beam_search',
      enableEndpoint: true,
      ...(options.hotwordsFile
        ? { hotwordsFile: options.hotwordsFile, hotwordsScore: options.hotwordsScore ?? 1.5 }
        : {}),
    });
    const info: SttEngineInfo = {
      engine: 'sherpa-onnx',
      model: spec.label,
      sampleRate: spec.sampleRate,
      hotwords: options.hotwordsFile
        ? readFileSync(options.hotwordsFile, 'utf8')
            .split('\n')
            .filter((line) => line.trim()).length
        : 0,
    };
    return new SherpaSttEngine(recognizer, info);
  } catch (error) {
    return new UnavailableSttEngine(error instanceof Error ? error.message : '语音引擎初始化失败');
  }
}

/** 中文按字连接;若相邻分句为拉丁字母/数字边界则补空格,避免英文粘连。 */
function joinSegments(segments: string[]): string {
  let text = '';
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    if (text && /[A-Za-z0-9,.!?]$/.test(text) && /^[A-Za-z0-9(]/.test(trimmed)) {
      text += ' ';
    }
    text += trimmed;
  }
  return text;
}

class SherpaSttEngine implements SttEngine {
  readonly info: SttEngineInfo;

  constructor(
    private readonly recognizer: import('sherpa-onnx-node').OnlineRecognizer,
    info: SttEngineInfo,
  ) {
    this.info = info;
  }
  start(): SttStream {
    const recognizer = this.recognizer;
    const stream = recognizer.createStream();
    const segments: string[] = [];
    let lastPartial = '';
    return {
      accept(samples: Float32Array, sampleRate: number): SttEvent[] {
        stream.acceptWaveform({ samples, sampleRate });
        while (recognizer.isReady(stream)) recognizer.decode(stream);
        const events: SttEvent[] = [];
        if (recognizer.isEndpoint(stream)) {
          // 停顿即分句:落一段、重置状态,抑制长句流式重复伪影(V0 证据)。
          const text = (recognizer.getResult(stream).text ?? '').trim();
          if (text) {
            segments.push(text);
            events.push({ type: 'segment', text });
          }
          recognizer.reset(stream);
          lastPartial = '';
          return events;
        }
        const text = (recognizer.getResult(stream).text ?? '').trim();
        if (text && text !== lastPartial) {
          lastPartial = text;
          events.push({ type: 'partial', text });
        }
        return events;
      },
      finish(): SttFinal {
        stream.inputFinished();
        while (recognizer.isReady(stream)) recognizer.decode(stream);
        const text = (recognizer.getResult(stream).text ?? '').trim();
        if (text) segments.push(text);
        return { type: 'final', text: joinSegments(segments) };
      },
      close() {
        // stream 无原生句柄需显式释放,交给 GC;recognizer 跨会话复用。
      },
    };
  }
}

class UnavailableSttEngine implements SttEngine {
  readonly info = null;

  constructor(readonly unavailableReason: string) {}

  start(): SttStream {
    throw new SttUnavailableError(`语音识别引擎不可用:${this.unavailableReason}`);
  }
}
