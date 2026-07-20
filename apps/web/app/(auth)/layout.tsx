import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.15fr_.85fr]">
      <section className="hidden border-r border-line p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="text-xl font-bold tracking-tight">
          ZIVITH<span className="text-accent">.</span>
        </div>
        <div className="max-w-xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[.24em] text-accent">
            AI 原生影视创作
          </p>
          <h1 className="text-5xl font-semibold leading-tight">
            让每个创意决定都可见、可编辑、可复用。
          </h1>
          <p className="mt-6 max-w-lg leading-7 text-zinc-400">
            从故事到场景，从镜头规格到最终画面。你负责导演，Zivith 负责保持创作上下文。
          </p>
        </div>
        <p className="text-sm text-zinc-600">故事优先 · 镜头为核 · 人类决策</p>
      </section>
      <section className="grid place-items-center px-6 py-12">{children}</section>
    </main>
  );
}
