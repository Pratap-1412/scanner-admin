import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Link } from '@/lib/router';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap select-none rounded-[var(--radius-btn)] ' +
  'transition-[background-color,color,transform,box-shadow] duration-150 ease-[var(--ease-out)] ' +
  'disabled:opacity-55 disabled:pointer-events-none aria-disabled:opacity-55 aria-disabled:pointer-events-none';

// A 2px darker bottom edge makes buttons feel pressable without shadows or glow.
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand shadow-[inset_0_-2px_0_var(--brand-press)] hover:bg-brand-hover active:translate-y-px active:shadow-none',
  secondary:
    'bg-surface text-ink border border-line-strong shadow-[inset_0_-2px_0_var(--line)] hover:bg-paper-deep active:translate-y-px active:shadow-none',
  quiet: 'text-ink underline decoration-line-strong decoration-2 underline-offset-4 hover:decoration-ink px-1!',
  danger: 'bg-surface text-danger border border-danger/35 hover:bg-danger-tint active:translate-y-px',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-[15px]',
  lg: 'h-12 px-5 text-base',
};

type Common = { variant?: Variant; size?: Size; icon?: ReactNode; block?: boolean };

/** For elements that must be a plain <a>, such as file downloads. */
export const buttonClass = ({
  variant = 'primary',
  size = 'md',
  block,
  className,
}: {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  className?: string;
}) => cn(base, variants[variant], sizes[size], block && 'w-full', className);

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  block,
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: Common & ComponentProps<'button'> & { loading?: boolean }) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], block && 'w-full', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'primary', size = 'md', icon, block, className, children, ...props }: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], block && 'w-full', className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}

/** Three ticking dots, quieter than a spinning ring. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex gap-[3px]', className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-[5px] rounded-full bg-current animate-[tick_900ms_ease-in-out_infinite]"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
