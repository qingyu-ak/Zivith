// ADR-0017 V3 — 麦克风采集 AudioWorklet:攒约 100ms 的 Float32 帧后发给主线程。
// 采样率不做降采样:音频只发往本机 API(127.0.0.1),由引擎侧按 16kHz 重采样。
class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 4800 samples ≈ 100ms @48kHz;其他采样率由引擎重采样兜底。
    this.buffer = new Float32Array(4800);
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (channel && channel.length > 0) {
      for (let i = 0; i < channel.length; i += 1) {
        this.buffer[this.filled] = channel[i];
        this.filled += 1;
        if (this.filled === this.buffer.length) {
          this.port.postMessage(this.buffer.slice(0));
          this.filled = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('voice-capture', VoiceCaptureProcessor);
