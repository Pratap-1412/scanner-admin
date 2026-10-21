import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const control =
  'w-full rounded-[var(--radius-input)] border-[1.5px] border-line-strong bg-surface px-3 text-[16px] text-ink ' +
  'placeholder:text-ink-3 transition-colors duration-150 hover:border-ink-3 ' +
  'focus:outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/15 ' +
  'aria-invalid:border-danger aria-invalid:focus:ring-danger/15 disabled:bg-paper disabled:text-ink-3';

type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
};

/** Persistent label, optional hint, inline error announced to screen readers. */
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[15px] font-semibold text-ink">
        {label}
        {optional && <span className="ml-1.5 font-normal text-ink-3">(optional)</span>}
      </label>
      {hint && (
        <p id={hintId} className="-mt-0.5 text-sm text-ink-2">
          {hint}
        </p>
      )}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, 'h-12', className)} {...props} />;
}

export function Textarea({ className, rows = 3, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(control, 'py-2.5 leading-normal resize-y min-h-24', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        control,
        'h-12 appearance-none pr-10 bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2212%22%20height%3D%228%22%3E%3Cpath%20d%3D%22M1%201.5l5%205%205-5%22%20stroke%3D%22%231d2622%22%20stroke-width%3D%221.75%22%20fill%3D%22none%22/%3E%3C/svg%3E")] bg-no-repeat bg-[right_14px_center]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function PasswordInput(props: ComponentProps<'input'>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? 'text' : 'password'} className={cn('pr-20', props.className)} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink-2 hover:bg-paper"
        aria-pressed={shown}
      >
        {shown ? <EyeOff size={16} strokeWidth={1.75} aria-hidden /> : <Eye size={16} strokeWidth={1.75} aria-hidden />}
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

/** Accessible on/off switch rendered as a checkbox with role="switch". */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex items-start gap-3 cursor-pointer', disabled && 'opacity-60 cursor-not-allowed')}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          'relative mt-0.5 inline-flex h-7 w-12 shrink-0 rounded-full border-[1.5px] transition-colors duration-150',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
          checked ? 'bg-brand border-brand' : 'bg-paper-deep border-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] size-[18px] rounded-full bg-surface transition-transform duration-150 ease-[var(--ease-out)]',
            checked ? 'translate-x-[23px]' : 'translate-x-[3px]',
          )}
        />
      </span>
      <span className="flex flex-col">
        <span className="text-[15px] font-semibold">{label}</span>
        {description && <span className="text-sm text-ink-2">{description}</span>}
      </span>
    </label>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<'input'> & { label: ReactNode }) {
  return (
    <label className={cn('flex items-start gap-2.5 cursor-pointer text-[15px]', className)}>
      <input type="checkbox" className="mt-1 size-[18px] accent-[var(--brand)]" {...props} />
      <span>{label}</span>
    </label>
  );
}
