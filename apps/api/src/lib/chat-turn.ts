/** 失败重试：若最后一条已是同一条用户消息，则复用，避免再插一条。 */

export function canReuseLastUser(
  last: { role: string; content: string } | null | undefined,
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

/** pending 或尚未写 state 的提案仍可确认 / 拒绝。 */
export function isOpenProposalState(state: string | null | undefined): boolean {
  return !state || state === 'pending';
}
