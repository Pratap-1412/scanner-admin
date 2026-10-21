import { cn } from '@/lib/cn';

/** A row of mutually exclusive options; quicker than a dropdown for 2–4 choices. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex flex-wrap rounded-[10px] border border-line-strong bg-surface p-1', disabled && 'opacity-60')}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            'cursor-pointer rounded-[7px] px-3 py-1.5 text-[14px] font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink',
            value === o.value ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink',
            disabled && 'cursor-not-allowed',
          )}
          title={o.hint}
        >
          <input type="radio" className="sr-only" checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}
