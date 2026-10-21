import { X } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/field';
import { qs, useResource, type AdminUser, type Paged } from '@/lib/admin';
import { useDebouncedValue } from '@/lib/use-debounced';

/** Search active accounts by name, email or phone and pick one. */
export function AccountPicker({
  id,
  value,
  onChange,
  invalid,
  exclude = [],
}: {
  id: string;
  value: AdminUser | null;
  onChange: (u: AdminUser | null) => void;
  invalid?: boolean;
  exclude?: string[];
}) {
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim(), 250);
  const results = useResource<Paged<'users', AdminUser>>(q.length >= 2 && !value ? `/admin/users${qs({ q, status: 'active' })}` : null);
  const options = (results.data?.users ?? []).filter((u) => !exclude.includes(u.id)).slice(0, 6);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-input)] border-[1.5px] border-line-strong bg-surface px-3 py-2">
        <span className="min-w-0">
          <span className="block truncate font-semibold">{value.name}</span>
          <span className="block truncate text-sm text-ink-2">
            {value.email}
            {value.phone ? ` · ${value.phone}` : ''}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-ink-2 hover:bg-paper"
        >
          <X size={15} strokeWidth={1.75} aria-hidden /> Change
        </button>
      </div>
    );
  }

  return (
    <div>
      <Input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Name, email or phone"
        autoComplete="off"
        aria-invalid={invalid}
        aria-autocomplete="list"
        aria-controls={`${id}-results`}
      />
      {q.length >= 2 && (
        <ul id={`${id}-results`} className="mt-1 divide-y divide-line overflow-hidden rounded-[var(--radius-input)] border border-line bg-surface">
          {options.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-ink-2">{results.data ? 'No active account matches.' : 'Searching…'}</li>
          ) : (
            options.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(u);
                    setText('');
                  }}
                  className="block w-full px-3 py-2 text-left hover:bg-paper"
                >
                  <span className="block truncate font-medium">{u.name}</span>
                  <span className="block truncate text-sm text-ink-2">
                    {u.email}
                    {u.phone ? ` · ${u.phone}` : ''}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
