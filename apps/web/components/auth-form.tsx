'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Field, Input } from '@zivith/ui';
import { api, errorMessage, session } from '@/lib/api';
import { getFormText } from '@/lib/form-data';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const isLogin = mode === 'login';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const payload = await api<{
        access_token?: string;
        refresh_token?: string;
        token?: string;
      }>(mode === 'login' ? '/auth/login' : '/auth/signup', {
        method: 'POST',
        body: isLogin
          ? {
              email: getFormText(form, 'email'),
              password: getFormText(form, 'password'),
            }
          : {
              display_name: getFormText(form, 'name'),
              email: getFormText(form, 'email'),
              password: getFormText(form, 'password'),
            },
      });
      const token = payload.access_token ?? payload.token;
      if (!token || !payload.refresh_token) throw new Error('登录响应中缺少会话令牌');
      session.setTokens(token, payload.refresh_token);
      router.push('/projects');
      router.refresh();
    } catch (reason) {
      const text = errorMessage(reason).trim();
      setError(text || (isLogin ? '邮箱或密码错误' : '注册失败，请重试'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      {!isLogin && (
        <Field label="你的称呼">
          <Input name="name" autoComplete="name" required placeholder="例如：林默" />
        </Field>
      )}
      <Field label="邮箱">
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="name@example.com"
        />
      </Field>
      <Field label="密码" hint={!isLogin ? '至少 10 个字符' : undefined}>
        <Input
          name="password"
          type="password"
          minLength={isLogin ? 1 : 10}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          required
        />
      </Field>
      {error && (
        <p
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600"
          role="alert"
        >
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? '请稍候…' : isLogin ? '登录' : '创建账户'}
      </Button>
      <p className="text-center text-sm text-zinc-400">
        {isLogin ? '还没有账户？' : '已有账户？'}
        <Link
          className="ml-2 font-medium text-accent hover:underline"
          href={isLogin ? '/register' : '/login'}
        >
          {isLogin ? '立即注册' : '返回登录'}
        </Link>
      </p>
    </form>
  );
}
