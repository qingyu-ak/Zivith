import { AuthForm } from '@/components/auth-form';

export default function RegisterPage() {
  return (
    <div className="w-full max-w-md">
      <div className="mb-8 lg:hidden">
        ZIVITH<span className="text-accent">.</span>
      </div>
      <h1 className="text-3xl font-semibold">开始创作</h1>
      <p className="mb-8 mt-2 text-zinc-400">建立属于你的创意宇宙。</p>
      <AuthForm mode="register" />
    </div>
  );
}
