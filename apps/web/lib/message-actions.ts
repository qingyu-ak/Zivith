/** 消息级复制 / 重试（Chat 与 Studio Agent 共用）。不做对话树分叉。 */

export interface ChatTurnMessage {
  id: string;
  role: string;
  content: string;
}

export type RetryBlocked = 'not-latest' | 'empty';

export type RetryTarget = { ok: true; content: string } | { ok: false; blocked: RetryBlocked };

export const RETRY_BLOCKED_HINT: Record<RetryBlocked, string> = {
  'not-latest': '只能重试最近一轮，避免对话分叉',
  empty: '没有可重发的内容',
};

export function lastUserContent(messages: ChatTurnMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (item?.role === 'user' && item.content.trim()) return item.content;
  }
  return null;
}

/** 失败条「重试」优先用刚发出的原文，避免把加载失败当成重发。 */
export function errorRetryContent(lastSent: string, messages: ChatTurnMessage[]): string | null {
  const sent = lastSent.trim();
  if (sent) return sent;
  return lastUserContent(messages);
}

/** 与 API 约定一致：失败重试时复用末尾未配对的同一条 user，不新插一条。 */
export function canReuseLastUser(
  last: ChatTurnMessage | null | undefined,
  content: string,
  retry?: boolean,
): boolean {
  return Boolean(
    retry &&
    last?.role === 'user' &&
    last.content.trim() === content.trim() &&
    Boolean(content.trim()),
  );
}

export function appendUniqueById<T extends { id: string }>(current: T[], next: T): T[] {
  if (current.some((item) => item.id === next.id)) return current;
  return [...current, next];
}

export function retryTargetForMessage(
  messages: ChatTurnMessage[],
  messageId: string,
): RetryTarget | null {
  const turns = messages.filter((item) => item.role === 'user' || item.role === 'assistant');
  const index = turns.findIndex((item) => item.id === messageId);
  if (index < 0) return null;
  const target = turns[index];
  if (!target) return null;

  if (target.role === 'user') {
    const lastUser = [...turns].reverse().find((item) => item.role === 'user');
    if (lastUser?.id !== target.id) return { ok: false, blocked: 'not-latest' };
    return target.content.trim()
      ? { ok: true, content: target.content }
      : { ok: false, blocked: 'empty' };
  }

  if (target.role === 'assistant') {
    if (turns[turns.length - 1]?.id !== target.id) return { ok: false, blocked: 'not-latest' };
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const previous = turns[cursor];
      if (previous?.role === 'user') {
        return previous.content.trim()
          ? { ok: true, content: previous.content }
          : { ok: false, blocked: 'empty' };
      }
    }
    return { ok: false, blocked: 'empty' };
  }

  return null;
}

export async function copyTextToClipboard(text: string): Promise<'ok' | 'empty' | 'denied'> {
  if (!text.trim()) return 'empty';
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'ok';
    }
  } catch {
    // 权限或非安全上下文时走 execCommand。
  }
  if (typeof document === 'undefined') return 'denied';
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok ? 'ok' : 'denied';
  } catch {
    return 'denied';
  }
}
