import { defineConfig } from 'vitest/config';

/**
 * API test defaults.
 *
 * @prisma/client auto-loads the repo-root `.env` under NODE_ENV=test, which would
 * inject real provider keys (DEEPSEEK_API_KEY / SILICONFLOW_API_KEY) into
 * process.env and make createProviderBundle() hit live APIs during unit tests.
 * Force every provider to mock so tests stay offline and deterministic.
 */
export default defineConfig({
  test: {
    env: {
      LLM_PROVIDER: 'mock',
      IMAGE_PROVIDER: 'mock',
      VIDEO_PROVIDER: 'mock',
      AUDIO_PROVIDER: 'mock',
    },
  },
});
