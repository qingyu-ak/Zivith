import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@zivith/database';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ensureProjectMember } from '../contexts/world/local-user.js';
import { createProviderBundle } from '../providers/registry.js';
import { instrumentProviderBundle } from '../contexts/usage/instrument.js';
import { withUsageContext } from '../contexts/usage/context.js';
import type { StoragePort } from '../ports/index.js';
import { authenticate } from './auth.js';
import { getRuntimeModelOverride, getRuntimeProviderOverride } from './providers.js';

const shotParams = z.object({ id: z.string().uuid() });
const bodySchema = z
  .object({
    text: z.string().trim().min(1).max(5_000).optional(),
    voice: z.string().trim().min(1).max(100).optional(),
    model: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export function registerAudioRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  storage?: StoragePort,
): void {
  app.addHook('preHandler', authenticate);

  app.post('/shots/:id/generate-audio', async (request, reply) => {
    const { id } = shotParams.parse(request.params);
    const body = bodySchema.parse(request.body ?? {});
    const shot = await db.shot.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, projectId: true, dialogue: true, label: true },
    });
    if (!shot) throw new ApiError(404, 'SHOT_NOT_FOUND', '镜头不存在');
    await ensureProjectMember(db, request.user.sub, shot.projectId, true);

    const dialogue =
      shot.dialogue && typeof shot.dialogue === 'object' && !Array.isArray(shot.dialogue)
        ? (shot.dialogue as Record<string, unknown>)
        : {};
    const fromDialogue = typeof dialogue.text === 'string' ? dialogue.text.trim() : '';
    const text = (body.text?.trim() || fromDialogue || shot.label || '').trim();
    if (!text) {
      throw new ApiError(422, 'AUDIO_TEXT_REQUIRED', '请提供对白文本或填写镜头对白');
    }

    const providers = instrumentProviderBundle(
      db,
      createProviderBundle(getRuntimeProviderOverride(), getRuntimeModelOverride()),
    );
    const result = await withUsageContext(
      { projectId: shot.projectId, taskType: 'audio_tts' },
      () =>
        providers.audio.synthesize({
          request_id: randomUUID(),
          model: body.model ?? providers.audioModel,
          input: text,
          ...(body.voice ? { voice: body.voice } : {}),
        }),
    );

    let url = result.audio_url ?? '';
    let storageKey = `audio/${shot.projectId}/${shot.id}/${randomUUID()}.mp3`;
    if (result.audio_bytes && storage) {
      const put = await storage.put({
        key: storageKey,
        body: result.audio_bytes,
        content_type: result.mime_type || 'audio/mpeg',
      });
      url = put.url;
      storageKey = put.key;
    } else if (!url && result.audio_bytes) {
      url = `data:${result.mime_type};base64,${result.audio_bytes.toString('base64')}`;
    }

    if (!url) {
      throw new ApiError(502, 'AUDIO_EMPTY', '音频提供商未返回可用结果');
    }

    const media = await db.media.create({
      data: {
        id: randomUUID(),
        projectId: shot.projectId,
        name: `${shot.label ?? '镜头'} 对白音频`,
        mediaType: 'audio',
        mimeType: result.mime_type || 'audio/mpeg',
        storageKey,
        url,
        source: 'generated',
        generationMetadata: {
          provider: providers.selection.audio,
          model: body.model ?? providers.audioModel,
          shot_id: shot.id,
          ...result.metadata,
        },
        tags: ['dialogue', 'tts'],
      },
    });

    return reply.status(201).send({
      media,
      provider: providers.selection.audio,
      model: body.model ?? providers.audioModel,
    });
  });
}
