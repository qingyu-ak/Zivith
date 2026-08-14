import type { WorldContext } from './world-context.js';

/**
 * Proactive World Builder guidance (Track J follow-up).
 *
 * Asks the next missing world/story beat. Never invents entities and never
 * writes — questions only, plus existing confirmable proposals.
 */

export const WORLD_GAP_TOPICS = [
  'worldview',
  'protagonist',
  'character_depth',
  'story',
  'relationship',
  'location',
  'event',
  'pacing',
] as const;

export type WorldGapTopic = (typeof WORLD_GAP_TOPICS)[number];

export interface WorldGap {
  id: string;
  topic: WorldGapTopic;
  label: string;
  question: string;
  priority: number;
}

const QUESTION_LIMIT = 3;

export function wantsGuidanceTurn(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length > 40) return false;
  return /^(好的?|嗯+|哦+|继续|然后呢|下一步|接下来|再说说?|你来问|引导一下|呢)([。！!？?\s]*)$/.test(
    trimmed,
  );
}

export function detectWorldGaps(world: WorldContext | null): WorldGap[] {
  if (!world) {
    return [
      gap('worldview', '世界观题材', '这个世界是什么题材？（科幻 / 奇幻 / 现实 / 悬疑…）', 1),
      gap('protagonist', '核心主角', '故事的主角是什么样的人？', 2),
      gap('story', '核心主题', '你想传达的核心主题是什么？', 3),
    ];
  }

  const findings: WorldGap[] = [];
  const worldview = world.worldview;
  if (!worldview.genre?.trim() && !worldview.premise?.trim()) {
    findings.push(
      gap('worldview', '世界观题材', '这个世界的题材和核心设定是什么？（例如东方玄幻、凡人修仙）', 10),
    );
  } else if (worldview.rules.length === 0) {
    findings.push(
      gap('worldview', '世界规则', '这个世界有没有一条必须遵守的规则，或使用力量要付的代价？', 15),
    );
  }

  if (world.characters.length === 0) {
    findings.push(
      gap('protagonist', '主角是谁', '故事的主角是谁？叫什么名字，TA 现在最想要什么？', 20),
    );
  } else {
    const thin = world.characters.find(
      (character) => !character.description || character.description.trim().length < 8,
    );
    if (thin) {
      findings.push(
        gap(
          'character_depth',
          '角色欲望',
          `角色「${thin.name}」的档案还很薄。TA 的性格核心，以及现在最想得到（或最怕失去）的是什么？`,
          25,
        ),
      );
    }
  }

  const story = world.stories[0];
  if (!story) {
    findings.push(
      gap('story', '故事梗概', '用一句话概括主线：谁、要做什么、最大的障碍是什么？', 32),
    );
  } else if (!story.logline?.trim()) {
    findings.push(
      gap('story', '故事梗概', `故事「${story.title}」还没有梗概。一句话主线是什么？`, 33),
    );
  }

  if (world.characters.length >= 2 && world.relationships.length === 0) {
    const [first, second] = world.characters;
    findings.push(
      gap(
        'relationship',
        '角色关系',
        `「${first?.name}」和「${second?.name}」是什么关系？（伙伴 / 对手 / 家人 / 师徒…）`,
        35,
      ),
    );
  }

  if (world.locations.length === 0 && world.characters.length > 0) {
    findings.push(
      gap('location', '核心地点', '故事主要发生在哪里？给这个核心地点起个名字，并说清它在世界里的地位。', 40),
    );
  }

  if (world.worldEvents.length === 0 && world.characters.length > 0) {
    findings.push(
      gap('event', '关键事件', '这个世界已经发生过哪件改变格局的事？它把主角推到了什么位置？', 50),
    );
  }

  if (story?.logline?.trim()) {
    const names = world.characters.slice(0, 2).map((character) => `「${character.name}」`).join('和');
    findings.push(
      gap(
        'pacing',
        '剧情节奏',
        names
          ? `按现在的设定，${names} 的故事起势、中段转折和收束各是什么？节奏你更想偏快还是留白？`
          : '按现在的设定，故事的起势、中段转折和收束各是什么？节奏偏快还是偏慢？',
        60,
      ),
    );
  }

  return findings.sort((left, right) => left.priority - right.priority);
}

export function nextGuidanceGaps(world: WorldContext | null, limit = QUESTION_LIMIT): WorldGap[] {
  return detectWorldGaps(world).slice(0, limit);
}

export function skipGapsCoveredByProposals(gaps: WorldGap[], proposalKinds: string[]): WorldGap[] {
  const kinds = new Set(proposalKinds);
  return gaps.filter((item) => {
    if (item.topic === 'protagonist' && kinds.has('create_character')) return false;
    if (item.topic === 'character_depth' && kinds.has('create_character')) return false;
    if (item.topic === 'location' && kinds.has('create_location')) return false;
    if (item.topic === 'event' && kinds.has('create_world_event')) return false;
    if (item.topic === 'relationship' && kinds.has('create_relationship')) return false;
    if (item.topic === 'worldview' && kinds.has('update_entity')) return false;
    return true;
  });
}

export function mergeOpenQuestions(existing: string[], gaps: WorldGap[], limit = 12): string[] {
  const merged: string[] = [];
  for (const item of [...gaps.map((gap) => gap.label), ...existing]) {
    const trimmed = item.trim();
    if (!trimmed || merged.includes(trimmed)) continue;
    merged.push(trimmed);
    if (merged.length >= limit) break;
  }
  return merged;
}

export function formatGuidanceReply(gaps: WorldGap[]): string {
  if (gaps.length === 0) {
    return '世界骨架已经比较完整。你可以直接补充细节，或让我检查设定冲突；需要改档案时我会先给出提案，不会自动写入。';
  }
  const lines = gaps.map((item, index) => `${index + 1}. ${item.question}`);
  return `我想把世界再往前推一步，先问最缺的这${gaps.length}件事（你可以直接回答；确认过的设定才会写成提案）：\n\n${lines.join('\n')}`;
}

export function formatGuidanceFollowUp(gap: WorldGap): string {
  return `\n\n确认写入后，下一步我想问：${gap.question}`;
}

function gap(topic: WorldGapTopic, label: string, question: string, priority: number): WorldGap {
  return { id: `${topic}:${label}`, topic, label, question, priority };
}
