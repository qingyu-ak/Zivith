// ADR-0017 V5 — 语音输入合同测试:fake 引擎注入(不依赖真实模型);
// 真实模型用例在模型就绪时另行验证(构建产物外,不进 CI 门禁)。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { buildApp } from '../src/app.js';
import { VoiceService } from '../src/contexts/voice/service.js';
import {
  SttUnavailableError,
  type SttEngine,
  type SttEvent,
  type SttFinal,
  type SttStream,
} from '../src/ports/stt.js';

class FakeSttStream implements SttStream {
  private frames = 0;

  accept(samples: Float32Array, sampleRate: number): SttEvent[] {
    this.frames += 1;
    return [
      {
        type: 'partial',
        text: `已收到第 ${this.frames} 帧 @${sampleRate}Hz (${samples.length} 采样)`,
      },
    ];
  }

  finish(): SttFinal {
    return { type: 'final', text: '听写完成文本' };
  }

  close(): void {
    // 无资源
  }
}

class FakeSttEngine implements SttEngine {
  readonly info = {
    engine: 'fake',
    model: 'fake-model (int8)',
    sampleRate: 16000,
    hotwords: 0,
  };

  start(): SttStream {
    return new FakeSttStream();
  }
}

class UnavailableSttEngine implements SttEngine {
  readonly info = null;
  readonly unavailableReason = '模型文件缺失';

  start(): SttStream {
    throw new SttUnavailableError(`语音识别引擎不可用:${this.unavailableReason}`);
  }
}

interface VoiceTestClient {
  open: Promise<void>;
  next(timeoutMs?: number): Promise<Record<string, unknown>>;
  sendText(payload: unknown): void;
  sendBinary(samples: Float32Array): void;
  waitForClose(): Promise<void>;
}

function connectClient(url: string): VoiceTestClient {
  const ws = new WebSocket(url);
  // 监听必须在建立前挂上:服务端 `hello` 可能早于客户端 open 事件到达。
  const queue: Array<Record<string, unknown>> = [];
  const waiters: Array<{
    timer: NodeJS.Timeout;
    resolve: (value: Record<string, unknown>) => void;
  }> = [];
  ws.on('message', (data) => {
    const parsed = JSON.parse(String(data)) as Record<string, unknown>;
    const waiter = waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(parsed);
    } else {
      queue.push(parsed);
    }
  });
  const open = new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return {
    open,
    next(timeoutMs = 2000) {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('等待消息超时')), timeoutMs);
        waiters.push({ timer, resolve });
      });
    },
    sendText(payload) {
      ws.send(JSON.stringify(payload));
    },
    sendBinary(samples) {
      ws.send(Buffer.from(samples.buffer));
    },
    waitForClose() {
      return new Promise((resolve) => ws.once('close', () => resolve()));
    },
  };
}

describe('voice status (ADR-0017)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      jwtSecret: 'test-secret-that-is-at-least-32-characters',
      voice: VoiceService.forEngine(new FakeSttEngine()),
    });
  });

  afterAll(async () => app.close());

  it('reports engine availability for the UI to enable the mic', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/voice/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      available: true,
      engine: { engine: 'fake', model: 'fake-model (int8)', hotwords: 0 },
      active_sessions: 0,
    });
  });
});

describe('voice status when engine unavailable', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      jwtSecret: 'test-secret-that-is-at-least-32-characters',
      voice: VoiceService.forEngine(new UnavailableSttEngine()),
    });
  });

  afterAll(async () => app.close());

  it('reports unavailable with reason instead of falling back to cloud', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/voice/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ available: false, reason: '模型文件缺失' });
  });
});

describe('voice ws streaming', () => {
  let app: FastifyInstance;
  let wsUrl: string;

  beforeAll(async () => {
    app = await buildApp({
      jwtSecret: 'test-secret-that-is-at-least-32-characters',
      voice: VoiceService.forEngine(new FakeSttEngine()),
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address() as AddressInfo;
    wsUrl = `ws://127.0.0.1:${address.port}/api/v1/voice/ws`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('streams partials and returns a final transcript', async () => {
    const client = connectClient(wsUrl);
    await client.open;
    await expect(client.next()).resolves.toMatchObject({ type: 'hello' });
    client.sendText({ type: 'start', sampleRate: 48000 });
    await expect(client.next()).resolves.toMatchObject({ type: 'ready' });

    client.sendBinary(Float32Array.from({ length: 4800 }, () => 0.1));
    await expect(client.next()).resolves.toMatchObject({
      type: 'partial',
      text: expect.stringContaining('4800 采样'),
    });
    client.sendBinary(Float32Array.from({ length: 4800 }, () => 0.1));
    await expect(client.next()).resolves.toMatchObject({ type: 'partial' });

    client.sendText({ type: 'stop' });
    await expect(client.next()).resolves.toMatchObject({ type: 'final', text: '听写完成文本' });
    await client.waitForClose();
  });

  it('closes with an explicit error when the engine is unavailable', async () => {
    const app2 = await buildApp({
      jwtSecret: 'test-secret-that-is-at-least-32-characters',
      voice: VoiceService.forEngine(new UnavailableSttEngine()),
    });
    await app2.listen({ port: 0, host: '127.0.0.1' });
    const address = app2.server.address() as AddressInfo;
    try {
      const client = connectClient(`ws://127.0.0.1:${address.port}/api/v1/voice/ws`);
      await client.open;
      await expect(client.next()).resolves.toMatchObject({
        type: 'error',
        message: expect.stringContaining('模型文件缺失'),
      });
    } finally {
      await app2.close();
    }
  });

  it('rejects audio without a session', async () => {
    const client = connectClient(wsUrl);
    await client.open;
    await expect(client.next()).resolves.toMatchObject({ type: 'hello' });
    client.sendBinary(Float32Array.from({ length: 1600 }, () => 0.1));
    await expect(client.next()).resolves.toMatchObject({ type: 'error' });
  });
});

describe('VoiceService sessions', () => {
  it('caps concurrent sessions at two', () => {
    const service = VoiceService.forEngine(new FakeSttEngine());
    const first = service.openSession(48000);
    const second = service.openSession(48000);
    expect(() => service.openSession(48000)).toThrow(/已有听写会话/);
    service.abortSession(first);
    service.abortSession(second);
    expect(service.status.activeSessions).toBe(0);
  });

  it('refuses sessions without a usable engine', () => {
    const service = VoiceService.forEngine(new UnavailableSttEngine());
    expect(() => service.openSession(16000)).toThrow(/模型文件缺失/);
  });

  it('drops a silent session instead of inserting noise', () => {
    const service = VoiceService.forEngine(new FakeSttEngine());
    const id = service.openSession(16000);
    service.accept(id, new Float32Array(1600));
    expect(service.finishSession(id)).toEqual({ type: 'final', text: '' });
  });

  it('keeps transcript after voiced frames', () => {
    const service = VoiceService.forEngine(new FakeSttEngine());
    const id = service.openSession(16000);
    const voiced = Float32Array.from({ length: 1600 }, () => 0.1);
    service.accept(id, voiced);
    service.accept(id, voiced);
    expect(service.finishSession(id).text).toBe('听写完成文本');
  });
});
