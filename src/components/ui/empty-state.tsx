import type { ReactNode } from 'react';

/** Says why the list is empty and what will show up here. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-5 py-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <p className="mt-1 max-w-md text-ink-2">{children}</p>}
    </div>
  );
}
