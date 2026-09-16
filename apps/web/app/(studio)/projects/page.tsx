'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, EmptyState, Spinner } from '@zivith/ui';
import { api, errorMessage, unwrapList } from '@/lib/api';
import { isDesktopApp, pickWorkspaceDirectory, WEB_FOLDER_HINT } from '@/lib/desktop';
import { NEW_WORLD_HREF } from '@/lib/create-scratch-world';
import { normalizeThread } from '@/lib/creator-chat-nav';
import {
  FolderFlowCancelled,
  openWorldFromFolder,
  unbindProjectWorkspace,
} from '@/lib/world-folder';
import type { ProjectDTO } from '@/lib/types';

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [desktop, setDesktop] = useState(false);

  const load = useCallback(async () => {
    try {
      const value = await api<ProjectDTO[] | { data?: ProjectDTO[]; items?: ProjectDTO[] }>(
        '/projects',
      );
      setProjects(
        unwrapList(value).map((item) => {
          const record = item as ProjectDTO & { workspacePath?: string | null };
          return {
            ...record,
            workspace_path: record.workspace_path ?? record.workspacePath ?? null,
          };
        }),
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDesktop(isDesktopApp());
  }, []);

  useEffect(() => {
    if (searchParams.get('new') === '1') router.replace(NEW_WORLD_HREF);
  }, [searchParams, router]);

  async function openLocalFolder() {
    try {
      const folderPath = await pickWorkspaceDirectory();
      if (!folderPath) return;
      setError('');
      setOpening(true);
      const created = await openWorldFromFolder(folderPath);
      const thread = normalizeThread(created);
      const projectId = thread?.project_id;
      if (!projectId) throw new Error('无法打开项目文件夹');
      router.push(`/projects/${projectId}/world`);
    } catch (reason) {
      if (reason instanceof FolderFlowCancelled) return;
      setError(errorMessage(reason));
    } finally {
      setOpening(false);
    }
  }

  // §18.3 [重新绑定] / §19 [重新定位/绑定文件夹]：把世界显式绑到所选文件夹，
  // 服务端会先按 workspace.json 的 worldId 校验，不会覆盖其他世界的身份。
  async function bindFolder(project: ProjectDTO, stale: boolean) {
    try {
      const folderPath = await pickWorkspaceDirectory();
      if (!folderPath) return;
      const purpose = stale ? '重新定位到这个文件夹' : '绑定到这个文件夹';
      if (!window.confirm(`把世界「${project.name}」${purpose}？\n${folderPath}`)) {
        return;
      }
      setError('');
      setOpening(true);
      const created = await openWorldFromFolder(folderPath, { rebindProjectId: project.id });
      const thread = normalizeThread(created);
      const projectId = thread?.project_id;
      if (!projectId) throw new Error('无法绑定文件夹');
      router.push(`/projects/${projectId}/world`);
    } catch (reason) {
      if (reason instanceof FolderFlowCancelled) return;
      setError(errorMessage(reason));
    } finally {
      setOpening(false);
    }
  }

  // §19 [移除本机绑定]：只清除路径关联，世界数据全部保留。
  async function unbind(project: ProjectDTO) {
    if (!window.confirm(`移除世界「${project.name}」的本机文件夹绑定？世界数据会保留。`)) return;
    try {
      setError('');
      await unbindProjectWorkspace(project.id);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function remove(project: ProjectDTO) {
    if (!window.confirm(`确定删除项目“${project.name}”吗？此操作无法撤销。`)) return;
    try {
      await api(`/projects/${project.id}`, { method: 'DELETE' });
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-accent">创作中心</p>
          <h1 className="mt-1 text-3xl font-semibold">你的世界</h1>
          <p className="mt-2 text-zinc-400">
            {desktop
              ? '一个文件夹是一个世界工作区。用桌面应用选择真实路径；Chat 里可新建聊天、改名、删除对话。'
              : '在网页里可以新建世界并继续已有世界。绑定磁盘文件夹需要 Zivith 桌面应用。'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {desktop ? (
            <Button
              disabled={opening}
              onClick={() => {
                void openLocalFolder();
              }}
            >
              {opening ? '正在打开…' : '打开文件夹'}
            </Button>
          ) : null}
          <Button
            variant={desktop ? 'secondary' : undefined}
            onClick={() => router.push(NEW_WORLD_HREF)}
          >
            新建世界
          </Button>
        </div>
      </header>

      {error && (
        <p className="mb-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <Spinner label="正在加载世界…" />
      ) : projects.length === 0 ? (
        <EmptyState
          title="还没有世界"
          description={desktop ? '新建一个世界，或打开已有的 .zivith 文件夹。' : WEB_FOLDER_HINT}
          action={
            <div className="flex flex-wrap gap-2">
              {desktop ? (
                <Button
                  disabled={opening}
                  onClick={() => {
                    void openLocalFolder();
                  }}
                >
                  {opening ? '正在打开…' : '打开文件夹'}
                </Button>
              ) : null}
              <Button
                variant={desktop ? 'secondary' : undefined}
                onClick={() => router.push(NEW_WORLD_HREF)}
              >
                新建世界
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="group relative overflow-hidden">
              <Link href={`/projects/${project.id}/world`} className="block">
                <div className="mb-5 aspect-[16/8] rounded-lg bg-gradient-to-br from-zinc-100 via-zinc-50 to-accent/10" />
                <h2 className="text-lg font-semibold group-hover:text-accent">{project.name}</h2>
                <p className="mt-1 truncate text-xs text-zinc-500">
                  {project.workspace_path || '未绑定文件夹'}
                </p>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-400">
                  {project.description || '暂无项目简介'}
                </p>
                <div className="mt-5 flex gap-4 text-xs text-zinc-500">
                  <span>{project.story_count ?? 0} 个故事</span>
                  <span>{project.asset_count ?? 0} 项资产</span>
                </div>
              </Link>
              {project.workspace_path && project.workspace_exists === false ? (
                <div className="mx-1 mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
                  <p className="font-medium">当前文件夹不存在</p>
                  <p className="mt-1 break-all leading-4">上次位置：{project.workspace_path}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void bindFolder(project, true);
                      }}
                    >
                      重新定位
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void unbind(project);
                      }}
                    >
                      移除本机绑定
                    </Button>
                  </div>
                </div>
              ) : null}
              {!project.workspace_path && desktop ? (
                <div className="mx-1 mb-3">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void bindFolder(project, false);
                    }}
                  >
                    绑定文件夹
                  </Button>
                </div>
              ) : null}
              {project.workspace_path && project.workspace_exists !== false && desktop ? (
                <div className="mx-1 mb-3">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void bindFolder(project, true);
                    }}
                  >
                    重新定位
                  </Button>
                </div>
              ) : null}
              <Button
                className="absolute right-3 top-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                variant="danger"
                onClick={() => {
                  void remove(project);
                }}
              >
                删除
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
