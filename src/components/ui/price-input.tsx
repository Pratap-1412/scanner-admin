import { useState, type ComponentProps } from 'react';
import { minorToInput, parseMoney } from '@/lib/money';
import { cn } from '@/lib/cn';

/** Rupee input that reports minor units (paise), or null when empty or invalid. */
export function PriceInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & { value: number | null; onValueChange: (minor: number | null) => void }) {
  const [text, setText] = useState(minorToInput(value));
  const [seen, setSeen] = useState(value);
  // Something typed that isn't a price stays on screen, marked, rather than turning into ₹0.
  const unreadable = text.trim() !== '' && parseMoney(text) === null;
  // Sync when the value changes from outside (form reset, loaded data).
  if (!Object.is(value, seen)) {
    setSeen(value);
    if (!unreadable && parseMoney(text) !== value) setText(minorToInput(value));
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden>
        ₹
      </span>
      <input
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onValueChange(e.target.value.trim() === '' ? null : parseMoney(e.target.value));
        }}
        className={cn(
          'num h-12 w-full rounded-[var(--radius-input)] border-[1.5px] border-line-strong bg-surface pl-7 pr-3 text-[16px]',
          'hover:border-ink-3 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/15 aria-invalid:border-danger',
          className,
        )}
        {...props}
        {...(unreadable ? { 'aria-invalid': true } : {})}
      />
      {unreadable && (
        <p className="mt-1 text-sm font-medium text-danger" role="alert">
          Enter a price like 20 or 49.50
        </p>
      )}
    </div>
  );
}
