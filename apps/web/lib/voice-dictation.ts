'use client';

// ADR-0017 V3 — 渲染进程听写会话:麦克风 PCM → 本机 API 流式转写。
// 音频只发往 127.0.0.1 的本机 API;失败路径是禁用与提示,绝不回退云端(ADR-0017 Decision)。
// 握手顺序:连接 → 服务端 `hello`(引擎可用) → 客户端采麦 → `start{sampleRate}` → 服务端 `ready` → 音频流。
// 用 127.0.0.1 而非 localhost:系统代理(如 Clash)会劫持 localhost 域名请求。

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000/api/v1';

export interface VoiceStatus {
  available: boolean;
  engine: {
    engine: string;
    model: string;
    sample_rate: number;
    hotwords: number;
  } | null;
  reason: string | null;
  active_sessions: number;
}

export async function fetchVoiceStatus(): Promise<VoiceStatus> {
  const response = await fetch(`${API_URL}/voice/status`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`语音服务状态获取失败 (HTTP ${response.status})`);
  return (await response.json()) as VoiceStatus;
}

export interface DictationCallbacks {
  /** 当前句的实时部分转写(随说话刷新)。 */
  onPartial?: (accumulated: string, partial: string) => void;
  /** 一个完整分句落地(检测到停顿)。 */
  onSegment?: (accumulated: string, segment: string) => void;
  /** 会话结束,返回完整转写文本。 */
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
}

type ServerMessage =
  | { type: 'hello' }
  | { type: 'ready' }
  | { type: 'partial'; text: string }
  | { type: 'segment'; text: string }
  | { type: 'final'; text: string }
  | { type: 'error'; code: string; message: string };

function withTimeout(step: Promise<void>, label: string, timeoutMs = 8000): Promise<void> {
  return Promise.race([
    step,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}超时`)), timeoutMs),
    ),
  ]);
}

export class VoiceDictation {
  private ws: WebSocket | null = null;
  private context: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private accumulated = '';
  private finalDeferred: {
    resolve: (text: string) => void;
    reject: (reason: Error) => void;
  } | null = null;

  get isRecording(): boolean {
    return this.ws !== null;
  }

  async start(callbacks: DictationCallbacks): Promise<void> {
    if (this.ws) return;
    this.accumulated = '';

    const wsUrl = `${API_URL.replace(/^http/, 'ws')}/voice/ws`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    let helloResolve!: () => void;
    let helloReject!: (reason: Error) => void;
    const hello = new Promise<void>((resolve, reject) => {
      helloResolve = resolve;
      helloReject = reject;
    });
    let readyResolve!: () => void;
    let readyReject!: (reason: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });

    const fail = (message: string) => {
      const error = new Error(message);
      helloReject(error);
      readyReject(error);
      return error;
    };
    const cleanup = () => this.cleanup();

    ws.onerror = () => {
      const error = fail('无法连接本机语音服务 (API 127.0.0.1:4000)');
      callbacks.onError?.(error.message);
      cleanup();
    };
    ws.onclose = () => {
      const deferred = this.finalDeferred;
      this.finalDeferred = null;
      if (deferred) {
        deferred.reject(new Error('听写会话在结束前中断'));
      } else {
        fail('听写连接已关闭');
      }
      cleanup();
    };
    ws.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      switch (message.type) {
        case 'hello':
          helloResolve();
          return;
        case 'ready':
          readyResolve();
          return;
        case 'partial':
          callbacks.onPartial?.(this.accumulated, message.text);
          return;
        case 'segment':
          this.accumulated += message.text;
          callbacks.onSegment?.(this.accumulated, message.text);
          return;
        case 'final': {
          const deferred = this.finalDeferred;
          this.finalDeferred = null;
          // 服务端 final 是权威完整文本(含全部分句);客户端 accumulated 仅用于实时展示。
          callbacks.onFinal?.(message.text);
          deferred?.resolve(message.text);
          cleanup();
          return;
        }
        case 'error': {
          const deferred = this.finalDeferred;
          this.finalDeferred = null;
          const error = fail(message.message);
          callbacks.onError?.(message.message);
          deferred?.reject(error);
          cleanup();
          return;
        }
        default:
          return;
      }
    };

    try {
      // 引擎不可用/连接失败在此暴露,麦克风权限尚未申请。
      await withTimeout(hello, '连接语音服务');
      await this.startCapture(callbacks);
      await withTimeout(ready, '建立听写会话');
    } catch (error) {
      cleanup();
      throw error instanceof Error ? error : new Error('听写启动失败');
    }
  }

  /** 结束听写并取回完整文本。 */
  async stop(): Promise<string> {
    const ws = this.ws;
    if (!ws) return '';
    return new Promise<string>((resolve, reject) => {
      const deferred = { resolve, reject };
      this.finalDeferred = deferred;
      ws.send(JSON.stringify({ type: 'stop' }));
      // 引擎冲刷通常亚秒级;超时按中断处理,避免按钮卡死。
      setTimeout(() => {
        if (this.finalDeferred === deferred) {
          this.finalDeferred = null;
          reject(new Error('结束听写超时'));
          this.cleanup();
        }
      }, 5_000);
    });
  }

  abort(): void {
    const ws = this.ws;
    this.cleanup();
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.close(1000);
      } catch {
        // 已关闭
      }
    }
  }

  private async startCapture(callbacks: DictationCallbacks): Promise<void> {
    try {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        throw new Error('听写连接已断开');
      }
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const context = new AudioContext();
      this.context = context;
      await context.audioWorklet.addModule('/voice-capture.worklet.js');
      const source = context.createMediaStreamSource(this.mediaStream);
      const node = new AudioWorkletNode(context, 'voice-capture');
      this.node = node;
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(event.data.buffer);
        }
      };
      // 静音汇:让采集链路保持运行,但不把麦克风回放到扬声器。
      const mute = context.createGain();
      mute.gain.value = 0;
      source.connect(node);
      node.connect(mute);
      mute.connect(context.destination);
      this.ws.send(JSON.stringify({ type: 'start', sampleRate: context.sampleRate }));
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'NotAllowedError'
          ? '麦克风权限被拒绝;请在系统或应用设置中允许 Zivith 使用麦克风'
          : error instanceof Error
            ? `麦克风启动失败:${error.message}`
            : '麦克风启动失败';
      callbacks.onError?.(message);
      throw new Error(message);
    }
  }

  private cleanup(): void {
    this.node?.port.close();
    this.node?.disconnect();
    this.node = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    for (const track of this.mediaStream?.getTracks() ?? []) track.stop();
    this.mediaStream = null;
    this.ws = null;
  }
}
