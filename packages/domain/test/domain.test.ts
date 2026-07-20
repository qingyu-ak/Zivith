import { describe, expect, it } from 'vitest';
import {
  asId,
  mergeInherited,
  resolveCharacter,
  resolveShotContext,
  SHOT_TRANSITIONS,
  transitionShot,
  unfreezeShot,
  type Character,
  type Project,
  type ProjectId,
  type Scene,
  type Shot,
  type Story,
} from '../src/index.js';

const shot = (state: Shot['state']): Shot => ({
  id: asId('shot_1'),
  scene_id: asId('scene_1'),
  project_id: asId('project_1'),
  order: 1,
  state,
  characters: [],
  prompt: { source: 'auto' },
  outputs: [],
  created_at: new Date(),
  updated_at: new Date(),
});

describe('shot state machine', () => {
  it('accepts every declared transition', () => {
    for (const [from, targets] of Object.entries(SHOT_TRANSITIONS)) {
      for (const target of targets) {
        const snapshot = target === 'approved' ? { style: { aspect_ratio: '16:9' } } : undefined;
        expect(transitionShot(shot(from as Shot['state']), target, snapshot).state).toBe(target);
      }
    }
  });

  it('rejects approved to draft except through unfreeze', () => {
    expect(() => transitionShot(shot('approved'), 'draft')).toThrow();
    expect(unfreezeShot(shot('approved')).state).toBe('draft');
  });
});

describe('inheritance', () => {
  it('deep merges four levels and treats null as inherit', () => {
    expect(
      mergeInherited(
        { style: { aspect_ratio: '16:9', fps: 24 } },
        { style: { fps: 30 } },
        { style: { aspect_ratio: null } },
        { style: { rendering: 'anime' } },
      ),
    ).toEqual({ style: { aspect_ratio: '16:9', fps: 30, rendering: 'anime' } });
  });

  it('resolves Project → Story → Scene → Shot with local precedence', () => {
    const now = new Date();
    const project: Project = {
      id: asId('project_1'),
      owner_id: asId('user_1'),
      name: 'Project',
      defaults: { style: { aspect_ratio: '16:9', fps: 24 }, mood: 'project' },
      created_at: now,
      updated_at: now,
    };
    const story: Story = {
      id: asId('story_1'),
      project_id: project.id,
      title: 'Story',
      state: 'draft',
      overrides: { style: { fps: 30 } },
      order: 1,
      created_at: now,
      updated_at: now,
    };
    const scene: Scene = {
      id: asId('scene_1'),
      story_id: story.id,
      project_id: project.id,
      title: 'Scene',
      order: 1,
      state: 'draft',
      character_ids: [],
      overrides: { mood: 'scene' },
      created_at: now,
      updated_at: now,
    };
    const resolved = resolveShotContext(project, story, scene, {
      ...shot('draft'),
      style: { rendering: 'anime' },
    });
    expect(resolved.style).toEqual({ aspect_ratio: '16:9', fps: 30, rendering: 'anime' });
    expect(resolved.mood).toBe('scene');
  });

  it('uses an immutable snapshot for approved Shots', () => {
    const now = new Date();
    const project: Project = {
      id: asId('project_1'),
      owner_id: asId('user_1'),
      name: 'Changed project',
      defaults: { style: { aspect_ratio: '9:16' }, mood: 'changed' },
      created_at: now,
      updated_at: now,
    };
    const story: Story = {
      id: asId('story_1'),
      project_id: project.id,
      title: 'Story',
      state: 'draft',
      order: 1,
      created_at: now,
      updated_at: now,
    };
    const scene: Scene = {
      id: asId('scene_1'),
      story_id: story.id,
      project_id: project.id,
      title: 'Scene',
      order: 1,
      state: 'draft',
      character_ids: [],
      created_at: now,
      updated_at: now,
    };
    const resolved = resolveShotContext(project, story, scene, {
      ...shot('approved'),
      approved_snapshot: {
        context: { style: { aspect_ratio: '16:9' }, mood: 'frozen', characters: [] },
      },
    });
    expect(resolved.style?.aspect_ratio).toBe('16:9');
    expect(resolved.mood).toBe('frozen');

    const unfrozen = unfreezeShot({
      ...shot('approved'),
      approved_snapshot: {
        context: { style: { aspect_ratio: '16:9' }, mood: 'frozen', characters: [] },
      },
    });
    const inherited = resolveShotContext(project, story, scene, unfrozen);
    expect(inherited.style?.aspect_ratio).toBe('9:16');
    expect(inherited.mood).toBe('changed');
  });
});

describe('character resolution', () => {
  it('merges base appearance and local fields', () => {
    const projectId = asId<ProjectId>('project_1');
    const base: Character = {
      id: asId('char_base'),
      project_id: projectId,
      name: 'Base',
      aliases: [],
      description: 'Base',
      state: 'active',
      appearance: { hair: 'black', eyes: 'blue' },
      default_outfit: 'uniform',
      reference_images: [],
      tags: [],
    };
    const child: Character = {
      ...base,
      id: asId('char_child'),
      name: 'Child',
      base_character_id: base.id,
      appearance: { hair: 'white' },
    };
    const resolved = resolveCharacter(child, (id) => (id === base.id ? base : undefined));
    expect(resolved.appearance).toEqual({ hair: 'white', eyes: 'blue' });
    expect(resolved.default_outfit).toBe('uniform');
  });
});
