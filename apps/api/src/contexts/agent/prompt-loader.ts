import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type PromptLocale = 'zh' | 'en';

export type AgentPromptId = 'story' | 'scene' | 'visual_trait';

const PROMPT_SPECS: Record<AgentPromptId, { required: readonly string[] }> = {
  story: { required: ['knowledge_context'] },
  scene: { required: ['knowledge_context'] },
  visual_trait: { required: ['knowledge_context'] },
};

const PLACEHOLDER_RE = /\{([a-z][a-z0-9_]*)\}/g;

const cache = new Map<string, string>();

function candidatesForPromptsRoot(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    process.env.ZIVITH_PROMPTS_ROOT,
    join(process.cwd(), 'prompts'),
    join(here, '../../../prompts'),
    join(here, '../../../../prompts'),
  ].filter((value): value is string => Boolean(value));
}

export function resolvePromptsRoot(): string {
  for (const candidate of candidatesForPromptsRoot()) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Agent prompts directory not found. Tried: ${candidatesForPromptsRoot().join(', ')}`,
  );
}

export function listPlaceholders(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const name = match[1];
    if (name) found.add(name);
  }
  return [...found].sort();
}

export function fillPromptTemplate(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  return template.replace(PLACEHOLDER_RE, (_full, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return vars[name] ?? '';
    }
    if (name === 'knowledge_context') return '';
    throw new Error(`Missing prompt placeholder value: {${name}}`);
  });
}

function cacheKey(agent: AgentPromptId, locale: PromptLocale): string {
  return `${agent}:${locale}`;
}

export function readAgentSystemPromptTemplate(
  agent: AgentPromptId,
  locale: PromptLocale,
  root = resolvePromptsRoot(),
): string {
  const key = cacheKey(agent, locale);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const path = join(root, agent, `system.${locale}.md`);
  if (!existsSync(path)) {
    throw new Error(`Missing agent prompt template: ${path}`);
  }
  const template = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  cache.set(key, template);
  return template;
}

export function loadAgentSystemPrompt(
  agent: AgentPromptId,
  locale: PromptLocale = 'en',
  vars: Record<string, string | undefined> = {},
): string {
  const template = readAgentSystemPromptTemplate(agent, locale);
  return fillPromptTemplate(template, {
    knowledge_context: vars.knowledge_context ?? '',
    ...vars,
  }).trimEnd();
}

/** Prefer Chinese system prompts for zh* locales; otherwise English (behavior-compatible default). */
export function localeFromLanguage(language?: string | null): PromptLocale {
  const value = (language ?? '').toLowerCase();
  return value.startsWith('zh') ? 'zh' : 'en';
}

export function clearPromptCache(): void {
  cache.clear();
}

/**
 * Boot / test lint: every registered agent has zh+en templates,
 * required placeholders present, no unknown placeholders.
 */
export function assertAllPromptTemplatesValid(root = resolvePromptsRoot()): void {
  const agents = Object.keys(PROMPT_SPECS) as AgentPromptId[];
  for (const agent of agents) {
    const required = new Set(PROMPT_SPECS[agent].required);
    for (const locale of ['en', 'zh'] as const) {
      const template = readAgentSystemPromptTemplate(agent, locale, root);
      const found = listPlaceholders(template);
      for (const name of required) {
        if (!found.includes(name)) {
          throw new Error(
            `Prompt ${agent}/system.${locale}.md missing required placeholder {${name}}`,
          );
        }
      }
      for (const name of found) {
        if (!required.has(name)) {
          throw new Error(
            `Prompt ${agent}/system.${locale}.md has unknown placeholder {${name}}`,
          );
        }
      }
      // Ensure mock dispatch markers survive externalization.
      const marker =
        agent === 'story'
          ? 'STORY_AGENT'
          : agent === 'scene'
            ? 'SCENE_AGENT'
            : 'VISUAL_TRAIT_AGENT';
      if (!template.includes(marker)) {
        throw new Error(`Prompt ${agent}/system.${locale}.md must include marker ${marker}`);
      }
      const rendered = fillPromptTemplate(template, { knowledge_context: '' });
      if (listPlaceholders(rendered).length > 0) {
        throw new Error(`Prompt ${agent}/system.${locale}.md still has placeholders after fill`);
      }
    }
  }

  // Guard against orphan prompt dirs missing from the registry.
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!(entry.name in PROMPT_SPECS)) {
      throw new Error(
        `Unregistered prompts directory "${entry.name}" under ${root}; add it to PROMPT_SPECS or remove it`,
      );
    }
  }
}
