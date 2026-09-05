import { afterEach, describe, expect, it } from 'vitest';
import {
  createCustomProvider,
  extraModelsFor,
  addExtraModel,
  getCustomProvider,
  listCustomProviders,
  resetCustomProviders,
  updateCustomProvider,
} from '../src/providers/custom-providers.js';
import { createProviderBundle } from '../src/providers/registry.js';

afterEach(() => {
  resetCustomProviders();
});

describe('custom providers', () => {
  it('stores openai-compatible vendors without returning the key', () => {
    const created = createCustomProvider({
      name: 'Zhipu',
      base_url: 'https://api.example.com/v1/',
      api_key: 'secret-key',
      api_format: 'openai_chat',
      models: ['glm-4.6', 'glm-4.6'],
    });
    expect(created.id.startsWith('custom_')).toBe(true);
    expect(created.base_url).toBe('https://api.example.com/v1');
    expect(created.models).toEqual(['glm-4.6']);
    expect(created.has_key).toBe(true);
    expect(listCustomProviders()[0]).not.toHaveProperty('api_key');
    expect(getCustomProvider(created.id)?.api_key).toBe('secret-key');
  });

  it('uses the custom endpoint when selected', () => {
    const created = createCustomProvider({
      name: 'Local',
      base_url: 'http://127.0.0.1:8000/v1',
      api_key: 'k',
      api_format: 'openai_chat',
      models: ['my-model'],
    });
    const bundle = createProviderBundle({ llm: created.id }, { llm: 'my-model' });
    expect(bundle.llm.provider).toBe('deepseek');
    expect(bundle.llmModel).toBe('my-model');
  });

  it('keeps extra builtin model ids', () => {
    addExtraModel('deepseek', 'deepseek-v4-pro');
    expect(extraModelsFor('deepseek')).toEqual(['deepseek-v4-pro']);
  });

  it('updates custom endpoint without exposing the key', () => {
    const created = createCustomProvider({
      name: 'Zhipu',
      base_url: 'https://api.example.com/v1',
      api_key: 'old',
      api_format: 'openai_chat',
      models: ['glm-4'],
    });
    const updated = updateCustomProvider(created.id, {
      base_url: 'https://api.example.com/v2/',
      api_key: 'new-secret',
    });
    expect(updated?.base_url).toBe('https://api.example.com/v2');
    expect(updated).not.toHaveProperty('api_key');
    expect(getCustomProvider(created.id)?.api_key).toBe('new-secret');
  });
});
