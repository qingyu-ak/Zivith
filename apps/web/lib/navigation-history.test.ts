import { describe, expect, it } from 'vitest';
import { NavigationHistory, navigationHistoryFor } from './navigation-history';

describe('NavigationHistory', () => {
  it('push 记录路径，同一路径幂等', () => {
    const history = new NavigationHistory();
    history.push('/a');
    history.push('/b');
    history.push('/b');
    expect(history.current).toBe('/b');
    expect(history.canBack).toBe(true);
    expect(history.canForward).toBe(false);
  });

  it('back / forward 在栈内移动，到头返回 null', () => {
    const history = new NavigationHistory();
    expect(history.back()).toBeNull();
    history.push('/a');
    expect(history.back()).toBeNull();
    history.push('/b');
    history.push('/c');
    expect(history.back()).toBe('/b');
    expect(history.back()).toBe('/a');
    expect(history.back()).toBeNull();
    expect(history.canBack).toBe(false);
    expect(history.forward()).toBe('/b');
    expect(history.forward()).toBe('/c');
    expect(history.forward()).toBeNull();
    expect(history.canForward).toBe(false);
  });

  it('回退后 push 新路径会截断前进栈', () => {
    const history = new NavigationHistory();
    history.push('/a');
    history.push('/b');
    history.back();
    history.push('/c');
    expect(history.canForward).toBe(false);
    expect(history.back()).toBe('/a');
    expect(history.current).toBe('/a');
  });

  it('backLeaving 跳过覆盖层，落到进入前的页面', () => {
    const history = new NavigationHistory();
    history.push('/projects/p1/world');
    history.push('/projects/p1/settings');
    history.push('/projects/p1/settings?section=models');
    expect(history.backLeaving((path) => path.includes('/settings'))).toBe('/projects/p1/world');
    expect(history.current).toBe('/projects/p1/world');
    expect(history.canForward).toBe(true);
  });

  it('backLeaving 在只有覆盖层时返回 null', () => {
    const history = new NavigationHistory();
    history.push('/projects/p1/settings');
    history.push('/projects/p1/settings?section=models');
    expect(history.backLeaving((path) => path.includes('/settings'))).toBeNull();
    expect(history.current).toBe('/projects/p1/settings');
  });

  it('Chat 与 Studio 共用一条栈：从 Chat 进设置，后退回到原对话', () => {
    const history = navigationHistoryFor('studio');
    history.reset();

    history.push('/creator-chats/t1');
    history.push('/creator-chats/t2');
    history.push('/projects/p1/settings');

    expect(navigationHistoryFor('chat')).toBe(history);
    expect(history.back()).toBe('/creator-chats/t2');
    expect(history.current).toBe('/creator-chats/t2');
  });
});
