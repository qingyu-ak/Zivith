'use client';

import { useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api';

interface ImportReport {
  characters?: Array<{ id: string; name: string; aliases?: string[]; mentions?: number; tier?: string }>;
  locations?: Array<{ id: string; name: string }>;
  events?: Array<{ id: string; title: string; chapterIndex?: number }>;
  relationships?: Array<{ id: string; source: string; target: string }>;
  worldview_highlights?: string[];
  skipped?: string[];
}

/** M2 小说导入面板：上传 txt → 规则提取 → 世界层 + 角色卡，支持整体撤销。 */
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

  async function upload(file: File) {
    setBusy(true);
    setError('');
    setReport(null);
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
      onImported();
    } catch (reason) {
      setError(errorMessage(reason));
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
      onImported();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const characterCount = report?.characters?.length ?? 0;
  const fullCards = report?.characters?.filter((c) => c.tier === 'full').length ?? 0;

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
          {busy ? '解析中…' : '上传 txt'}
        </button>
      </div>
      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
      {!report && !busy && (
        <p className="text-xs text-zinc-400">
          上传 UTF-8 或 Windows 记事本 ANSI/GBK 编码的小说文本，自动提炼角色卡、场景、事件与关系写入世界层。
        </p>
      )}
      {report && (
        <div className="space-y-1.5 text-xs">
          <p className="text-zinc-600">
            已导入「{filename}」：主要角色 {fullCards} 张全量卡
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
