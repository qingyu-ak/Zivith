'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage } from '@/lib/api';

interface ImportReport {
  characters?: Array<{
    id: string;
    name: string;
    aliases?: string[];
    mentions?: number;
    tier?: string;
  }>;
  locations?: Array<{ id: string; name: string }>;
  events?: Array<{ id: string; title: string; chapterIndex?: number }>;
  relationships?: Array<{ id: string; source: string; target: string }>;
  worldview_highlights?: string[];
  skipped?: string[];
}

interface ImportChapter {
  index: number;
  title?: string | null;
  status: string;
  attempts: number;
  last_error?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function importIdFromError(reason: unknown): string | undefined {
  if (!(reason instanceof ApiError) || !isRecord(reason.details)) return undefined;
  const nested = isRecord(reason.details.error) ? reason.details.error : reason.details;
  const details = isRecord(nested.details) ? nested.details : nested;
  return typeof details.import_id === 'string' ? details.import_id : undefined;
}

function failedChapterLabel(report: unknown, chapters?: ImportChapter[]): string | undefined {
  const failed = chapters?.find((chapter) => chapter.status === 'failed');
  if (failed) {
    const title = failed.title ? `「${failed.title}」` : '';
    return `第 ${failed.index + 1} 章${title}${failed.last_error ? `：${failed.last_error}` : ''}`;
  }
  if (!isRecord(report) || typeof report.failed_chapter_index !== 'number') return undefined;
  const title =
    typeof report.failed_chapter_title === 'string' ? `「${report.failed_chapter_title}」` : '';
  return `第 ${report.failed_chapter_index + 1} 章${title}`;
}

/** M2 小说导入面板：上传 txt → 规则提取 → 世界层 + 角色卡，支持整体撤销、轻量升级与按章重试。 */
export function NovelImportPanel({
  projectId,
  onImported,
  showTitle = true,
}: {
  projectId: string;
  onImported: () => void;
  showTitle?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [lastImportId, setLastImportId] = useState('');
  const [filename, setFilename] = useState('');
  const [upgradingId, setUpgradingId] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [failedChapter, setFailedChapter] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const value = await api<{
          items?: Array<{
            id: string;
            status?: string;
            source_filename?: string;
            report?: ImportReport | Record<string, unknown> | null;
          }>;
        }>(`/novel-imports?project_id=${encodeURIComponent(projectId)}`);
        const latest = value.items?.[0];
        if (cancelled || !latest) return;
        setLastImportId(latest.id);
        setFilename(latest.source_filename ?? '');
        setImportStatus(latest.status ?? '');
        if (latest.status === 'failed') {
          setFailedChapter(failedChapterLabel(latest.report) ?? '');
          if (isRecord(latest.report) && typeof latest.report.error === 'string') {
            setError(latest.report.error);
          }
          if (latest.report && Array.isArray((latest.report as ImportReport).characters)) {
            setReport(latest.report);
          }
          return;
        }
        if (latest.report && Array.isArray((latest.report as ImportReport).characters)) {
          setReport(latest.report);
        }
      } catch {
        /* 列表失败时保持空态，上传仍可用 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function upload(file: File) {
    setBusy(true);
    setError('');
    setReport(null);
    setFailedChapter('');
    try {
      const form = new FormData();
      form.append('project_id', projectId);
      form.append('file', file);
      const value = await api<{ import_id: string; report?: ImportReport }>('/novel-imports', {
        method: 'POST',
        body: form,
      });
      setReport(value.report ?? null);
      setLastImportId(value.import_id);
      setFilename(file.name);
      setImportStatus('done');
      onImported();
    } catch (reason) {
      const recoveredId = importIdFromError(reason);
      if (recoveredId) setLastImportId(recoveredId);
      setImportStatus('failed');
      setError(errorMessage(reason));
      if (recoveredId) {
        try {
          const detail = await api<{
            report?: Record<string, unknown> | null;
            chapters?: ImportChapter[];
          }>(`/novel-imports/${recoveredId}`);
          setFailedChapter(failedChapterLabel(detail.report, detail.chapters) ?? '');
          if (detail.report && Array.isArray((detail.report as ImportReport).characters)) {
            setReport(detail.report);
          }
        } catch {
          /* 仍显示接口报错 */
        }
      }
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function undo() {
    if (!lastImportId || busy) return;
    setBusy(true);
    try {
      await api(`/novel-imports/${lastImportId}`, { method: 'DELETE' });
      setReport(null);
      setLastImportId('');
      setImportStatus('');
      setFailedChapter('');
      setError('');
      onImported();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!lastImportId || busy) return;
    setBusy(true);
    setError('');
    try {
      const value = await api<{ import_id: string; report?: ImportReport }>(
        `/novel-imports/${lastImportId}/retry`,
        { method: 'POST' },
      );
      setReport(value.report ?? null);
      setImportStatus('done');
      setFailedChapter('');
      onImported();
    } catch (reason) {
      setImportStatus('failed');
      setError(errorMessage(reason));
      try {
        const detail = await api<{
          report?: Record<string, unknown> | null;
          chapters?: ImportChapter[];
        }>(`/novel-imports/${lastImportId}`);
        setFailedChapter(failedChapterLabel(detail.report, detail.chapters) ?? '');
      } catch {
        /* 仍显示接口报错 */
      }
    } finally {
      setBusy(false);
    }
  }

  async function upgrade(assetId: string) {
    if (!lastImportId || busy) return;
    setUpgradingId(assetId);
    setError('');
    try {
      const value = await api<{ character?: { id: string; tier?: string } }>(
        `/novel-imports/${lastImportId}/upgrade`,
        { method: 'POST', body: { asset_id: assetId } },
      );
      const nextTier = value.character?.tier ?? 'full';
      setReport((current) => {
        if (!current?.characters) return current;
        return {
          ...current,
          characters: current.characters.map((character) =>
            character.id === assetId ? { ...character, tier: nextTier } : character,
          ),
        };
      });
      onImported();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setUpgradingId('');
    }
  }

  const characterCount = report?.characters?.length ?? 0;
  const fullCards = report?.characters?.filter((c) => c.tier === 'full').length ?? 0;
  const lightCards = report?.characters?.filter((c) => c.tier === 'light') ?? [];

  return (
    <section className={showTitle ? 'rounded-lg border border-line bg-white/70 p-3' : 'px-3 pb-1'}>
      <div className={`mb-2 flex items-center ${showTitle ? 'justify-between' : 'justify-end'}`}>
        {showTitle ? <h3 className="text-sm font-medium text-zinc-700">导入小说</h3> : null}
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="rounded border border-line px-2 py-0.5 text-xs text-zinc-500 hover:border-accent/60 hover:text-accent disabled:opacity-50"
        >
          {busy ? (importStatus === 'failed' ? '重试中…' : '解析中…') : '上传 txt'}
        </button>
      </div>
      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
      {importStatus === 'failed' && lastImportId && (
        <div className="mb-2 space-y-1">
          {failedChapter ? (
            <p className="text-xs text-zinc-500">失败章节：{failedChapter}</p>
          ) : null}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void retry()}
              disabled={busy}
              className="rounded border border-line px-2 py-0.5 text-xs text-[#4d6bfe] hover:border-accent/60 disabled:opacity-50"
            >
              {busy ? '重试中…' : '重试失败章节'}
            </button>
            <button
              type="button"
              onClick={() => void undo()}
              disabled={busy}
              className="text-[11px] text-zinc-400 hover:text-red-500 disabled:opacity-50"
            >
              撤销本次导入
            </button>
          </div>
        </div>
      )}
      {!report && !busy && importStatus !== 'failed' && (
        <p className="text-xs text-zinc-400">
          上传 UTF-8 或 Windows 记事本 ANSI/GBK
          编码的小说文本，自动提炼角色卡、场景、事件与关系写入世界层。
        </p>
      )}
      {report && (
        <div className="space-y-1.5 text-xs">
          <p className="text-zinc-600">
            {importStatus === 'failed' ? '写入未完成' : '已导入'}「{filename}」：主要角色{' '}
            {fullCards} 张全量卡
            {characterCount - fullCards > 0 ? `、轻量条目 ${characterCount - fullCards} 个` : ''}
            ，场景 {report.locations?.length ?? 0} 个，事件 {report.events?.length ?? 0} 个，关系{' '}
            {report.relationships?.length ?? 0} 条。
          </p>
          {report.characters && report.characters.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {report.characters.slice(0, 12).map((character) => (
                <span
                  key={character.id}
                  className={`rounded border px-1.5 py-0.5 text-[10px] ${
                    character.tier === 'full'
                      ? 'border-[#4d6bfe]/30 bg-[#eef2ff] text-[#1e3a8a]'
                      : 'border-line text-zinc-500'
                  }`}
                >
                  {character.name}
                </span>
              ))}
            </div>
          )}
          {lightCards.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] text-zinc-500">轻量条目可升级为全量角色卡：</p>
              <ul className="space-y-0.5">
                {lightCards.map((character) => (
                  <li key={character.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-zinc-600">{character.name}</span>
                    <button
                      type="button"
                      disabled={busy || Boolean(upgradingId)}
                      onClick={() => void upgrade(character.id)}
                      className="shrink-0 text-[11px] text-[#4d6bfe] hover:underline disabled:opacity-50"
                    >
                      {upgradingId === character.id ? '升级中…' : '升级'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={() => void undo()}
            disabled={busy}
            className="text-[11px] text-zinc-400 hover:text-red-500 disabled:opacity-50"
          >
            撤销本次导入
          </button>
        </div>
      )}
    </section>
  );
}
