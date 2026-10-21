import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RequirePermission, useAdmin } from '@/components/admin-shell';
import { LoadError, Pager, SearchBox } from '@/components/admin-ui';
import { AccountPicker } from '@/components/account-picker';
import { PageBody, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill, storeStatus } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { formatDate, qs, useResource, type AdminStore, type AdminUser, type Paged } from '@/lib/admin';
import { api } from '@/lib/api';
import { Link, useRouter } from '@/lib/router';
import { useDebouncedValue } from '@/lib/use-debounced';
import { useSubmit } from '@/lib/use-submit';

export default function StoresPage() {
  return (
    <RequirePermission perm="stores.view">
      <Stores />
    </RequirePermission>
  );
}

function Stores() {
  const { can } = useAdmin();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebouncedValue(search.trim(), 300);
  const list = useResource<Paged<'stores', AdminStore>>(`/admin/stores${qs({ q, status, page })}`);

  return (
    <PageBody className="max-w-6xl">
      <PageHeader
        title="Stores"
        description="Every store on the platform. Open one to manage its catalogue, QR codes, orders and everything else."
        action={
          can('stores.create') && (
            <Button icon={<Plus size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setCreating(true)}>
              Create store
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBox
          label="Search store name or link"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <Select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-11 sm:w-44"
        >
          <option value="">Any status</option>
          {Object.entries(storeStatus).map(([value, s]) => (
            <option key={value} value={value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-6">
        {list.error ? (
          <LoadError onRetry={list.reload} />
        ) : !list.data ? (
          <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
        ) : list.data.stores.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-5 py-6 text-ink-2">No stores match.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
              <table className="w-full min-w-[680px] text-left text-[15px]">
                <thead className="border-b border-line text-sm text-ink-2">
                  <tr>
                    <th className="px-5 py-3 font-medium">Store</th>
                    <th className="px-3 py-3 font-medium">Owner</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Created</th>
                    <th className="px-5 py-3">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.data.stores.map((s) => {
                    const st = storeStatus[s.status] ?? { label: s.status, tone: 'neutral' as const };
                    return (
                      <tr key={s.id} className="hover:bg-paper/60">
                        <td className="max-w-[260px] px-5 py-3">
                          <Link href={`/stores/${s.id}`} className="block truncate font-semibold hover:underline hover:underline-offset-4">
                            {s.name}
                          </Link>
                          <span className="num block truncate text-ink-2">/s/{s.slug}</span>
                        </td>
                        <td className="max-w-[260px] px-3 py-3">
                          {s.owner ? (
                            <>
                              <span className="block truncate">{s.owner.name}</span>
                              <span className="block truncate text-ink-2">{s.owner.email}</span>
                              {s.owner.phone && <span className="num block truncate text-sm text-ink-3">{s.owner.phone}</span>}
                            </>
                          ) : (
                            <span className="text-ink-3">No owner</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill tone={st.tone}>{st.label}</StatusPill>
                        </td>
                        <td className="px-3 py-3 text-ink-2">{formatDate(s.createdAt)}</td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/stores/${s.id}`}
                            className="inline-flex h-9 items-center rounded-[var(--radius-btn)] border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-paper-deep"
                          >
                            Manage
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
          </>
        )}
      </div>
      {creating && <CreateStoreDialog onClose={() => setCreating(false)} />}
    </PageBody>
  );
}

const BUSINESS_TYPES: [string, string][] = [
  ['kirana', 'Grocery / kirana'],
  ['restaurant', 'Restaurant'],
  ['cafe', 'Café'],
  ['bakery', 'Bakery'],
  ['clothing', 'Clothing'],
  ['salon', 'Salon'],
  ['services', 'Services'],
  ['other', 'Something else'],
];

function CreateStoreDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { pending, fieldErrors, formError, run } = useSubmit();
  const [owner, setOwner] = useState<AdminUser | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const res = await run(() =>
      api<{ store: { id: string; name: string } }>('/admin/stores', {
        body: { ownerId: owner?.id ?? '', name: data.name, businessType: data.businessType, slug: data.slug || undefined },
      }),
    );
    if (res) {
      toast({ tone: 'success', message: `${res.store.name} created for ${owner?.name}` });
      router.push(`/stores/${res.store.id}`);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Create a store">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <p className="text-[15px] text-ink-2">
          The store starts as a draft with its own QR code. The owner sees it in their dashboard straight away.
        </p>
        <Field label="Owner" error={fieldErrors.ownerId}>
          {(f) => <AccountPicker id={f.id} value={owner} onChange={setOwner} invalid={f.invalid} />}
        </Field>
        <Field label="Store name" error={fieldErrors.name}>
          {(f) => <Input id={f.id} name="name" required maxLength={80} aria-invalid={f.invalid} />}
        </Field>
        <Field label="Business type" error={fieldErrors.businessType}>
          {(f) => (
            <Select id={f.id} name="businessType" defaultValue="kirana" aria-invalid={f.invalid}>
              {BUSINESS_TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Store link" hint="Leave empty to make one from the name." optional error={fieldErrors.slug}>
          {(f) => <Input id={f.id} name="slug" maxLength={40} placeholder="sharma-kirana" aria-invalid={f.invalid} />}
        </Field>
        <FormAlert>{Object.keys(fieldErrors).length ? '' : formError}</FormAlert>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} disabled={!owner}>
            Create store
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
