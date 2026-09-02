'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Spinner } from '@zivith/ui';
import { errorMessage } from '@/lib/api';
import { resolveThreadForProject } from '@/lib/creator-chat-nav';

/** Activity-bar 「对话」：打开当前项目最近的世界构建线程。 */
export default function ProjectChatRedirectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    void resolveThreadForProject(projectId)
      .then((threadId) => {
        router.replace(`/creator-chats/${threadId}`);
      })
      .catch((reason: unknown) => {
        setError(errorMessage(reason));
      });
  }, [projectId, router]);

  if (error) {
    return (
      <div className="grid min-h-[50vh] place-items-center p-8">
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Spinner label="正在打开项目对话…" />
    </div>
  );
}
