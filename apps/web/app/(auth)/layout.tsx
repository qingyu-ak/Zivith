import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { AuthWindowChrome } from '@/components/auth-window-chrome';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--z-bg)]">
      <Suspense>
        <AuthWindowChrome />
      </Suspense>
      <main data-auth-stage className="grid min-h-0 flex-1 lg:grid-cols-[1.15fr_.85fr]">
        <section
          data-auth-marketing
          className="hidden border-r border-line px-12 pb-12 pt-4 lg:flex lg:flex-col lg:justify-between"
        >
          <div className="flex max-w-xl flex-1 flex-col justify-center">
            <p className="mb-5 text-sm font-semibold tracking-[.18em] text-accent">
              AI 原生世界系统
            </p>
            <h1 className="text-5xl font-semibold leading-tight text-[var(--z-fg)]">
              让每个世界决定都可见、可编辑、可复用。
            </h1>
            <p className="mt-6 max-w-lg leading-7 text-[var(--z-fg-subtle)]">
              建角色、地点和事件，再走进去说话。AI
              提出变化，你确认之后才写进世界——对话不会悄悄改设定。
            </p>
          </div>
          <p className="text-sm text-[var(--z-fg-subtle)]">世界为核 · 你来确认 · 角色记得</p>
        </section>
        <section data-auth-form className="grid place-items-center px-6 py-12">
          {children}
        </section>
      </main>
    </div>
  );
}
