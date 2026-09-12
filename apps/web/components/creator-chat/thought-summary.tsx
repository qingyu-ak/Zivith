'use client';

import { useEffect, useState } from 'react';
import { IconChevron } from '@/components/nav-icons';

/** Cursor 式回忆折叠：默认只显示「想了一下」，点开可看归档摘要。 */
export function ThoughtSummary({ note, className = '' }: { note: string; className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [note]);

  if (!note.trim()) return null;

  return (
    <div className={`px-1 pb-1 ${className}`.trim()}>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md py-0.5 text-xs text-zinc-500 transition hover:text-zinc-700"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <IconChevron
          className={`size-3.5 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        想了一下
      </button>
      {open ? <p className="mt-1 pl-4 text-xs leading-5 text-zinc-400">{note}</p> : null}
    </div>
  );
}
