import type { CompletionRequest } from '../ports/llm.js';

function parseUserPrompt(request: CompletionRequest): Record<string, unknown> {
  const parsed = JSON.parse(request.user_prompt) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Mock agent expected a JSON object user prompt');
  }
  return parsed as Record<string, unknown>;
}

function asText(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function mockAgentResponder(request: CompletionRequest): unknown {
  const input = parseUserPrompt(request);

  if (request.system_prompt.includes('STORY_AGENT')) {
    const brief = asText(input.creative_brief, '未命名故事');
    const title = brief.replace(/[。！？.!?].*$/s, '').slice(0, 30) || '未命名故事';
    const rewriteOrder =
      typeof input.rewrite_segment_order === 'number' ? input.rewrite_segment_order : undefined;
    const feedback =
      typeof input.rewrite_feedback === 'string' ? input.rewrite_feedback : undefined;
    const existing = Array.isArray(input.existing_segments)
      ? (input.existing_segments as Array<Record<string, unknown>>)
      : undefined;

    const defaultSegments: Array<{ title: string; synopsis?: string; draft: string }> = [
      {
        title: '第一幕：建立',
        synopsis: '建立世界与核心冲突',
        draft: `第一幕：建立世界与核心冲突。${brief}`,
      },
      {
        title: '第二幕：对抗',
        synopsis: '主角采取行动并遭遇阻力',
        draft: '第二幕：主角采取行动，遭遇阻力并作出艰难选择。',
      },
      {
        title: '第三幕：回应',
        synopsis: '冲突得到回应',
        draft: '第三幕：冲突得到回应，结局留下清晰的情感余韵。',
      },
    ];

    let segments = defaultSegments;
    if (existing && existing.length > 0) {
      segments = existing.map((item, index) => {
        const synopsis = typeof item.synopsis === 'string' ? item.synopsis : undefined;
        return {
          title: asText(item.title, `第${index + 1}段`),
          draft: asText(item.draft, `段落 ${index + 1}`),
          ...(synopsis ? { synopsis } : {}),
        };
      });
    }
    if (rewriteOrder && rewriteOrder >= 1 && rewriteOrder <= segments.length) {
      const target = segments[rewriteOrder - 1];
      if (target) {
        target.draft = `${target.draft}\n\n【按反馈重写】${feedback ?? ''}`.trim();
        target.synopsis = `${target.synopsis ?? ''}（已按反馈修订）`.trim();
      }
    }

    return {
      title,
      logline: brief,
      synopsis: `故事围绕“${brief}”展开，主角经历发现、抉择与改变。`,
      genre: 'cinematic_drama',
      theme: '希望与选择',
      tone: '电影感、克制、富有情绪',
      screenplay: segments.map((segment) => segment.draft).join('\n\n'),
      segments,
    };
  }

  if (request.system_prompt.includes('SCENE_AGENT')) {
    const story =
      input.story && typeof input.story === 'object'
        ? (input.story as Record<string, unknown>)
        : {};
    const title = asText(story.title, '未命名故事');
    const segments = Array.isArray(input.segments)
      ? (input.segments as Array<Record<string, unknown>>)
      : [];
    if (segments.length > 0) {
      return {
        scenes: segments.flatMap((segment, index) => {
          const segmentOrder =
            typeof segment.order === 'number' && Number.isFinite(segment.order)
              ? segment.order
              : index + 1;
          const segmentTitle = asText(segment.title, `第${segmentOrder}段`);
          return [
            {
              order: index * 2 + 1,
              segment_order: segmentOrder,
              title: `${segmentTitle} · 开场`,
              summary: `展开「${segmentTitle}」的开场。`,
              description: asText(segment.draft, `段落 ${segmentOrder} 开场`),
              location_name: '故事主场景',
              time_of_day: '日',
              weather: null,
              mood: '推进',
              character_names: [],
            },
            {
              order: index * 2 + 2,
              segment_order: segmentOrder,
              title: `${segmentTitle} · 转折`,
              summary: `「${segmentTitle}」的关键转折。`,
              description: asText(segment.synopsis, `段落 ${segmentOrder} 转折`),
              location_name: '冲突发生地',
              time_of_day: '夜',
              weather: null,
              mood: '紧张',
              character_names: [],
            },
          ];
        }),
      };
    }
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
