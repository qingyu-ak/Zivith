import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@zivith/database';
import { LOCATION_SHEET_KEY, LOCATION_SHEET_PROMPT_CLAUSE } from '@zivith/domain';
import { ApiError } from '../../errors.js';
import type { ImageGenerationAdapter } from '../../ports/media.js';
import {
  enrichVisualAssetTraits,
  mergeVisualPromptIntoAssetData,
  readVisualPromptFromAssetData,
} from '../agent/visual-trait.js';
import type { LLMAdapter } from '../../ports/llm.js';

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function readLocationSheetPrompt(data: unknown): string | undefined {
  return readVisualPromptFromAssetData(data, LOCATION_SHEET_KEY);
}

export async function draftLocationSheetPrompt(input: {
  db: PrismaClient;
  assetId: string;
  llm: LLMAdapter;
  llmModel: string;
  requestId?: string;
}): Promise<{ generation_prompt: string; appearance_summary: string; description: string }> {
  const asset = await input.db.asset.findFirst({
    where: { id: input.assetId, deletedAt: null, type: 'location' },
  });
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '地点资产不存在');

  const traits = await enrichVisualAssetTraits(
    input.llm,
    input.llmModel,
    input.requestId ?? randomUUID(),
    {
      asset_type: 'location',
      asset_name: asset.name,
      variant_key: LOCATION_SHEET_KEY,
      purpose: 'location_sheet',
      scene_title: asset.name,
      existing_description: asset.description,
    },
  );

  await input.db.asset.update({
    where: { id: asset.id },
    data: {
      data: json(
        mergeVisualPromptIntoAssetData(
          asset.data,
          LOCATION_SHEET_KEY,
          traits.generation_prompt,
          traits.appearance_summary,
        ),
      ),
    },
  });

  return {
    generation_prompt: traits.generation_prompt,
    appearance_summary: traits.appearance_summary,
    description: traits.description,
  };
}

export async function generateLocationSheetImage(input: {
  db: PrismaClient;
  assetId: string;
  image: ImageGenerationAdapter;
  imageModel: string;
  prompt?: string;
  requestId?: string;
  count?: number;
}): Promise<{
  media: { id: string; url: string };
  medias: Array<{ id: string; url: string }>;
  generation_prompt: string;
}> {
  const asset = await input.db.asset.findFirst({
    where: { id: input.assetId, deletedAt: null, type: 'location' },
  });
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '地点资产不存在');

  const prompt = (
    input.prompt?.trim() ||
    readLocationSheetPrompt(asset.data) ||
    [asset.name, LOCATION_SHEET_PROMPT_CLAUSE, asset.description]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join(', ')
  ).trim();
  if (!prompt) throw new ApiError(400, 'PROMPT_REQUIRED', '请提供地点设定表提示词');

  const count = Math.min(4, Math.max(1, Math.trunc(input.count ?? 1)));
  const baseRequestId = input.requestId ?? randomUUID();
  const medias: Array<{ id: string; url: string }> = [];

  for (let index = 0; index < count; index += 1) {
    const generated = await input.image.generate({
      request_id: count === 1 ? baseRequestId : `${baseRequestId}:${index + 1}`,
      model: input.imageModel,
      prompt,
      count,
    });
    if (!generated.image_url) {
      throw new ApiError(502, 'IMAGE_GENERATION_FAILED', '地点设定表生图未返回图片');
    }
    const mediaId = randomUUID();
    const media = await input.db.media.create({
      data: {
        id: mediaId,
        projectId: asset.projectId,
        name:
          count > 1
            ? `${asset.name} · 地点设定表 ${index + 1}/${count}`
            : `${asset.name} · 地点设定表`,
        mediaType: 'image',
        mimeType: 'image/png',
        storageKey: `location-sheets/${mediaId}.png`,
        url: generated.image_url,
        source: 'generated',
        generationMetadata: json({
          is_mock: Boolean(generated.metadata.is_mock),
          provider: input.image.provider,
          model: input.imageModel,
          generation_prompt: prompt,
          location_sheet: true,
          candidate_index: index + 1,
          candidate_count: count,
        }),
        tags: ['generated', 'location_sheet', 'location'],
      },
    });
    medias.push({ id: media.id, url: media.url });
  }

  const primaryId = medias[0]?.id;
  if (!primaryId) throw new ApiError(502, 'IMAGE_GENERATION_FAILED', '地点设定表生图失败');

  await input.db.asset.update({
    where: { id: asset.id },
    data: {
      state: 'active',
      referenceImages: [
        primaryId,
        ...asset.referenceImages.filter((id) => id !== primaryId),
        ...medias.slice(1).map((item) => item.id).filter((id) => !asset.referenceImages.includes(id)),
      ],
      data: json(mergeVisualPromptIntoAssetData(asset.data, LOCATION_SHEET_KEY, prompt)),
    },
  });

  return {
    media: medias[0]!,
    medias,
    generation_prompt: prompt,
  };
}
