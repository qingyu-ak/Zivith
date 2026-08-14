/**
 * Black-box HTTP checks for Inspector entity PATCH + production shot resources.
 *
 * Run from repo root:
 *   node ".\node_modules\tsx\dist\cli.mjs" ".\apps\api\scripts\verify-inspector-shot-bb.ts"
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

process.env.LLM_PROVIDER = 'mock';

const envPath = resolve(import.meta.dirname, '../../../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (key && rawValue !== undefined && process.env[key] === undefined) {
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  }
}

type Json = Record<string, unknown>;

interface HttpResponse {
  status: number;
  json: Json | null;
}

const results: Array<{ label: string; ok: boolean; detail?: string }> = [];

function check(label: string, ok: boolean, detail?: string): void {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
}

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function asList(value: unknown): Json[] {
  return Array.isArray(value)
    ? value.filter((item): item is Json => Boolean(item) && typeof item === 'object')
    : [];
}

async function request(
  base: string,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<HttpResponse> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: Json | null = null;
  try {
    json = text ? (JSON.parse(text) as Json) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

async function main(): Promise<number> {
  const [{ buildApp }] = await Promise.all([import('../src/app.ts')]);
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    console.error('JWT_SECRET missing or too short');
    return 1;
  }

  const app = await buildApp({ logger: false, jwtSecret });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}/api/v1`;
  const stamp = Date.now();
  let projectId = '';

  try {
    const login = await request(base, 'POST', '/auth/login', {
      email: 'demo@zivith.local',
      password: 'ZivithDemo2026!',
    });
    const token = String(asRecord(login.json).access_token ?? '');
    check('login demo user', login.status === 200 && token.length > 10, `status=${login.status}`);
    if (!token) return 1;

    const created = await request(
      base,
      'POST',
      '/projects',
      { name: `BB Inspector ${stamp}`, description: 'black-box' },
      token,
    );
    projectId = String(asRecord(created.json).id ?? '');
    check(
      'create project',
      created.status === 201 && Boolean(projectId),
      `status=${created.status}`,
    );
    if (!projectId) return 1;

    const character = await request(
      base,
      'POST',
      `/projects/${projectId}/assets`,
      {
        type: 'character',
        name: '韩立',
        description: '凡人修士',
        appearance: { gender: '男', hair: '黑发' },
        personality: '谨慎',
        default_outfit: '青衫',
      },
      token,
    );
    const characterId = String(asRecord(character.json).id ?? '');
    check(
      'create character',
      character.status === 201 && Boolean(characterId),
      `status=${character.status}`,
    );

    const location = await request(
      base,
      'POST',
      `/projects/${projectId}/assets`,
      {
        asset_type: 'location',
        name: '天南大陆',
        description: '修仙世界',
        time_period: '上古',
        mood_default: '苍茫',
      },
      token,
    );
    const locationId = String(asRecord(location.json).id ?? '');
    check(
      'create location',
      location.status === 201 && Boolean(locationId),
      `status=${location.status} body=${JSON.stringify(location.json)?.slice(0, 220)}`,
    );

    const story = await request(
      base,
      'POST',
      `/projects/${projectId}/stories`,
      { title: '第一卷', logline: '凡人踏入修仙', genre: '玄幻', theme: '逆天' },
      token,
    );
    const storyId = String(asRecord(story.json).id ?? '');
    check('create story', story.status === 201 && Boolean(storyId), `status=${story.status}`);

    const scene = await request(
      base,
      'POST',
      `/stories/${storyId}/scenes`,
      { title: '乱星海', summary: '出海求生', time_of_day: '黄昏', weather: '阴', mood: '压抑' },
      token,
    );
    const sceneId = String(asRecord(scene.json).id ?? '');
    check('create scene', scene.status === 201 && Boolean(sceneId), `status=${scene.status}`);

    const event = await request(base, 'POST', `/world/projects/${projectId}/world-events`, {
      title: '灵气复苏',
      description: '天地灵气回流',
    });
    const eventId = String(asRecord(event.json).id ?? '');
    check('create world event', event.status === 201 && Boolean(eventId), `status=${event.status}`);

    const relationship = await request(base, 'POST', `/world/projects/${projectId}/relationships`, {
      kind: 'mentor',
      label: '师徒',
      description: '旧关系',
      source: { type: 'asset', id: characterId },
      target: { type: 'asset', id: locationId },
      direction: 'directed',
    });
    const relationshipId = String(asRecord(relationship.json).id ?? '');
    check(
      'create relationship',
      relationship.status === 201 && Boolean(relationshipId),
      `status=${relationship.status} body=${JSON.stringify(relationship.json)?.slice(0, 180)}`,
    );

    const shot = await request(
      base,
      'POST',
      `/scenes/${sceneId}/shots`,
      { label: '远景开场', mood: '苍茫', order: 1 },
      token,
    );
    const shotId = String(asRecord(shot.json).id ?? '');
    check('create shot', shot.status === 201 && Boolean(shotId), `status=${shot.status}`);

    const resources1 = await request(base, 'GET', `/world/projects/${projectId}/resources`);
    const entities1 = asRecord(asRecord(resources1.json).entities);
    const characters1 = asList(entities1.characters);
    const scenes1 = asList(entities1.scenes);
    const shots1 = asList(entities1.shots);
    const foundCharacter = characters1.find((item) => item.id === characterId) ?? {};
    const foundScene = scenes1.find((item) => item.id === sceneId) ?? {};
    check('resources 200', resources1.status === 200, `status=${resources1.status}`);
    check(
      'resources flattens personality',
      foundCharacter.personality === '谨慎',
      String(foundCharacter.personality),
    );
    check(
      'resources flattens default_outfit',
      foundCharacter.default_outfit === '青衫',
      String(foundCharacter.default_outfit),
    );
    check(
      'resources keeps appearance.hair',
      asRecord(foundCharacter.appearance).hair === '黑发',
      String(asRecord(foundCharacter.appearance).hair),
    );
    check(
      'resources aliases scene.summary',
      foundScene.summary === '出海求生',
      String(foundScene.summary),
    );
    check(
      'resources aliases scene.time_of_day',
      foundScene.time_of_day === '黄昏',
      String(foundScene.time_of_day),
    );
    check(
      'resources includes shots',
      shots1.some((item) => item.id === shotId),
      `count=${shots1.length}`,
    );

    const patchCharacter = await request(
      base,
      'PATCH',
      `/assets/${characterId}`,
      {
        name: '韩立·改',
        description: '谨慎的凡人修士',
        aliases: ['老魔'],
        tags: ['主角'],
        appearance: { gender: '男', hair: '黑发', age_range: '青年', build: '清瘦' },
        personality: '愈发谨慎',
        default_outfit: '青衫布鞋',
      },
      token,
    );
    check('PATCH character 200', patchCharacter.status === 200, `status=${patchCharacter.status}`);

    const patchLocation = await request(
      base,
      'PATCH',
      `/assets/${locationId}`,
      {
        name: '天南',
        description: '修仙大陆',
        time_period: '乱世',
        weather_default: '多雾',
        lighting_default: '阴天',
        mood_default: '辽阔',
      },
      token,
    );
    check('PATCH location 200', patchLocation.status === 200, `status=${patchLocation.status}`);

    const patchEvent = await request(base, 'PATCH', `/world/world-events/${eventId}`, {
      title: '灵气潮汐',
      description: '灵气周期性涨落',
    });
    check('PATCH world event 200', patchEvent.status === 200, `status=${patchEvent.status}`);

    const patchRel = await request(base, 'PATCH', `/world/relationships/${relationshipId}`, {
      label: '羁绊',
      description: '更新后的关系',
    });
    check('PATCH relationship 200', patchRel.status === 200, `status=${patchRel.status}`);

    const patchScene = await request(
      base,
      'PATCH',
      `/scenes/${sceneId}`,
      { title: '乱星海·夜', summary: '夜航', time_of_day: '深夜', weather: '雨', mood: '紧张' },
      token,
    );
    check('PATCH scene 200', patchScene.status === 200, `status=${patchScene.status}`);

    const patchStory = await request(
      base,
      'PATCH',
      `/stories/${storyId}`,
      {
        title: '第一卷·改',
        logline: '新梗概',
        genre: '东方玄幻',
        theme: '长生',
        synopsis: '完整梗概',
      },
      token,
    );
    check('PATCH story 200', patchStory.status === 200, `status=${patchStory.status}`);

    const resources2 = await request(base, 'GET', `/world/projects/${projectId}/resources`);
    const entities2 = asRecord(asRecord(resources2.json).entities);
    const character2 = asList(entities2.characters).find((item) => item.id === characterId) ?? {};
    const location2 = asList(entities2.locations).find((item) => item.id === locationId) ?? {};
    const event2 = asList(entities2.world_events).find((item) => item.id === eventId) ?? {};
    const rel2 = asList(entities2.relationships).find((item) => item.id === relationshipId) ?? {};
    const scene2 = asList(entities2.scenes).find((item) => item.id === sceneId) ?? {};
    const story2 = asList(entities2.stories).find((item) => item.id === storyId) ?? {};
    const shot2 = asList(entities2.shots).find((item) => item.id === shotId) ?? {};
    const appearance2 = asRecord(character2.appearance);

    check('persist character name', character2.name === '韩立·改', String(character2.name));
    check(
      'persist personality',
      character2.personality === '愈发谨慎',
      String(character2.personality),
    );
    check(
      'persist appearance.hair after merge',
      appearance2.hair === '黑发',
      String(appearance2.hair),
    );
    check(
      'persist appearance.age_range',
      appearance2.age_range === '青年',
      String(appearance2.age_range),
    );
    check(
      'persist location mood',
      location2.mood_default === '辽阔',
      String(location2.mood_default),
    );
    check('persist event title', event2.title === '灵气潮汐', String(event2.title));
    check('persist relationship label', rel2.label === '羁绊', String(rel2.label));
    check('persist scene summary', scene2.summary === '夜航', String(scene2.summary));
    check('persist story title', story2.title === '第一卷·改', String(story2.title));
    check('persist shot label', shot2.label === '远景开场', String(shot2.label));
    check('shot belongs to scene', shot2.scene_id === sceneId, String(shot2.scene_id));
  } finally {
    if (projectId) {
      const [{ prisma }] = await Promise.all([import('@zivith/database')]);
      await prisma.project
        .update({ where: { id: projectId }, data: { deletedAt: new Date() } })
        .catch(() => undefined);
      await prisma.$disconnect().catch(() => undefined);
    }
    await app.close();
  }

  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  return failed.length === 0 ? 0 : 1;
}

process.exit(await main());
