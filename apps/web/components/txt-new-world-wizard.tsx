'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import { Button, Card, Field, Input, Spinner } from '@zivith/ui';
import { errorMessage } from '@/lib/api';
import {
  assertTxtFile,
  commitWorldFromTxt,
  isAbortError,
  previewNovelTxt,
  type TxtWorldPreview,
} from '@/lib/txt-new-world';

type Phase = 'upload' | 'parsing' | 'preview' | 'committing';

export function TxtNewWorldWizard({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (projectId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const parseAbort = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>('upload');
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TxtWorldPreview | null>(null);
  const [name, setName] = useState('');
  const [dragging, setDragging] = useState(false);

  function resetToUpload(message = '') {
    parseAbort.current?.abort();
    parseAbort.current = null;
    setPhase('upload');
    setPreview(null);
    setFile(null);
    setName('');
    setError(message);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function analyze(next: File) {
    try {
      assertTxtFile(next);
    } catch (reason) {
      setError(errorMessage(reason) || '请选择 .txt 文件');
      return;
    }
    parseAbort.current?.abort();
    const controller = new AbortController();
    parseAbort.current = controller;
    setFile(next);
    setPreview(null);
    setError('');
    setPhase('parsing');
    try {
      const value = await previewNovelTxt(next, controller.signal);
      if (controller.signal.aborted) return;
      setPreview(value);
      setName(value.suggested_name || next.name.replace(/\.txt$/i, ''));
      setPhase('preview');
    } catch (reason) {
      if (isAbortError(reason) || controller.signal.aborted) {
        setPhase('upload');
        return;
      }
      setError(errorMessage(reason) || '没能分析这本小说。请检查文本后重新选择文件。');
      setPhase('upload');
    } finally {
      if (parseAbort.current === controller) parseAbort.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    if (next) void analyze(next);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const next = event.dataTransfer.files?.[0];
    if (next) void analyze(next);
  }

  function cancelParse() {
    parseAbort.current?.abort();
    parseAbort.current = null;
    setPhase('upload');
    setError('');
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || phase === 'committing') return;
    setError('');
    const worldName = name.trim();
    if (!worldName) {
      setError('请填写世界名称');
      return;
    }
    setPhase('committing');
    try {
      const created = await commitWorldFromTxt({ name: worldName, file });
      onCreated(created.projectId);
    } catch (reason) {
      setError(errorMessage(reason) || '没能创建世界。请再试一次。');
      setPhase('preview');
    }
  }

  const busy = phase === 'parsing' || phase === 'committing';

  return (
    <Card>
      <h2 className="text-lg font-semibold">导入小说 TXT</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        先分析文本、预览角色和事件，确认后再创建世界。已有世界里的「导入小说」不受影响。
      </p>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {phase === 'upload' || phase === 'parsing' ? (
        <div className="mt-5 grid gap-4">
          <div
            className={`rounded-lg border border-dashed p-6 text-center text-sm ${
              dragging ? 'border-[#4d6bfe] bg-[#4d6bfe]/5' : 'border-zinc-300 bg-zinc-50'
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {phase === 'parsing' ? (
              <div className="flex flex-col items-center gap-3">
                <Spinner label="正在分析世界观与角色…" />
                {file ? <p className="text-xs text-zinc-500">{file.name}</p> : null}
              </div>
            ) : (
              <>
                <p>拖放 .txt 到这里，或选择文件。不超过 20MB。</p>
                <p className="mt-1 text-xs text-zinc-500">请使用 UTF-8 或 GBK/ANSI 编码。</p>
              </>
            )}
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept=".txt,text/plain"
              disabled={busy}
              onChange={onPick}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {phase === 'parsing' ? (
              <Button type="button" variant="secondary" onClick={cancelParse}>
                取消
              </Button>
            ) : (
              <>
                <Button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()}>
                  选择文件
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={onBack}>
                  返回
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {preview && (phase === 'preview' || phase === 'committing') ? (
        <form
          className="mt-5 grid gap-4"
          onSubmit={(event) => {
            void confirm(event);
          }}
        >
          <Field label="世界名称">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoFocus
              disabled={busy}
              placeholder="例如：雾城来信"
            />
          </Field>
          {file ? <p className="text-xs text-zinc-500">来源：{file.name}</p> : null}
          <PreviewSummary preview={preview} />
          {preview.characters.length === 0 ? (
            <p className="text-sm text-amber-700">
              没有识别到角色。仍可创建空一些的世界，之后再在世界里补充。
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !name.trim()}>
              {phase === 'committing' ? '正在创建…' : '确认并创建世界'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => resetToUpload()}
            >
              重新选择文件
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={onBack}>
              返回
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}

function PreviewSummary({ preview }: { preview: TxtWorldPreview }) {
  const full = preview.characters.filter((character) => character.tier !== 'light');
  const light = preview.characters.filter((character) => character.tier === 'light');
  return (
    <div className="grid gap-3 text-sm">
      <p className="text-zinc-600">
        {preview.chapter_count} 章 · {preview.characters.length} 名角色 · {preview.locations.length}{' '}
        处地点 · {preview.events.length} 条事件 · 约 {preview.memory_estimate} 条记忆
      </p>
      <PreviewList
        title={`角色（${full.length} 张全量卡${light.length ? `，${light.length} 张轻量` : ''}）`}
        items={preview.characters.map((character) =>
          character.tier === 'light' ? `${character.name}（次要）` : character.name,
        )}
      />
      <PreviewList
        title={`地点（${preview.locations.length}）`}
        items={preview.locations.map((location) => location.name)}
      />
      <PreviewList
        title={`事件（${preview.events.length}）`}
        items={preview.events.map((event) => event.title)}
      />
      <PreviewList
        title={`关系（${preview.relationships.length}）`}
        items={preview.relationships.map((relation) => `${relation.source} ↔ ${relation.target}`)}
      />
      <PreviewList title="世界观要点" items={preview.worldview_highlights} />
    </div>
  );
}

function PreviewList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-500">
        {title}：无
      </div>
    );
  }
  return (
    <details className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <summary className="cursor-pointer font-medium text-zinc-800">{title}</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-600">
        {items.slice(0, 40).map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
        {items.length > 40 ? <li>还有 {items.length - 40} 项未展开</li> : null}
      </ul>
    </details>
  );
}
