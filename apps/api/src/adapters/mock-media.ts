import type {
  ImageGenerationAdapter,
  ImageGenerationRequest,
  ImageGenerationResult,
  AudioSpeechAdapter,
  AudioSpeechRequest,
  AudioSpeechResult,
} from '../ports/media.js';

export class MockImageAdapter implements ImageGenerationAdapter {
  readonly provider = 'mock';
  readonly supportedModels = [{ id: 'mock-image-v1', name: 'Mock Image' }];

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const label = (request.prompt.slice(0, 18) || 'mock').replace(/[<>&'"]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${request.width ?? 1024}" height="${request.height ?? 1024}"><rect fill="#141414" width="100%" height="100%"/><text x="50%" y="50%" fill="#a3e635" font-family="sans-serif" font-size="42" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
    return {
      job_id: `mock-image-${request.request_id}`,
      status: 'completed',
      image_url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      metadata: { is_mock: true, request_id: request.request_id },
    };
  }
}

export class MockAudioAdapter implements AudioSpeechAdapter {
  readonly provider = 'mock';
  readonly supportedModels = [{ id: 'mock-audio-v1', name: 'Mock Audio' }];

  async synthesize(request: AudioSpeechRequest): Promise<AudioSpeechResult> {
    // Minimal silent-ish placeholder WAV header + tiny payload for local flows.
    const bytes = Buffer.from(
      'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
      'base64',
    );
    return {
      job_id: `mock-audio-${request.request_id}`,
      status: 'completed',
      audio_bytes: bytes,
      mime_type: 'audio/wav',
      metadata: {
        is_mock: true,
        request_id: request.request_id,
        input_preview: request.input.slice(0, 80),
      },
    };
  }
}
