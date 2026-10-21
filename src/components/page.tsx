import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="display text-[32px] [overflow-wrap:anywhere] sm:text-[38px]">{title}</h1>
        {description && <div className="mt-1.5 text-ink-2">{description}</div>}
      </div>
      {action}
    </div>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10', className)}>{children}</div>;
}
