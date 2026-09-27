'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input, Textarea } from '@zivith/ui';
import { errorMessage } from '@/lib/api';
import { TxtNewWorldWizard } from '@/components/txt-new-world-wizard';
import { createScratchWorld, worldBuilderHref, worldStudioHref } from '@/lib/create-scratch-world';
import { pickWorkspaceDirectory, useIsDesktopApp, WEB_FOLDER_HINT } from '@/lib/desktop';
import { getFormText } from '@/lib/form-data';
import { normalizeThread } from '@/lib/creator-chat-nav';
import {
  FolderFlowCancelled,
  inspectWorldFolder,
  openExistingZivithWorldFolder,
  type FolderInspect,
} from '@/lib/world-folder';

type Step = 'hub' | 'scratch' | 'txt' | 'zivith';

export default function NewWorldPage() {
  const router = useRouter();
  const desktop = useIsDesktopApp();
  const [step, setStep] = useState<Step>('hub');
  const [worldFolder, setWorldFolder] = useState('');
  const [creating, setCreating] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [inspect, setInspect] = useState<FolderInspect | null>(null);

  function backToHub() {
    setError('');
    setWorldFolder('');
    setInspect(null);
    setStep('hub');
  }

  async function createFromScratch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const name = getFormText(form, 'name');
    const description = getFormText(form, 'description');
    setCreating(true);
    try {
      const thread = await createScratchWorld({
        name,
        description,
        ...(worldFolder.trim() ? { folderPath: worldFolder.trim() } : {}),
      });
      if (!thread.id) throw new Error('无法创建世界');
      router.push(worldBuilderHref(thread.id));
    } catch (reason) {
      setError(errorMessage(reason) || '没能创建世界。请再试一次。');
      setCreating(false);
    }
  }

  async function pickScratchFolder() {
    try {
      const folderPath = await pickWorkspaceDirectory();
      if (!folderPath) return;
      setWorldFolder(folderPath);
      setError('');
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function pickZivithFolder() {
    setError('');
    setInspect(null);
    try {
      const folderPath = await pickWorkspaceDirectory();
      if (!folderPath) return;
      setInspecting(true);
      const value = await inspectWorldFolder(folderPath);
      if (value.state === 'not_a_world') {
        setInspect(null);
        setError('这不是一个 Zivith 世界。请选择含 .zivith 文件夹的目录，或改用从零开始。');
        return;
      }
      setInspect(value);
    } catch (reason) {
      setError(errorMessage(reason) || '没能查看这个文件夹。请再试一次。');
    } finally {
      setInspecting(false);
    }
  }

  async function openZivithWorld() {
    if (!inspect) return;
    setError('');
    setOpening(true);
    try {
      const opened = await openExistingZivithWorldFolder(inspect.path);
      const thread = normalizeThread(opened);
      const projectId = thread?.project_id;
      if (!projectId) throw new Error('无法打开世界');
      router.push(worldStudioHref(projectId));
    } catch (reason) {
      if (reason instanceof FolderFlowCancelled) return;
      setError(errorMessage(reason) || '没能打开世界。请再试一次。');
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-5 sm:p-8">
      <header className="mb-8">
        <p className="text-sm text-accent">新建世界</p>
        <h1 className="mt-1 text-3xl font-semibold">创造你的世界，和你的主角一起遨游。</h1>
        <p className="mt-2 text-sm text-zinc-500">
          <Link href="/projects" className="text-[#4d6bfe] hover:underline">
            打开已有世界
          </Link>
          {desktop ? ' · 也可以用菜单「打开文件夹」。' : null}
        </p>
      </header>

      {error ? (
        <p className="mb-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {step === 'hub' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <ChoiceCard
            title="从零开始"
            description="进入 World Builder，用对话慢慢长出世界。"
            action="继续"
            onClick={() => {
              setError('');
              setStep('scratch');
            }}
          />
          <ChoiceCard
            title="导入小说 TXT"
            description="分析文本，预览后再创建世界。"
            action="继续"
            onClick={() => {
              setError('');
              setStep('txt');
            }}
          />
          <ChoiceCard
            title="导入 Zivith 世界"
            description="打开已有的 .zivith 工程文件夹。"
            action="继续"
            onClick={() => {
              setError('');
              setInspect(null);
              setStep('zivith');
            }}
          />
        </div>
      ) : null}

      {step === 'scratch' ? (
        <Card>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              void createFromScratch(event);
            }}
          >
            <Field label="世界名称">
              <Input
                name="name"
                required
                autoFocus
                placeholder="例如：雾城来信"
                disabled={creating}
              />
            </Field>
            <Field label="简介（可选）">
              <Textarea
                name="description"
                className="min-h-11"
                placeholder="一句话描述你的创意宇宙"
                disabled={creating}
              />
            </Field>
            {desktop ? (
              <Field label="世界文件夹（可选）">
                <div className="flex gap-2">
                  <Input
                    value={worldFolder}
                    readOnly
                    placeholder="不选则自动放到桌面 Zivith 下的同名文件夹"
                    className="flex-1"
                    disabled={creating}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={creating}
                    onClick={() => void pickScratchFolder()}
                  >
                    选择…
                  </Button>
                  {worldFolder ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={creating}
                      onClick={() => setWorldFolder('')}
                    >
                      清除
                    </Button>
                  ) : null}
                </div>
              </Field>
            ) : null}
            <p className="text-xs leading-5 text-zinc-500">
              创建后会在默认目录下自动建同名文件夹，并写入 .zivith/workspace.json。默认目录和当前世界的路径可在设置 → 常规里改。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={creating}>
                {creating ? '正在创建…' : '创建世界'}
              </Button>
              <Button type="button" variant="secondary" disabled={creating} onClick={backToHub}>
                返回
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {step === 'txt' ? (
        <TxtNewWorldWizard
          onBack={backToHub}
          onCreated={(projectId) => {
            router.push(worldStudioHref(projectId));
          }}
        />
      ) : null}

      {step === 'zivith' ? (
        <Card>
          <h2 className="text-lg font-semibold">导入 Zivith 世界</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            选择一个已经包含 <code className="rounded bg-zinc-100 px-1">.zivith</code>{' '}
            文件夹的世界目录。拷贝整个文件夹就是搬运，不是压缩包。
          </p>
          {desktop ? (
            <div className="mt-5 grid gap-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={inspecting || opening}
                  onClick={() => void pickZivithFolder()}
                >
                  {inspecting ? '正在查看…' : inspect ? '重新选择…' : '选择世界文件夹'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={inspecting || opening}
                  onClick={backToHub}
                >
                  返回
                </Button>
              </div>
              {inspect ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
                  <p className="font-medium text-zinc-900">{inspect.name || '未命名世界'}</p>
                  <p className="mt-1 break-all text-xs text-zinc-500">{inspect.path}</p>
                  {inspect.state === 'corrupt' ? (
                    <p className="mt-2 text-amber-700">
                      配置文件无法读取。打开时会询问是否尝试恢复。
                    </p>
                  ) : null}
                  <Button
                    className="mt-4"
                    type="button"
                    disabled={opening}
                    onClick={() => void openZivithWorld()}
                  >
                    {opening ? '正在打开…' : '打开这个世界'}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              <p className="text-sm text-zinc-500">{WEB_FOLDER_HINT}</p>
              <Button type="button" variant="secondary" onClick={backToHub}>
                返回
              </Button>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}

function ChoiceCard({
  title,
  description,
  action,
  onClick,
}: {
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 min-h-16 flex-1 text-sm leading-6 text-zinc-500">{description}</p>
      <Button className="mt-5" type="button" onClick={onClick}>
        {action}
      </Button>
    </Card>
  );
}
