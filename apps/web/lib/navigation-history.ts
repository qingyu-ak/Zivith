/**
 * 会话级浏览历史栈（顶栏「上一步 / 下一步」）。
 * 与浏览器历史独立：只记录应用内路径，back/forward 返回目标路径由调用方导航；
 * push 对同一路径幂等，因此导航落地后的重复 push 不会破坏栈。
 */
export class NavigationHistory {
  private stack: string[] = [];
  private index = -1;

  get current(): string {
    return this.stack[this.index] ?? '';
  }

  get canBack(): boolean {
    return this.index > 0;
  }

  get canForward(): boolean {
    return this.index >= 0 && this.index < this.stack.length - 1;
  }

  /** 新分支会截断前进栈；同一路径幂等。 */
  push(path: string): void {
    if (path === this.stack[this.index]) return;
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(path);
    this.index = this.stack.length - 1;
  }

  /** 返回目标路径（调用方负责导航）；到头返回 null 且不移动指针。 */
  back(): string | null {
    if (!this.canBack) return null;
    this.index -= 1;
    return this.stack[this.index]!;
  }

  forward(): string | null {
    if (!this.canForward) return null;
    this.index += 1;
    return this.stack[this.index]!;
  }

  /** 测试与「回首页」类场景用：清空历史。 */
  reset(): void {
    this.stack = [];
    this.index = -1;
  }
}

/** 会话级单例容器：Chat 与 Studio 各一套栈，换壳不串栈。 */
const surfaces = new Map<string, NavigationHistory>();

export const CHAT_SURFACE = 'chat';
export const STUDIO_SURFACE = 'studio';

export function navigationHistoryFor(surface: string): NavigationHistory {
  let instance = surfaces.get(surface);
  if (!instance) {
    instance = new NavigationHistory();
    surfaces.set(surface, instance);
  }
  return instance;
}
