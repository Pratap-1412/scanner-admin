import { Check, Copy, RefreshCw, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { temporaryPassword } from '@/lib/admin';
import { cn } from '@/lib/cn';

export function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search size={17} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder={label} className="h-11 pl-9" />
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  if (total <= pageSize) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <div className="mt-6 flex items-center justify-between gap-4 text-[15px]">
      <p className="text-ink-2">
        <span className="num">
          {first}–{last}
        </span>{' '}
        of <span className="num">{total}</span>
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={last >= total} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-[var(--radius-card)] border border-danger/30 bg-danger-tint px-4 py-3 text-danger">
      This list didn’t load.{' '}
      <button onClick={onRetry} className="font-semibold underline underline-offset-4">
        Try again
      </button>
    </div>
  );
}

/** A bordered list with hairline dividers; rows supply their own padding. */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn('divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface', className)}>{children}</ul>;
}

/**
 * Password input with "Generate" and "Copy". Admins set temporary passwords and pass them on by
 * phone, so the value is shown in plain text rather than masked.
 */
export function TemporaryPasswordInput({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the value is visible to copy by hand */
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="num min-w-0 flex-1 basis-48 tracking-wide"
      />
      <Button
        variant="secondary"
        className="h-12"
        icon={<RefreshCw size={16} strokeWidth={1.75} aria-hidden />}
        onClick={() => onChange(temporaryPassword())}
      >
        Generate
      </Button>
      <Button
        variant="secondary"
        className="h-12"
        disabled={!value}
        onClick={copy}
        icon={copied ? <Check size={16} strokeWidth={1.75} aria-hidden /> : <Copy size={16} strokeWidth={1.75} aria-hidden />}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}
