// ADR-0017 — 语音输入 API 面(P3:能力先于界面):状态探测 + 流式转写 WebSocket。
// server.ts 默认绑 0.0.0.0,因此此路由自行校验连接来源,只允许回环访问(ADR-0013 本地单用户)。
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { VoiceService } from '../contexts/voice/service.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

interface VoiceSocket {
  readyState: number;
  send(payload: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', listener: (data: Buffer, isBinary: boolean) => void): void;
  on(event: 'close', listener: () => void): void;
}

export function registerVoiceRoutes(app: FastifyInstance, voice: VoiceService): void {
  app.get('/voice/status', async () => voice.status);

  app.get('/voice/ws', { websocket: true }, (socket: VoiceSocket, request: FastifyRequest) => {
    const remote = request.raw.socket.remoteAddress ?? '';
    if (!LOOPBACK.has(remote)) {
      socket.close(1008, 'voice endpoint is loopback-only');
      return;
    }

    let sessionId: string | null = null;

    const send = (payload: unknown) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(payload));
    };
    const finish = (code: number) => {
      try {
        socket.close(code);
      } catch {
        // 已关闭
      }
    };
    const abortAndClose = (message: string, code: number) => {
      if (sessionId) {
        voice.abortSession(sessionId);
        sessionId = null;
      }
      send({ type: 'error', code: 'VOICE_ERROR', message });
      finish(code);
    };

    // 握手:连接即告知引擎可用性(不可用直接失败,客户端在申请麦克风之前就能提示),
    // 随后等客户端 `start` 建立会话并回 `ready`。顺序:hello → start → ready → 音频。
    const status = voice.status;
    if (!status.available) {
      send({
        type: 'error',
        code: 'ENGINE_UNAVAILABLE',
        message: status.reason ?? '语音引擎未就绪',
      });
      finish(1011);
      return;
    }
    send({ type: 'hello' });

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        if (!sessionId) {
          abortAndClose('请先发送 start 指令', 1003);
          return;
        }
        try {
          const byteLength = data.byteLength - (data.byteLength % 4);
          const aligned = data.buffer.slice(data.byteOffset, data.byteOffset + byteLength);
          const samples = new Float32Array(aligned, 0, byteLength / 4);
          const result = voice.accept(sessionId, samples);
          for (const event of result.events) send(event);
        } catch (error) {
          abortAndClose(error instanceof Error ? error.message : '转写失败', 1011);
        }
        return;
      }
      try {
        const message = JSON.parse(data.toString('utf8')) as { type?: string; sampleRate?: number };
        if (message.type === 'start') {
          sessionId = voice.openSession(Number(message.sampleRate));
          send({ type: 'ready' });
          return;
        }
        if (message.type === 'stop' && sessionId) {
          const final = voice.finishSession(sessionId);
          sessionId = null;
          send(final);
          finish(1000);
          return;
        }
        abortAndClose('未知指令或缺少会话', 1003);
      } catch (error) {
        abortAndClose(error instanceof Error ? error.message : '指令处理失败', 1011);
      }
    });

    socket.on('close', () => {
      if (sessionId) {
        voice.abortSession(sessionId);
        sessionId = null;
      }
    });
  });
}
