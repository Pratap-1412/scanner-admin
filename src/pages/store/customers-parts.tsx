import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { LoadError, RowList, SearchBox } from '@/components/admin-ui';
import { useStoreWorkspace } from '@/components/store-context';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Textarea, Toggle } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { formatDate, qs, useResource } from '@/lib/admin';
import { api, isApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { useDebouncedValue } from '@/lib/use-debounced';
import { useSubmit } from '@/lib/use-submit';
import { Stars } from './reviews-parts';

/* ---------- Types (from api/src/modules/customers) ---------- */

export type CustomerSource = 'manual' | 'order' | 'review';

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  tags: string[];
  notes: string;
  consent: { marketing: boolean; recordedAt: string | null };
  source: { type: CustomerSource; orderId: string | null };
  orderCount: number;
  lastOrderAt: string | null;
  totalSpent: number;
  reviewCount: number;
  lastReviewAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type OrderStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'rejected' | 'cancelled';

type CustomerDetailData = {
  customer: Customer;
  orders: { id: string; publicReference: string; status: OrderStatus; grandTotal: number; currency: string; createdAt: string }[];
  reviews: {
    id: string;
    rating: number;
    comment: string;
    status: 'published' | 'hidden';
    item: { id: string; name: string } | null;
    createdAt: string;
  }[];
};

type OrderSummary = {
  id: string;
  publicReference: string;
  status: OrderStatus;
  contextLabel: string;
  grandTotal: number;
  currency: string;
  customerName: string;
  createdAt: string;
};

const ORDER_STATUS: Record<OrderStatus, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' }> = {
  pending: { label: 'New', tone: 'warning' },
  accepted: { label: 'Accepted', tone: 'brand' },
  preparing: { label: 'Preparing', tone: 'brand' },
  ready: { label: 'Ready', tone: 'success' },
  completed: { label: 'Completed', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const SOURCE_LABEL: Record<CustomerSource, string> = {
  order: 'First seen on an order',
  review: 'First seen on a review',
  manual: 'Added by hand',
};

/** "regular, office order" → ["regular", "office order"] */
export const splitTags = (text: string) =>
  text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

/** Phone numbers come back masked ("98••••••21") for people who may not see them in full. */
export const isMasked = (phone: string) => phone.includes('•');

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------- Cursor paging (the API pages with ?cursor=<last id>) ---------- */

/** A stack of cursors so the list can go forward and back. Resets when `resetKey` changes. */
export function useCursorPages(resetKey: string) {
  const [stack, setStack] = useState<string[]>([]);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setStack([]);
  }
  return {
    cursor: stack.at(-1),
    page: stack.length + 1,
    next: (cursor: string) => setStack((s) => [...s, cursor]),
    prev: () => setStack((s) => s.slice(0, -1)),
  };
}

export function CursorPager({
  page,
  nextCursor,
  onNext,
  onPrev,
  newerLabel = 'Previous',
  olderLabel = 'Next',
}: {
  page: number;
  nextCursor: string | null;
  onNext: (cursor: string) => void;
  onPrev: () => void;
  newerLabel?: string;
  olderLabel?: string;
}) {
  if (page === 1 && !nextCursor) return null;
  return (
    <div className="mt-6 flex items-center justify-between gap-4 text-[15px]">
      <p className="text-ink-2">
        Page <span className="num">{page}</span>
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={onPrev}>
          {newerLabel}
        </Button>
        <Button variant="secondary" size="sm" disabled={!nextCursor} onClick={() => nextCursor && onNext(nextCursor)}>
          {olderLabel}
        </Button>
      </div>
    </div>
  );
}

/* ---------- Add a customer ---------- */

export function AddCustomerDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: Customer) => void }) {
  const { storeId } = useStoreWorkspace();
  const toast = useToast();
  const { pending, fieldErrors, formError, run } = useSubmit();
  const [marketing, setMarketing] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const body = {
      name: fd.name ?? '',
      phone: fd.phone ?? '',
      email: fd.email ?? '',
      notes: fd.notes ?? '',
      tags: splitTags(fd.tags ?? ''),
      consent: { marketing },
    };
    const res = await run(() => api<{ customer: Customer }>(`/stores/${storeId}/customers`, { body }));
    if (res) {
      toast({ tone: 'success', message: `${res.customer.name || 'Customer'} added` });
      form.reset();
      setMarketing(false);
      onCreated(res.customer);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a customer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-customer" loading={pending}>
            Add customer
          </Button>
        </>
      }
    >
      <form id="add-customer" onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Name" error={fieldErrors.name}>
          {(f) => <Input id={f.id} name="name" maxLength={80} autoComplete="off" aria-invalid={f.invalid} aria-describedby={f.describedBy} />}
        </Field>
        <Field
          label="Phone number"
          optional
          hint="Customers are matched by phone, so later orders and reviews with this number join this record."
          error={fieldErrors.phone}
        >
          {(f) => (
            <Input id={f.id} name="phone" type="tel" inputMode="tel" autoComplete="off" aria-invalid={f.invalid} aria-describedby={f.describedBy} />
          )}
        </Field>
        <Field label="Email" optional error={fieldErrors.email}>
          {(f) => <Input id={f.id} name="email" type="email" autoComplete="off" aria-invalid={f.invalid} aria-describedby={f.describedBy} />}
        </Field>
        <Field label="Tags" optional hint="Separate with commas, like “regular, office order”. Up to 10." error={fieldErrors.tags}>
          {(f) => <Input id={f.id} name="tags" autoComplete="off" aria-invalid={f.invalid} aria-describedby={f.describedBy} />}
        </Field>
        <Field label="Notes" optional error={fieldErrors.notes}>
          {(f) => <Textarea id={f.id} name="notes" maxLength={1000} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}
        </Field>
        <Checkbox checked={marketing} onChange={(e) => setMarketing(e.target.checked)} label="They agreed to hear about offers" />
        <FormAlert>{formError}</FormAlert>
      </form>
    </Dialog>
  );
}

/* ---------- Save a customer from an order ---------- */

export function FromOrderDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (c: Customer) => void }) {
  const { storeId, store } = useStoreWorkspace();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const orders = useResource<{ orders: OrderSummary[] }>(open ? `/stores/${storeId}/orders${qs({ q, limit: 10 })}` : null);
  const [picked, setPicked] = useState<OrderSummary | null>(null);
  const [tags, setTags] = useState('');
  const [marketing, setMarketing] = useState(false);
  const { pending, fieldErrors, formError, run } = useSubmit();

  function close() {
    setPicked(null);
    setTags('');
    setMarketing(false);
    onClose();
  }

  async function save() {
    if (!picked) return;
    const res = await run(() =>
      api<{ customer: Customer }>(`/stores/${storeId}/customers/from-order/${picked.id}`, {
        body: { tags: splitTags(tags), ...(marketing ? { marketing: true } : {}) },
      }),
    );
    if (res) {
      toast({ tone: 'success', message: `Saved ${res.customer.name || 'the customer'} from order ${picked.publicReference}` });
      setPicked(null);
      setTags('');
      setMarketing(false);
      onSaved(res.customer);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Save a customer from an order"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!picked} loading={pending}>
            Save customer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[15px] text-ink-2">
          Uses the name, phone and email on the order. If a customer with that phone number is already saved, the order is linked to them instead.
        </p>
        <SearchBox label="Order number or name" value={search} onChange={setSearch} />
        {orders.error ? (
          <LoadError onRetry={orders.reload} />
        ) : !orders.data ? (
          <Skeleton className="h-40 w-full" />
        ) : orders.data.orders.length === 0 ? (
          <p className="text-ink-2">No orders match.</p>
        ) : (
          <fieldset>
            <legend className="sr-only">Order</legend>
            <RowList className="max-h-72 overflow-y-auto">
              {orders.data.orders.map((o) => (
                <li key={o.id}>
                  <label className={cn('flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-paper', picked?.id === o.id && 'bg-paper')}>
                    <input
                      type="radio"
                      name="from-order"
                      checked={picked?.id === o.id}
                      onChange={() => setPicked(o)}
                      className="size-[18px] shrink-0 accent-[var(--brand)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{o.customerName || 'No name on order'}</span>
                      <span className="block truncate text-sm text-ink-2">
                        <span className="num">{o.publicReference}</span> · {formatDate(o.createdAt)}
                      </span>
                    </span>
                    <span className="num shrink-0 text-sm">{formatMoney(o.grandTotal, o.currency || store.currency)}</span>
                  </label>
                </li>
              ))}
            </RowList>
          </fieldset>
        )}
        <Field label="Tags" optional hint="Separate with commas. Added to any tags they already have." error={fieldErrors.tags}>
          {(f) => (
            <Input id={f.id} value={tags} onChange={(e) => setTags(e.target.value)} aria-invalid={f.invalid} aria-describedby={f.describedBy} />
          )}
        </Field>
        <Checkbox checked={marketing} onChange={(e) => setMarketing(e.target.checked)} label="They agreed to hear about offers" />
        <FormAlert>{formError}</FormAlert>
      </div>
    </Dialog>
  );
}

/* ---------- One customer ---------- */

export function CustomerDetail({ customerId, onBack }: { customerId: string; onBack: () => void }) {
  const { storeId } = useStoreWorkspace();
  const res = useResource<CustomerDetailData>(`/stores/${storeId}/customers/${customerId}`);

  return (
    <div className="max-w-3xl">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden /> All customers
      </button>
      <div className="mt-4">
        {res.error ? (
          isApiError(res.error) && res.error.status === 404 ? (
            <p className="text-ink-2">This customer isn’t saved any more.</p>
          ) : (
            <LoadError onRetry={res.reload} />
          )
        ) : !res.data ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <CustomerView key={res.data.customer.updatedAt} data={res.data} onSaved={res.reload} onDeleted={onBack} />
        )}
      </div>
    </div>
  );
}

function CustomerView({ data, onSaved, onDeleted }: { data: CustomerDetailData; onSaved: () => void; onDeleted: () => void }) {
  const { storeId, store, can } = useStoreWorkspace();
  const toast = useToast();
  const c = data.customer;
  const editable = can('customers.manage');
  const masked = isMasked(c.phone);
  const [v, setV] = useState({
    name: c.name,
    phone: c.phone,
    email: c.email,
    tags: c.tags.join(', '),
    notes: c.notes,
    marketing: c.consent.marketing,
  });
  const [confirming, setConfirming] = useState(false);
  const save = useSubmit();
  const del = useSubmit();

  // Only changed fields go up: a record saved from a review may have no name, and resending "" would fail.
  const changes: Record<string, unknown> = {};
  if (v.name !== c.name) changes.name = v.name;
  if (!masked && v.phone !== c.phone) changes.phone = v.phone;
  if (v.email !== c.email) changes.email = v.email;
  if (v.notes !== c.notes) changes.notes = v.notes;
  if (splitTags(v.tags).join(',') !== c.tags.join(',')) changes.tags = splitTags(v.tags);
  if (v.marketing !== c.consent.marketing) changes.consent = { marketing: v.marketing };
  const dirty = Object.keys(changes).length > 0;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    const ok = await save.run(() => api(`/stores/${storeId}/customers/${c.id}`, { method: 'PATCH', body: changes }));
    if (ok) {
      toast({ tone: 'success', message: 'Customer saved' });
      onSaved();
    }
  }

  async function onDelete() {
    const ok = await del.run(() => api(`/stores/${storeId}/customers/${c.id}`, { method: 'DELETE' }));
    if (ok) {
      setConfirming(false);
      toast({ tone: 'success', message: `${c.name || 'Customer'} deleted` });
      onDeleted();
    }
  }

  const stats = [
    { term: 'Orders', detail: String(c.orderCount) },
    { term: 'Spent', detail: formatMoney(c.totalSpent ?? 0, store.currency), hint: 'Completed orders only' },
    { term: 'Reviews', detail: String(c.reviewCount ?? 0) },
    { term: 'Last seen', detail: formatDate(c.lastSeenAt) },
  ];

  return (
    <>
      <h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{c.name || 'No name'}</h2>
      <p className="mt-1 text-[15px] text-ink-2">
        {SOURCE_LABEL[c.source.type]} on {formatDate(c.createdAt)} ·{' '}
        {c.consent.marketing ? `agreed to offers${c.consent.recordedAt ? ` on ${formatDate(c.consent.recordedAt)}` : ''}` : 'no marketing consent'}
      </p>
      {c.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
          {c.tags.map((t) => (
            <li key={t} className="rounded-full border border-line-strong bg-surface px-2.5 py-0.5 text-sm font-medium">
              {t}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-4">
        {stats.map((x) => (
          <div key={x.term} className="bg-surface px-4 py-3">
            <dt className="text-sm text-ink-2" title={x.hint}>
              {x.term}
            </dt>
            <dd className="num text-lg font-semibold">{x.detail}</dd>
          </div>
        ))}
      </dl>

      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[15px]">
        <dt className="text-ink-2">Phone</dt>
        <dd className="num min-w-0 truncate">
          {c.phone && !masked ? (
            <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="underline underline-offset-4">
              {c.phone}
            </a>
          ) : (
            c.phone || '—'
          )}
        </dd>
        <dt className="text-ink-2">Email</dt>
        <dd className="min-w-0 truncate">
          {c.email ? (
            <a href={`mailto:${c.email}`} className="underline underline-offset-4">
              {c.email}
            </a>
          ) : (
            '—'
          )}
        </dd>
        <dt className="text-ink-2">Last order</dt>
        <dd>{formatDate(c.lastOrderAt)}</dd>
        {!editable && (
          <>
            <dt className="text-ink-2">Notes</dt>
            <dd className="whitespace-pre-line">{c.notes || '—'}</dd>
          </>
        )}
      </dl>

      {editable && (
        <form onSubmit={onSave} noValidate className="mt-8 space-y-5 border-t border-line pt-6">
          <h2 className="text-lg font-semibold">Details</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" error={save.fieldErrors.name}>
              {(f) => (
                <Input id={f.id} value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} aria-invalid={f.invalid} />
              )}
            </Field>
            <Field
              label="Phone number"
              hint={
                masked ? 'Your role shows this number masked, so it can’t be changed here.' : 'Orders and reviews with this number join this record.'
              }
              error={save.fieldErrors.phone}
            >
              {(f) => (
                <Input
                  id={f.id}
                  type="tel"
                  inputMode="tel"
                  value={v.phone}
                  disabled={masked}
                  onChange={(e) => setV({ ...v, phone: e.target.value })}
                  aria-invalid={f.invalid}
                  aria-describedby={f.describedBy}
                  className="num"
                />
              )}
            </Field>
          </div>
          <Field label="Email" optional error={save.fieldErrors.email}>
            {(f) => <Input id={f.id} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} aria-invalid={f.invalid} />}
          </Field>
          <Field label="Tags" optional hint="Separate with commas. Up to 10." error={save.fieldErrors.tags}>
            {(f) => (
              <Input
                id={f.id}
                value={v.tags}
                onChange={(e) => setV({ ...v, tags: e.target.value })}
                aria-invalid={f.invalid}
                aria-describedby={f.describedBy}
              />
            )}
          </Field>
          <Field label="Notes" optional hint="Only people who work on this store see these." error={save.fieldErrors.notes}>
            {(f) => (
              <Textarea
                id={f.id}
                value={v.notes}
                maxLength={1000}
                onChange={(e) => setV({ ...v, notes: e.target.value })}
                aria-invalid={f.invalid}
                aria-describedby={f.describedBy}
              />
            )}
          </Field>
          <Toggle
            checked={v.marketing}
            onChange={(m) => setV({ ...v, marketing: m })}
            label="Agreed to hear about offers"
            description="Change this only when the customer says so."
          />
          <FormAlert>{save.formError}</FormAlert>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={!dirty} loading={save.pending}>
              Save changes
            </Button>
            <Button variant="danger" className="ml-auto" onClick={() => setConfirming(true)}>
              Delete customer
            </Button>
          </div>
        </form>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Orders</h2>
        {data.orders.length === 0 ? (
          <p className="mt-2 text-ink-2">No orders linked to this customer.</p>
        ) : (
          <>
            <RowList className="mt-3">
              {data.orders.map((o) => {
                const st = ORDER_STATUS[o.status] ?? { label: o.status, tone: 'neutral' as const };
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <span className="num font-semibold">{o.publicReference}</span>
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    <span className="num ml-auto">{formatMoney(o.grandTotal, o.currency || store.currency)}</span>
                    <span className="num w-28 text-right text-sm text-ink-2">{formatDate(o.createdAt)}</span>
                  </li>
                );
              })}
            </RowList>
            {c.orderCount > data.orders.length && (
              <p className="mt-2 text-sm text-ink-2">
                Showing the latest {data.orders.length} of {plural(c.orderCount, 'order')}.
              </p>
            )}
          </>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Reviews</h2>
        {data.reviews.length === 0 ? (
          <p className="mt-2 text-ink-2">No reviews linked to this customer.</p>
        ) : (
          <RowList className="mt-3">
            {data.reviews.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Stars value={r.rating} size={15} />
                  <span className="text-sm font-semibold">{r.item ? r.item.name : 'The store'}</span>
                  <span className="text-sm text-ink-2">{formatDate(r.createdAt)}</span>
                  {r.status === 'hidden' && <StatusPill className="ml-auto">Hidden</StatusPill>}
                </div>
                {r.comment && <p className="mt-1 whitespace-pre-line text-[15px]">{r.comment}</p>}
              </li>
            ))}
          </RowList>
        )}
      </section>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={onDelete}
        loading={del.pending}
        title={`Delete ${c.name || 'this customer'}?`}
        confirmLabel="Delete customer"
      >
        <p>
          The record, its notes and tags are removed. Past orders and reviews stay, with the details given at the time. If they order or review again
          with this number, a new record starts.
        </p>
        {del.formError && (
          <div className="mt-3">
            <FormAlert>{del.formError}</FormAlert>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
