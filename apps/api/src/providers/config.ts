/** Strip inline `# comments` and surrounding quotes from env values. */
export function envValue(name: string, fallback = ''): string {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return fallback;
  const withoutComment = raw.split('#')[0] ?? raw;
  return withoutComment.trim().replace(/^["']|["']$/g, '');
}

export type ProviderId = 'mock' | 'deepseek' | 'siliconflow';

export interface ProviderSelection {
  llm: ProviderId;
  image: ProviderId;
  video: ProviderId;
  audio: ProviderId;
}

export interface ProviderModels {
  llm: string;
  /** Text-to-image：首张角色/场景图 */
  image: string;
  /** Text+image-to-image：有参考图时的一致性生图 */
  image_i2i: string;
  /** Text-to-video：无可用参考帧时 */
  video: string;
  /** Image-to-video：有 http(s) 参考帧时，保证角色/场景一致 */
  video_i2v: string;
  audio: string;
}

/** 有参考图 → I2I，否则 T2I。 */
export function pickImageModel(models: ProviderModels, hasReferenceImages: boolean): string {
  return hasReferenceImages ? models.image_i2i : models.image;
}

/** 有可用 http(s) 参考帧 → I2V，否则 T2V。 */
export function pickVideoModel(models: ProviderModels, hasHttpsReferenceFrame: boolean): string {
  return hasHttpsReferenceFrame ? models.video_i2v : models.video;
}

export interface ProviderCredentials {
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  siliconflowApiKey: string;
  siliconflowBaseUrl: string;
}

function asProvider(value: string, fallback: ProviderId): ProviderId {
  if (value === 'mock' || value === 'deepseek' || value === 'siliconflow') return value;
  return fallback;
}

export function loadProviderCredentials(): ProviderCredentials {
  return {
    deepseekApiKey: envValue('DEEPSEEK_API_KEY'),
    deepseekBaseUrl: envValue('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
    siliconflowApiKey: envValue('SILICONFLOW_API_KEY'),
    siliconflowBaseUrl: envValue('SILICONFLOW_BASE_URL', 'https://api.siliconflow.cn/v1'),
  };
}

export function loadProviderModels(): ProviderModels {
  const imageT2i = envValue('SILICONFLOW_IMAGE_MODEL', 'Qwen/Qwen-Image');
  const videoT2v = envValue('SILICONFLOW_VIDEO_MODEL', 'Wan-AI/Wan2.2-T2V-A14B');
  return {
    llm: envValue('DEEPSEEK_MODEL', 'deepseek-chat'),
    image: imageT2i,
    // Prefer explicit I2I env; else fall back to a known img2img-capable id.
    image_i2i: envValue('SILICONFLOW_IMAGE_I2I_MODEL', 'Qwen/Qwen-Image-Edit'),
    // Wan2.1 series was deprecated on SiliconFlow (2025-09); default to Wan2.2 T2V.
    video: videoT2v,
    video_i2v: envValue('SILICONFLOW_VIDEO_I2V_MODEL', 'Wan-AI/Wan2.2-I2V-A14B'),
    audio: envValue('SILICONFLOW_AUDIO_MODEL', 'FunAudioLLM/CosyVoice2-0.5B'),
  };
}

/** Defaults favor real providers when keys exist; otherwise mock. */
export function loadProviderSelection(override?: Partial<ProviderSelection>): ProviderSelection {
  const credentials = loadProviderCredentials();
  const defaults: ProviderSelection = {
    llm: credentials.deepseekApiKey ? 'deepseek' : 'mock',
    image: credentials.siliconflowApiKey ? 'siliconflow' : 'mock',
    video: credentials.siliconflowApiKey ? 'siliconflow' : 'mock',
    audio: credentials.siliconflowApiKey ? 'siliconflow' : 'mock',
  };
  return {
    llm: asProvider(envValue('LLM_PROVIDER', defaults.llm), defaults.llm),
    image: asProvider(envValue('IMAGE_PROVIDER', defaults.image), defaults.image),
    video: asProvider(envValue('VIDEO_PROVIDER', defaults.video), defaults.video),
    audio: asProvider(envValue('AUDIO_PROVIDER', defaults.audio), defaults.audio),
    ...override,
  };
}

export function listProviderCatalog() {
  const credentials = loadProviderCredentials();
  const models = loadProviderModels();
  const selection = loadProviderSelection();
  return {
    selection,
    models,
    providers: [
      {
        id: 'mock',
        label: 'Mock（本地占位）',
        modalities: ['llm', 'image', 'video', 'audio'],
        configured: true,
      },
      {
        id: 'deepseek',
        label: 'DeepSeek',
        modalities: ['llm'],
        configured: Boolean(credentials.deepseekApiKey),
        default_model: models.llm,
        base_url: credentials.deepseekBaseUrl,
      },
      {
        id: 'siliconflow',
        label: 'SiliconFlow（硅基流动）',
        modalities: ['llm', 'image', 'video', 'audio'],
        configured: Boolean(credentials.siliconflowApiKey),
        default_models: {
          llm: models.llm,
          image: models.image,
          image_i2i: models.image_i2i,
          video: models.video,
          video_i2v: models.video_i2v,
          audio: models.audio,
        },
        base_url: credentials.siliconflowBaseUrl,
      },
    ],
  };
}
