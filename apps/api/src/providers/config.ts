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
  image: string;
  video: string;
  audio: string;
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
  return {
    llm: envValue('DEEPSEEK_MODEL', 'deepseek-chat'),
    image: envValue('SILICONFLOW_IMAGE_MODEL', 'black-forest-labs/FLUX.1-schnell'),
    video: envValue('SILICONFLOW_VIDEO_MODEL', 'Wan-AI/Wan2.1-T2V-14B'),
    audio: envValue('SILICONFLOW_AUDIO_MODEL', 'FunAudioLLM/CosyVoice2-0.5B'),
  };
}

/** Defaults favor real providers when keys exist; otherwise mock. */
export function loadProviderSelection(
  override?: Partial<ProviderSelection>,
): ProviderSelection {
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
          video: models.video,
          audio: models.audio,
        },
        base_url: credentials.siliconflowBaseUrl,
      },
    ],
  };
}
