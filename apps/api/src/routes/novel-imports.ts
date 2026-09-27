// M2 小说导入路由（设计 §7）——免登录前缀挂载（ADR-0013）。
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import type { NovelImportService } from '../contexts/novel-import/service.js';
import { decodeNovelBuffer } from '../contexts/novel-import/decode-text.js';

const idSchema = z.string().min(1).max(128);
const TXT_MAX_BYTES = 20 * 1024 * 1024;

async function readNovelUpload(request: FastifyRequest) {
  const file = await request.file({ limits: { fileSize: TXT_MAX_BYTES } });
  if (!file) throw new ApiError(400, 'FILE_REQUIRED', '请上传小说文本文件');
  const buffer = await file.toBuffer();
  const text = decodeNovelBuffer(buffer);
  if (text.trim().length < 200) {
    throw new ApiError(
      400,
      'NOVEL_TOO_SHORT',
      '文本过短（需 ≥200 字符）。请使用 UTF-8 或 GBK/ANSI 编码的 txt',
    );
  }
  return { file, text };
}

export function registerNovelImportRoutes(app: FastifyInstance, service: NovelImportService) {
  app.post('/novel-imports/preview', async (request) => {
    const { file, text } = await readNovelUpload(request);
    const preview = service.previewFromText({
      filename: file.filename || 'novel.txt',
      text,
    });
    return {
      suggested_name: preview.suggestedName,
      chapter_count: preview.chapterCount,
      characters: preview.characters,
      locations: preview.locations,
      events: preview.events,
      relationships: preview.relationships,
      worldview_highlights: preview.worldviewHighlights,
      skipped: preview.skipped,
      memory_estimate: preview.memoryEstimate,
    };
  });

  app.post('/novel-imports', async (request) => {
    const { file, text } = await readNovelUpload(request);
    const projectField = file.fields['project_id'];
    const projectId =
      projectField && 'value' in projectField ? String(projectField.value) : undefined;
    const parsed = idSchema.safeParse(projectId);
    if (!parsed.success) throw new ApiError(400, 'PROJECT_ID_REQUIRED', '缺少 project_id');
    const { importId, report } = await service.start({
      projectId: parsed.data,
      filename: file.filename || 'novel.txt',
      text,
    });
    return {
      import_id: importId,
      status: 'done',
      report: {
        characters: report.characters,
        locations: report.locations,
        events: report.events,
        relationships: report.relationships,
        worldview_highlights: report.worldviewHighlights,
        skipped: report.skipped,
      },
    };
  });

  app.get('/novel-imports', async (request) => {
    const query = z
      .object({ project_id: idSchema })
      .strict()
      .parse(request.query ?? {});
    const items = await service.list(query.project_id);
    return {
      items: items.map((item) => ({
        id: item.id,
        status: item.status,
        source_filename: item.sourceFilename,
        total_chapters: item.totalChapters,
        processed_chapters: item.processedChapters,
        created_at: item.createdAt.toISOString(),
        report: item.report,
      })),
    };
  });

  app.get('/novel-imports/:id', async (request) => {
    const { id } = z.object({ id: idSchema }).strict().parse(request.params);
    const record = await service.get(id);
    if (!record) throw new ApiError(404, 'IMPORT_NOT_FOUND', '导入记录不存在');
    return {
      id: record.id,
      project_id: record.projectId,
      status: record.status,
      source_filename: record.sourceFilename,
      total_chapters: record.totalChapters,
      processed_chapters: record.processedChapters,
      report: record.report,
      created_at: record.createdAt.toISOString(),
      chapters: record.chapters.map((chapter) => ({
        index: chapter.chapterIndex,
        title: chapter.title,
        status: chapter.status,
        attempts: chapter.attempts,
        last_error: chapter.lastError,
      })),
    };
  });

  app.post('/novel-imports/:id/retry', async (request) => {
    const { id } = z.object({ id: idSchema }).strict().parse(request.params);
    const { importId, report } = await service.retry(id);
    return {
      import_id: importId,
      status: 'done',
      report: {
        characters: report.characters,
        locations: report.locations,
        events: report.events,
        relationships: report.relationships,
        worldview_highlights: report.worldviewHighlights,
        skipped: report.skipped,
      },
    };
  });

  app.delete('/novel-imports/:id', async (request) => {
    const { id } = z.object({ id: idSchema }).strict().parse(request.params);
    const ok = await service.undo(id);
    if (!ok) throw new ApiError(404, 'IMPORT_NOT_FOUND', '导入记录不存在');
    return { ok: true };
  });

  app.post('/novel-imports/:id/upgrade', async (request) => {
    const { id } = z.object({ id: idSchema }).strict().parse(request.params);
    const body = z
      .object({ asset_id: idSchema })
      .strict()
      .parse(request.body ?? {});
    const result = await service.upgrade(id, body.asset_id);
    return {
      character: result.character,
      reused: result.reused,
    };
  });
}
