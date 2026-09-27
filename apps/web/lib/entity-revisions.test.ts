/// <reference types="vitest/globals" />
import { boundEventTitle, stageCaption, stageExcerpt } from './entity-revisions';
import type { EntityRevisionDTO, WorldEventDTO } from './types';

describe('entity revision stage view', () => {
  const revision = (partial: Partial<EntityRevisionDTO>): EntityRevisionDTO => ({
    id: 'r1',
    revision: 1,
    change_kind: 'create',
    created_at: '2026-09-15T00:00:00.000Z',
    stage_label: null,
    as_of_world_event_id: null,
    as_of_presentation_order: null,
    snapshot: {},
    ...partial,
  });

  it('uses stage_label, then 最初, then 第 N 阶段', () => {
    expect(stageCaption(revision({ stage_label: '觉醒' }))).toBe('觉醒');
    expect(stageCaption(revision({ revision: 1, stage_label: null }))).toBe('最初');
    expect(stageCaption(revision({ revision: 3, stage_label: '  ' }))).toBe('第 3 阶段');
  });

  it('prefers personality excerpt over description', () => {
    expect(
      stageExcerpt(
        revision({
          snapshot: { description: '简介', data: { personality: '嘴碎' } },
        }),
      ),
    ).toBe('嘴碎');
    expect(stageExcerpt(revision({ snapshot: { description: ' 学生 ' } }))).toBe('学生');
  });

  it('resolves bound event title from the world line', () => {
    const events: WorldEventDTO[] = [
      {
        id: 'e1',
        project_id: 'p',
        title: '觉醒夜',
        state: 'draft',
        created_at: '2026-09-15T00:00:00.000Z',
      },
    ];
    expect(boundEventTitle(revision({ as_of_world_event_id: 'e1' }), events)).toBe('觉醒夜');
    expect(boundEventTitle(revision({ as_of_world_event_id: null }), events)).toBeNull();
  });
});
