// ADR-0017 — 语音输入上下文:会话编排、世界热词生成、空闲与体量上限。
// 合规红线(Compliance):音频与转写稿零持久化——只进内存,随会话结束丢弃;
// 失败路径是禁用而非云端回退。
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { PrismaClient } from '@zivith/database';
import { createSherpaSttEngine } from '../../adapters/sherpa-stt.js';
import {
  SttUnavailableError,
  type SttEngine,
  type SttEvent,
  type SttFinal,
  type SttStream,
} from '../../ports/stt.js';
import { collectHotwords } from './hotwords.js';
import { collapseRepeatArtifacts, isVoicedFrame, shouldKeepTranscript } from './transcript.js';

const MAX_SESSIONS = 2;
const IDLE_TIMEOUT_MS = 120_000;
// ≈16 分钟 @48kHz float32;防止被遗忘的连接拖住解码线程。
const MAX_BYTES_PER_SESSION = 96 * 1024 * 1024;

export interface VoiceStatus {
  available: boolean;
  engine: {
    engine: string;
    model: string;
    sampleRate: number;
    hotwords: number;
  } | null;
  reason: string | null;
  activeSessions: number;
}

export interface VoiceAcceptResult {
  events: SttEvent[];
  final: SttFinal | null;
}

interface VoiceSession {
  id: string;
  stream: SttStream;
  sampleRate: number;
  bytes: number;
  lastActivity: number;
  voicedFrames: number;
}

export class VoiceService {
  private readonly sessions = new Map<string, VoiceSession>();

  private constructor(private readonly engine: SttEngine) {}

  /** 测试与依赖注入入口:绕过模型加载,直接绑定引擎实现。 */
  static forEngine(engine: SttEngine): VoiceService {
    return new VoiceService(engine);
  }

  static async create(
    db: PrismaClient,
    options: { modelDir?: string; hotwordsScore?: number } = {},
  ): Promise<VoiceService> {
    const modelDir =
      options.modelDir ??
      process.env.ZIVITH_VOICE_MODEL_DIR ??
      path.resolve(
        process.cwd(),
        '../../.voice-models/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20',
      );
    // 热词来自实体名称与事件标题(ADR-0017),不含导入别名切片。
    // 生成失败不阻塞引擎加载(热词是增强能力,不是门禁)。
    const hotwordsFile = await VoiceService.writeHotwordsFile(db);
    const engine = await createSherpaSttEngine({
      modelDir,
      hotwordsFile,
      hotwordsScore: options.hotwordsScore ?? 1.5,
    });
    return new VoiceService(engine);
  }

  private static async writeHotwordsFile(db: PrismaClient): Promise<string | null> {
    try {
      const assets = await db.asset.findMany({
        where: { deletedAt: null },
        select: { name: true },
        take: 500,
      });
      const events = await db.worldEvent.findMany({
        where: { deletedAt: null },
        select: { title: true },
        take: 200,
      });
      const list = collectHotwords(
        assets,
        events.map((event) => event.title),
      );
      if (list.length === 0) return null;
      const dir = path.resolve(process.cwd(), 'data/voice');
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'hotwords.txt');
      writeFileSync(file, `${list.join('\n')}\n`, 'utf8');
      return file;
    } catch {
      return null;
    }
  }

  get status(): VoiceStatus {
    return {
      available: this.engine.info !== null,
      engine: this.engine.info,
      reason: this.engine.info ? null : (this.engine.unavailableReason ?? null),
      activeSessions: this.sessions.size,
    };
  }

  openSession(sampleRate: number): string {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new SttUnavailableError('start 指令缺少有效 sampleRate');
    }
    if (!this.engine.info) {
      throw new SttUnavailableError(this.engine.unavailableReason ?? '引擎未就绪');
    }
    this.sweepIdle();
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new SttUnavailableError('已有听写会话在进行,请先结束当前会话');
    }
    const id = randomUUID();
    this.sessions.set(id, {
      id,
      stream: this.engine.start(),
      sampleRate,
      bytes: 0,
      lastActivity: Date.now(),
      voicedFrames: 0,
    });
    return id;
  }

  accept(id: string, samples: Float32Array): VoiceAcceptResult {
    const session = this.sessions.get(id);
    if (!session) throw new SttUnavailableError('听写会话不存在或已结束');
    session.bytes += samples.byteLength;
    if (session.bytes > MAX_BYTES_PER_SESSION) {
      this.abortSession(id);
      throw new SttUnavailableError('单次听写音频超长,会话已结束');
    }
    session.lastActivity = Date.now();
    if (isVoicedFrame(samples)) session.voicedFrames += 1;
    const events = session.stream.accept(samples, session.sampleRate).map((event) => ({
      ...event,
      text: collapseRepeatArtifacts(event.text),
    }));
    return { events, final: null };
  }

  finishSession(id: string): SttFinal {
    const session = this.sessions.get(id);
    if (!session) throw new SttUnavailableError('听写会话不存在或已结束');
    this.sessions.delete(id);
    const final = session.stream.finish();
    const text = collapseRepeatArtifacts(final.text);
    return {
      type: 'final',
      text: shouldKeepTranscript(text, session.voicedFrames) ? text : '',
    };
  }

  abortSession(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    session.stream.close();
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.abortSession(id);
    }
  }

  private sweepIdle(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > IDLE_TIMEOUT_MS) {
        this.abortSession(id);
      }
    }
  }
}
