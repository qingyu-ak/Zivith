import { AsyncLocalStorage } from 'node:async_hooks';

export interface UsageContext {
  projectId: string;
  /** Override inferred task type when set. */
  taskType?: string;
}

const store = new AsyncLocalStorage<UsageContext>();

export function getUsageContext(): UsageContext | undefined {
  return store.getStore();
}

export function withUsageContext<T>(context: UsageContext, run: () => Promise<T>): Promise<T> {
  return store.run(context, run);
}

export function withUsageContextSync<T>(context: UsageContext, run: () => T): T {
  return store.run(context, run);
}
