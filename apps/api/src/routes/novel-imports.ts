// M2 小说导入路由（设计 §7）——免登录前缀挂载（ADR-0013）。
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import type { NovelImportService } from '../contexts/novel-import/service.js';
import { decodeNovelBuffer } from '../contexts/novel-import/decode-text.js';

const idSchema = z.string().min(1).max(128);

export function registerNovelImportRoutes(app: FastifyInstance, service: NovelImportService) {
  app.post('/novel-imports', async (request) => {
    const file = await request.file({ limits: { fileSize: 20 * 1024 * 1024 } });
    if (!file) throw new ApiError(400, 'FILE_REQUIRED', '请上传小说文本文件');
    const projectField = file.fields['project_id'];
    const projectId = projectField && 'value' in projectField ? String(projectField.value) : undefined;
    const parsed = idSchema.safeParse(projectId);
    if (!parsed.success) throw new ApiError(400, 'PROJECT_ID_REQUIRED', '缺少 project_id');
    const buffer = await file.toBuffer();
    const text = decodeNovelBuffer(buffer);
    if (text.trim().length < 200) {
      throw new ApiError(400, 'NOVEL_TOO_SHORT', '文本过短（需 ≥200 字符）。请使用 UTF-8 或 GBK/ANSI 编码的 txt');
    }
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
    };
  });

  app.delete('/novel-imports/:id', async (request) => {
    const { id } = z.object({ id: idSchema }).strict().parse(request.params);
    const ok = await service.undo(id);
    if (!ok) throw new ApiError(404, 'IMPORT_NOT_FOUND', '导入记录不存在');
    return { ok: true };
  });
}
