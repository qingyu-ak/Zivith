import { describe, expect, it } from 'vitest';
import { NavigationHistory } from './navigation-history';

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
});
