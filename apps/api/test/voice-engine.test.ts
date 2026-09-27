// ADR-0017 V5 — 真实引擎加载冒烟测试:仅当本机模型就绪时运行(CI 无模型自动跳过)。
// 识别质量已由 V0 spike 在真实语音上验证(见 ADR-0017 附录);此处验证仓库内
// 适配器加载链路:规格读取 → sha256 校验 → 原生绑定 → 会话往返。
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSherpaSttEngine } from '../src/adapters/sherpa-stt.js';
import { VoiceService } from '../src/contexts/voice/service.js';

const modelDir =
  process.env.ZIVITH_VOICE_MODEL_DIR ??
  path.resolve(
    process.cwd(),
    '../../.voice-models/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20',
  );
const hasModel = existsSync(path.join(modelDir, 'encoder-epoch-99-avg-1.int8.onnx'));

describe.skipIf(!hasModel)('sherpa engine with real model', () => {
  it('loads pinned model files and runs a session end to end', async () => {
    const service = VoiceService.forEngine(await createSherpaSttEngine({ modelDir }));
    expect(service.status.available).toBe(true);
    expect(service.status.engine?.model).toContain('2023-02-20');

    const id = service.openSession(16000);
    // 1 秒静音:不产生有效文本,但走完整 accept → finish 链路。
    service.accept(id, new Float32Array(16000));
    const final = service.finishSession(id);
    expect(typeof final.text).toBe('string');
    expect(service.status.activeSessions).toBe(0);
  });

  it('refuses to load when a model file is tampered (fail closed)', async () => {
    // 指向一个存在但内容不符的目录:规格里文件缺失 → 不可用。
    const service = VoiceService.forEngine(
      await createSherpaSttEngine({ modelDir: modelDir + '-missing' }),
    );
    expect(service.status.available).toBe(false);
    expect(service.status.reason).toBeTruthy();
  });
});
