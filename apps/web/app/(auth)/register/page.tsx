import { AuthForm } from '@/components/auth-form';

export default function RegisterPage() {
  return (
    <div className="w-full max-w-md">
      <h1 className="text-3xl font-semibold text-[var(--z-fg)]">开始创作</h1>
      <p className="mb-8 mt-2 text-[var(--z-fg-subtle)]">建立属于你的创意宇宙。</p>
      <AuthForm mode="register" />
    </div>
  );
}
