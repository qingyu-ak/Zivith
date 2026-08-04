import { ChatPanel } from '@/components/creator-chat/chat-panel';

export default async function CreatorChatThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  return <ChatPanel threadId={threadId} />;
}
