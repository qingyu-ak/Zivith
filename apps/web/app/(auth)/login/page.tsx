import { AuthForm } from '@/components/auth-form';

export default function LoginPage() {
  return (
    <div className="w-full max-w-md">
      <h1 className="text-3xl font-semibold text-[var(--z-fg)]">欢迎回来</h1>
      <p className="mb-8 mt-2 text-[var(--z-fg-subtle)]">继续你的下一段故事。</p>
      <AuthForm mode="login" />
    </div>
  );
}
