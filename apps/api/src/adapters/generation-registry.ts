import type { VideoGenerationAdapter } from '../ports/generation.js';

export class GenerationAdapterRegistry {
  private readonly videoAdapters = new Map<string, VideoGenerationAdapter>();

  registerVideo(adapter: VideoGenerationAdapter): this {
    if (this.videoAdapters.has(adapter.provider)) {
      throw new Error(`Video generation provider already registered: ${adapter.provider}`);
    }
    this.videoAdapters.set(adapter.provider, adapter);
    return this;
  }

  video(provider: string): VideoGenerationAdapter {
    const adapter = this.videoAdapters.get(provider);
    if (!adapter) throw new Error(`Video generation provider not registered: ${provider}`);
    return adapter;
  }

  listVideoProviders(): string[] {
    return [...this.videoAdapters.keys()];
  }
}
