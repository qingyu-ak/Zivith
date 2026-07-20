import { AuthForm } from '@/components/auth-form';

export default function LoginPage() {
  return (
    <div className="w-full max-w-md">
      <div className="mb-8 lg:hidden">
        ZIVITH<span className="text-accent">.</span>
      </div>
      <h1 className="text-3xl font-semibold">欢迎回来</h1>
      <p className="mb-8 mt-2 text-zinc-400">继续你的下一段故事。</p>
      <AuthForm mode="login" />
    </div>
  );
}
