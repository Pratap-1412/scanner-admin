import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-paper-deep text-ink-2 border-line-strong',
  brand: 'bg-brand-tint text-brand border-brand/25',
  success: 'bg-success-tint text-success border-success/25',
  warning: 'bg-warning-tint text-warning border-warning/25',
  danger: 'bg-danger-tint text-danger border-danger/25',
};

/** Status is always written out; colour is a second cue, never the only one. */
export function StatusPill({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-semibold leading-none whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export const storeStatus: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Not published', tone: 'neutral' },
  published: { label: 'Live', tone: 'success' },
  paused: { label: 'Paused', tone: 'warning' },
  archived: { label: 'Archived', tone: 'neutral' },
};
