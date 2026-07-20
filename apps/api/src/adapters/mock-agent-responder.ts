import type { CompletionRequest } from '../ports/llm.js';

function parseUserPrompt(request: CompletionRequest): Record<string, unknown> {
  const parsed = JSON.parse(request.user_prompt) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Mock agent expected a JSON object user prompt');
  }
  return parsed as Record<string, unknown>;
}

export function mockAgentResponder(request: CompletionRequest): unknown {
  const input = parseUserPrompt(request);

  if (request.system_prompt.includes('STORY_AGENT')) {
    const brief = String(input.creative_brief ?? '未命名故事');
    const title = brief.replace(/[。！？.!?].*$/s, '').slice(0, 30) || '未命名故事';
    return {
      title,
      logline: brief,
      synopsis: `故事围绕“${brief}”展开，主角经历发现、抉择与改变。`,
      genre: 'cinematic_drama',
      theme: '希望与选择',
      tone: '电影感、克制、富有情绪',
      screenplay: [
        `第一幕：建立世界与核心冲突。${brief}`,
        '第二幕：主角采取行动，遭遇阻力并作出艰难选择。',
        '第三幕：冲突得到回应，结局留下清晰的情感余韵。',
      ].join('\n\n'),
    };
  }

  if (request.system_prompt.includes('SCENE_AGENT')) {
    const story =
      input.story && typeof input.story === 'object'
        ? (input.story as Record<string, unknown>)
        : {};
    const title = String(story.title ?? '未命名故事');
    return {
      scenes: [
        {
          order: 1,
          title: '建立',
          summary: `建立《${title}》的世界与主角目标。`,
          description: '以环境细节和主角的日常动作交代世界状态。',
          location_name: '故事主场景',
          time_of_day: '清晨',
          weather: null,
          mood: '克制',
          character_names: [],
        },
        {
          order: 2,
          title: '冲突',
          summary: '主角面对核心阻力并作出选择。',
          description: '通过动作与视觉变化推动矛盾升级。',
          location_name: '冲突发生地',
          time_of_day: '黄昏',
          weather: null,
          mood: '紧张',
          character_names: [],
        },
        {
          order: 3,
          title: '回应',
          summary: '选择带来结果，故事形成情感收束。',
          description: '用安静而明确的视觉意象结束故事。',
          location_name: '结局场景',
          time_of_day: '夜晚',
          weather: null,
          mood: '希望',
          character_names: [],
        },
      ],
    };
  }

  throw new Error('No mock response registered for this agent prompt');
}
