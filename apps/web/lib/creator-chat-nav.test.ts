/// <reference types="vitest/globals" />
import {
  chatPathForThread,
  entityTitle,
  focusFromSelection,
  isChatFocusKind,
  mergeChatFocus,
  normalizeThread,
  parseFocusFromSearch,
} from './creator-chat-nav';
import type { WorldResourcesDTO } from './types';

function resources(): WorldResourcesDTO {
  return {
    project: { id: 'p1', name: '测试世界', worldview: { rules: [] } },
    stage: 'growing',
    entities: {
      stories: [{ id: 'st1', project_id: 'p1', title: '第一卷' }],
      characters: [{ id: 'c1', project_id: 'p1', name: '韩立', description: '主角' }],
      locations: [{ id: 'loc1', project_id: 'p1', name: '天南大陆', description: '修真界' }],
      scenes: [{ id: 'sc1', story_id: 'st1', order: 1, title: '山门' }],
      world_events: [
        {
          id: 'e1',
          project_id: 'p1',
          title: '入门',
          state: 'draft',
          created_at: '2026-01-01',
        },
      ],
      relationships: [
        {
          id: 'r1',
          project_id: 'p1',
          kind: 'mentor',
          source_type: 'character',
          source_id: 'c1',
          target_type: 'character',
          target_id: 'c1',
          label: '师徒',
          state: 'draft',
          created_at: '2026-01-01',
        },
      ],
      shots: [],
    },
  };
}

describe('normalizeThread', () => {
  it('accepts snake_case and camelCase payloads', () => {
    expect(normalizeThread({ id: 't1', projectId: 'p1', updatedAt: '2026-01-01T00:00:00.000Z' })).toMatchObject({
      id: 't1',
      project_id: 'p1',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    expect(
      normalizeThread({
        id: 't1',
        project_id: 'p1',
        updated_at: '2026-01-02T00:00:00.000Z',
        state: 'active',
      }),
    ).toMatchObject({ project_id: 'p1', updated_at: '2026-01-02T00:00:00.000Z' });
  });
});

describe('focusFromSelection', () => {
  it('maps world entities to chat focus and skips shots', () => {
    const world = resources();
    expect(focusFromSelection(world, { kind: 'character', id: 'c1' })).toEqual({
      kind: 'character',
      id: 'c1',
      name: '韩立',
    });
    expect(entityTitle(world, { kind: 'relationship', id: 'r1' })).toBe('师徒');
    expect(focusFromSelection(world, { kind: 'shot', id: 'sh1' })).toBeNull();
    expect(isChatFocusKind('character')).toBe(true);
    expect(isChatFocusKind('shot')).toBe(false);
  });
});

describe('chat focus routing', () => {
  it('builds a thread URL and merges pending name onto query params', () => {
    const focus = { kind: 'character' as const, id: 'c1', name: '韩立' };
    expect(chatPathForThread('t9', focus)).toBe('/creator-chats/t9?focus_kind=character&focus_id=c1');
    expect(parseFocusFromSearch(new URLSearchParams('focus_kind=character&focus_id=c1'))).toEqual({
      kind: 'character',
      id: 'c1',
    });
    expect(
      mergeChatFocus({ kind: 'character', id: 'c1' }, { ...focus, thread_id: 't9', project_id: 'p1' }, 't9')
        ?.name,
    ).toBe('韩立');
  });
});
