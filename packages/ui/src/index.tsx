import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

const join = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(' ');

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-[#3d5aee]',
    secondary: 'border border-line bg-white text-zinc-800 hover:bg-zinc-50',
    danger: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
    ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
  };
  return (
    <button
      className={join(
        'inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={join(
        'min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-accent focus:ring-2 focus:ring-accent/20',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={join(
        'min-h-28 w-full rounded-lg border border-line bg-white px-3 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-accent focus:ring-2 focus:ring-accent/20',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={join(
        'min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-zinc-900 outline-none focus:border-accent',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm text-zinc-600">
      <span className="font-medium text-zinc-800">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={join('rounded-xl border border-line bg-white p-5', className)}>
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning';
}) {
  const styles = {
    neutral: 'bg-zinc-100 text-zinc-600',
    success: 'bg-accent/10 text-accent',
    warning: 'bg-amber-100 text-amber-800',
  };
  return (
    <span className={join('inline-flex rounded-full px-2.5 py-1 text-xs', styles[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-line p-8 text-center">
      <div className="max-w-sm">
        <div
          className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-zinc-100 text-xl"
          aria-hidden
        >
          ◇
        </div>
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = '正在加载' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-zinc-500" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-zinc-200 border-t-accent" />
      <span>{label}</span>
    </div>
  );
}
