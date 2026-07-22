import type {
  AudioSpeechAdapter,
  AudioSpeechRequest,
  AudioSpeechResult,
} from '../ports/media.js';

export interface SiliconFlowAudioAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  fetchImpl?: typeof fetch;
}

export class SiliconFlowAudioAdapter implements AudioSpeechAdapter {
  readonly provider = 'siliconflow';
  readonly supportedModels;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SiliconFlowAudioAdapterOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.siliconflow.cn/v1').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    const model = options.defaultModel ?? 'FunAudioLLM/CosyVoice2-0.5B';
    this.supportedModels = [{ id: model, name: 'SiliconFlow TTS', version: '1' }];
  }

  async synthesize(request: AudioSpeechRequest): Promise<AudioSpeechResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        input: request.input,
        // CosyVoice expects `model:voice`; OpenAI-compatible voices use short names.
        voice:
          request.voice ??
          (request.model.includes('CosyVoice')
            ? `${request.model}:alex`
            : 'alloy'),
        response_format: 'mp3',
        sample_rate: 32_000,
        ...(request.speed !== undefined ? { speed: request.speed } : {}),
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SiliconFlow audio API ${response.status}: ${body.slice(0, 500)}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as { url?: string; audio_url?: string };
      const audioUrl = payload.url ?? payload.audio_url;
      if (!audioUrl) throw new Error('SiliconFlow audio API returned JSON without URL');
      return {
        job_id: `sf-audio-${request.request_id}`,
        status: 'completed',
        audio_url: audioUrl,
        mime_type: 'audio/mpeg',
        metadata: { provider: 'siliconflow', request_id: request.request_id },
      };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      job_id: `sf-audio-${request.request_id}`,
      status: 'completed',
      audio_bytes: bytes,
      mime_type: contentType || 'audio/mpeg',
      metadata: { provider: 'siliconflow', request_id: request.request_id },
    };
  }
}
