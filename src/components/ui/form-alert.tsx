import { cn } from '@/lib/cn';

export function FormAlert({ children, tone = 'danger' }: { children: React.ReactNode; tone?: 'danger' | 'success' | 'info' }) {
  if (!children) return null;
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'rounded-[var(--radius-input)] border px-3.5 py-3 text-[15px]',
        tone === 'danger' && 'border-danger/30 bg-danger-tint text-danger',
        tone === 'success' && 'border-success/30 bg-success-tint text-success',
        tone === 'info' && 'border-line-strong bg-paper-deep text-ink',
      )}
    >
      {children}
    </p>
  );
}
