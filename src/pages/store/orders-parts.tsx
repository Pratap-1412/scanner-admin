import { Phone, RefreshCw, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useStoreWorkspace } from '@/components/store-context';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { useResource } from '@/lib/admin';
import { api, isApiError } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { useSubmit } from '@/lib/use-submit';

// Shapes from api/src/modules/orders/order.model.ts and order.routes.ts.

export type OrderStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'rejected' | 'cancelled';
export type FulfilmentType = 'pickup' | 'dine_in' | 'delivery';
export type PaidVia = 'cash' | 'upi' | 'card' | 'other';

/** A row in GET /orders (orderSummary on the server). */
export type OrderRow = {
  id: string;
  publicReference: string;
  status: OrderStatus;
  contextType: string;
  contextLabel: string;
  fulfilmentType: FulfilmentType;
  itemCount: number;
  items: { name: string; variantName: string; quantity: number }[];
  grandTotal: number;
  currency: string;
  paymentStatus: 'unpaid' | 'paid';
  customerName: string;
  scheduledFor: string | null;
  seen: boolean;
  createdAt: string;
  updatedAt: string;
};

/** GET /orders/:orderId, the full document as staff see it. */
export type Order = {
  id: string;
  storeId: string;
  publicReference: string;
  status: OrderStatus;
  contextType: string;
  contextLabel: string;
  items: {
    itemId: string;
    name: string;
    variantId: string | null;
    variantName: string;
    unitPrice: number;
    addOns: { addOnId: string; name: string; price: number }[];
    quantity: number;
    note: string;
    lineTotal: number;
  }[];
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  taxTotal: number;
  grandTotal: number;
  currency: string;
  pricesIncludeTax: boolean;
  promoCode: string | null;
  customerDetails: { name: string; phone: string; email: string };
  customerId: string | null;
  customerNote: string;
  fulfilmentType: FulfilmentType;
  deliveryAddress: string;
  scheduledFor: string | null;
  paymentMethod: 'pay_at_store' | 'cash_on_delivery';
  paymentStatus: 'unpaid' | 'paid';
  paidVia: PaidVia | null;
  paidAt: string | null;
  statusHistory: { status: OrderStatus; at: string; byUserId: string | null; by: 'store' | 'customer' | 'system' | string; reason?: string }[];
  internalNotes: { text: string; byUserId: string; byName: string; at: string }[];
  seenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'New',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const STATUS_TONE: Record<OrderStatus, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  accepted: 'brand',
  preparing: 'brand',
  ready: 'success',
  completed: 'neutral',
  rejected: 'danger',
  cancelled: 'danger',
};

export const FULFILMENT_LABEL: Record<string, string> = { pickup: 'Pickup', dine_in: 'Dine-in', delivery: 'Delivery' };
const PAID_VIA_LABEL: Record<PaidVia, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', other: 'Other' };
const PAYMENT_METHOD_LABEL: Record<Order['paymentMethod'], string> = { pay_at_store: 'Pay at the store', cash_on_delivery: 'Cash on delivery' };

/** TRANSITIONS in order.model.ts. The server rejects anything else with INVALID_TRANSITION. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['preparing', 'ready', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
};

const ACTION_LABEL: Record<OrderStatus, string> = {
  pending: 'Mark new',
  accepted: 'Accept',
  preparing: 'Start preparing',
  ready: 'Mark ready',
  completed: 'Complete',
  rejected: 'Reject order',
  cancelled: 'Cancel order',
};

const DESTRUCTIVE = (s: OrderStatus) => s === 'rejected' || s === 'cancelled';

/** Dates and times in the store's own time zone, which may differ from the admin's. */
export function storeTime(timeZone: string) {
  const dateTime = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone });
  const time = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone });
  return {
    dateTime: (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : '—'),
    time: (iso: string | null | undefined) => (iso ? time.format(new Date(iso)) : '—'),
  };
}

/** Calls `fn` every `ms` while the tab is visible. */
export function usePoll(fn: () => void, ms = 20_000, active = true) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (!document.hidden) ref.current();
    }, ms);
    return () => clearInterval(t);
  }, [ms, active]);
}

export function OrderDetailDialog({ orderId, onClose, onChanged }: { orderId: string; onClose: () => void; onChanged: () => void }) {
  const { storeId, store, can } = useStoreWorkspace();
  const toast = useToast();
  const path = `/stores/${storeId}/orders/${orderId}`;
  const detail = useResource<{ order: Order }>(path);
  usePoll(detail.reload);
  const move = useSubmit();
  const payment = useSubmit();
  const notes = useSubmit();
  const saveCustomer = useSubmit();
  const [reasonFor, setReasonFor] = useState<OrderStatus | null>(null);
  const [movingTo, setMovingTo] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const manage = can('orders.manage');
  const t = storeTime(store.timezone);
  const o = detail.data?.order;

  function changed() {
    detail.reload();
    onChanged();
  }

  async function transition(to: OrderStatus, why = '') {
    setMovingTo(to);
    const res = await move.run(
      () => api<{ order: Order }>(`${path}/status`, { method: 'PATCH', body: { status: to, ...(why ? { reason: why } : {}) } }),
      (err) => {
        // Someone else moved it first: show the latest state along with the message.
        if (err.code === 'INVALID_TRANSITION') changed();
        return false;
      },
    );
    setMovingTo(null);
    if (res) {
      setReasonFor(null);
      setReason('');
      changed();
      toast({ tone: 'success', message: `Order ${res.order.publicReference} is now ${STATUS_LABEL[to].toLowerCase()}` });
    }
  }

  async function markPaid(paid: boolean, via?: PaidVia) {
    const res = await payment.run(() => api<{ order: Order }>(`${path}/payment`, { method: 'PATCH', body: paid ? { paid, via } : { paid } }));
    if (res) {
      changed();
      toast({ tone: 'success', message: paid ? 'Marked as paid' : 'Marked as not paid' });
    }
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    const res = await notes.run(() => api<{ order: Order }>(`${path}/notes`, { body: { text: note.trim() } }));
    if (res) {
      setNote('');
      detail.reload();
    }
  }

  async function onSaveCustomer() {
    const res = await saveCustomer.run(() => api(`/stores/${storeId}/customers/from-order/${orderId}`, { body: { marketing } }));
    if (res) {
      setSaveOpen(false);
      setMarketing(false);
      detail.reload();
      toast({ tone: 'success', message: 'Saved to the customer list' });
    }
  }

  const next = o ? TRANSITIONS[o.status] : [];
  const forward = next.filter((s) => !DESTRUCTIVE(s));
  const destructive = next.filter(DESTRUCTIVE);
  const money = (n: number) => formatMoney(n, o?.currency ?? store.currency);

  return (
    <>
      <Dialog open onClose={onClose} title={o ? `Order ${o.publicReference}` : 'Order'} className="w-[min(100%-2rem,58rem)]!">
        {detail.error && !o ? (
          <div role="alert" className="text-danger">
            {isApiError(detail.error) && detail.error.status === 404 ? 'This order doesn’t exist any more.' : 'This order didn’t load.'}{' '}
            {!(isApiError(detail.error) && detail.error.status === 404) && (
              <button onClick={detail.reload} className="font-semibold underline underline-offset-4">
                Try again
              </button>
            )}
          </div>
        ) : !o ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="num text-2xl font-bold tracking-tight">{o.publicReference}</span>
                  <StatusPill tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</StatusPill>
                </div>
                <p className="mt-1 text-[15px] text-ink-2">
                  {o.contextLabel ? `${o.contextLabel} · ` : ''}
                  {FULFILMENT_LABEL[o.fulfilmentType] ?? o.fulfilmentType} · placed <span className="num">{t.dateTime(o.createdAt)}</span>
                </p>
                {o.scheduledFor && (
                  <p className="mt-1 text-[15px] font-semibold text-warning">
                    Wanted for <span className="num">{t.dateTime(o.scheduledFor)}</span>
                  </p>
                )}
              </div>
              <Button variant="secondary" size="sm" onClick={detail.reload} icon={<RefreshCw size={15} strokeWidth={1.75} aria-hidden />}>
                Refresh
              </Button>
            </div>

            {manage && next.length > 0 && (
              <div className="flex flex-wrap gap-2 rounded-[var(--radius-card)] border border-line bg-paper p-3">
                {forward.map((s, i) => (
                  <Button
                    key={s}
                    variant={i === 0 ? 'primary' : 'secondary'}
                    loading={movingTo === s}
                    disabled={move.pending}
                    onClick={() => transition(s)}
                  >
                    {ACTION_LABEL[s]}
                  </Button>
                ))}
                <span className="flex flex-wrap gap-2 sm:ml-auto">
                  {destructive.map((s) => (
                    <Button
                      key={s}
                      variant="danger"
                      disabled={move.pending}
                      onClick={() => {
                        move.setFormError('');
                        setReasonFor(s);
                      }}
                    >
                      {ACTION_LABEL[s]}
                    </Button>
                  ))}
                </span>
              </div>
            )}
            {!reasonFor && move.formError && <FormAlert>{move.formError}</FormAlert>}

            <div className="grid gap-6 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <div className="space-y-6">
                <section aria-labelledby="order-items-h" className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3.5">
                  <h2 id="order-items-h" className="text-lg font-semibold">
                    Items
                  </h2>
                  <ul className="mt-2 divide-y divide-line text-[15px]">
                    {o.items.map((l, i) => (
                      <li key={i} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] gap-x-2 py-2">
                        <span className="num font-bold">{l.quantity}×</span>
                        <span className="min-w-0">
                          <span className="font-semibold [overflow-wrap:anywhere]">{l.name}</span>
                          {l.variantName && <span className="block text-ink-2">{l.variantName}</span>}
                          {l.addOns.map((a, j) => (
                            <span key={j} className="block text-ink-2">
                              + {a.name}
                              {a.price > 0 && <span className="num text-ink-3"> ({money(a.price)})</span>}
                            </span>
                          ))}
                          {l.quantity > 1 && <span className="num block text-sm text-ink-3">{money(l.unitPrice)} each</span>}
                          {l.note && <span className="mt-0.5 block rounded-sm bg-accent-tint px-1.5 text-ink">“{l.note}”</span>}
                        </span>
                        <span className="num text-right">{money(l.lineTotal)}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-2 space-y-1 border-t border-line pt-3 text-[15px]">
                    <Line label="Subtotal" value={money(o.subtotal)} />
                    {o.discountTotal > 0 && (
                      <Line
                        label={
                          o.promoCode ? (
                            <>
                              Discount (promo <span className="num">{o.promoCode}</span>)
                            </>
                          ) : (
                            'Discount'
                          )
                        }
                        value={`−${money(o.discountTotal)}`}
                        className="text-success"
                      />
                    )}
                    {o.deliveryFee > 0 && <Line label="Delivery fee" value={money(o.deliveryFee)} />}
                    {o.taxTotal > 0 && <Line label={o.pricesIncludeTax ? 'Tax (included)' : 'Tax'} value={money(o.taxTotal)} />}
                    <Line label="Total" value={money(o.grandTotal)} className="pt-1 text-lg font-bold" />
                  </dl>
                  {o.taxTotal === 0 && (
                    <p className="mt-1 text-sm text-ink-3">{o.pricesIncludeTax ? 'Prices include tax.' : 'Prices exclude tax.'}</p>
                  )}
                </section>

                <section aria-labelledby="order-pay-h">
                  <h2 id="order-pay-h" className="text-lg font-semibold">
                    Payment
                  </h2>
                  <p className="mt-1 text-[15px] text-ink-2">
                    {PAYMENT_METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}. Payment is taken by the shop, not online.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {o.paymentStatus === 'paid' ? (
                      <>
                        <StatusPill tone="success">Paid{o.paidVia ? ` · ${PAID_VIA_LABEL[o.paidVia]}` : ''}</StatusPill>
                        {o.paidAt && <span className="num text-sm text-ink-2">{t.dateTime(o.paidAt)}</span>}
                        {manage && (
                          <Button variant="quiet" size="sm" loading={payment.pending} onClick={() => markPaid(false)}>
                            Mark as not paid
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <StatusPill tone="neutral">Not paid</StatusPill>
                        {manage && (
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-ink-2">Mark paid by</span>
                            {(['cash', 'upi', 'card', 'other'] as const).map((via) => (
                              <Button key={via} variant="secondary" size="sm" disabled={payment.pending} onClick={() => markPaid(true, via)}>
                                {PAID_VIA_LABEL[via]}
                              </Button>
                            ))}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {payment.formError && (
                    <div className="mt-2">
                      <FormAlert>{payment.formError}</FormAlert>
                    </div>
                  )}
                </section>
              </div>

              <div className="space-y-6">
                <section aria-labelledby="order-cust-h">
                  <h2 id="order-cust-h" className="text-lg font-semibold">
                    Customer
                  </h2>
                  {o.customerDetails.name || o.customerDetails.phone || o.customerDetails.email ? (
                    <div className="mt-1 space-y-0.5 text-[15px]">
                      {o.customerDetails.name && <p className="font-semibold [overflow-wrap:anywhere]">{o.customerDetails.name}</p>}
                      {o.customerDetails.phone && (
                        <a href={`tel:${o.customerDetails.phone}`} className="num inline-flex items-center gap-1.5 underline underline-offset-4">
                          <Phone size={15} strokeWidth={1.75} aria-hidden /> {o.customerDetails.phone}
                        </a>
                      )}
                      {o.customerDetails.email && <p className="text-ink-2 [overflow-wrap:anywhere]">{o.customerDetails.email}</p>}
                    </div>
                  ) : (
                    <p className="mt-1 text-[15px] text-ink-2">No details given.</p>
                  )}
                  {o.customerNote && (
                    <p className="mt-2 rounded-[var(--radius-input)] bg-paper-deep px-3 py-2 text-[15px] [overflow-wrap:anywhere]">
                      <span className="block text-sm text-ink-2">Note from the customer</span>“{o.customerNote}”
                    </p>
                  )}
                  {o.customerId ? (
                    <p className="mt-2 text-sm text-ink-2">Saved in this store’s customer list.</p>
                  ) : (
                    can('customers.manage') &&
                    (o.customerDetails.name || o.customerDetails.phone) && (
                      <Button
                        className="mt-2"
                        variant="secondary"
                        size="sm"
                        onClick={() => setSaveOpen(true)}
                        icon={<UserPlus size={15} strokeWidth={1.75} aria-hidden />}
                      >
                        Save as customer
                      </Button>
                    )
                  )}
                </section>

                <section aria-labelledby="order-ful-h">
                  <h2 id="order-ful-h" className="text-lg font-semibold">
                    Fulfilment
                  </h2>
                  <dl className="mt-1 space-y-1 text-[15px]">
                    <Line label="Type" value={FULFILMENT_LABEL[o.fulfilmentType] ?? o.fulfilmentType} plain />
                    {o.contextLabel && <Line label="From" value={o.contextLabel} plain />}
                    {o.scheduledFor && <Line label="Wanted for" value={t.dateTime(o.scheduledFor)} />}
                    {o.fulfilmentType === 'delivery' && <Line label="Address" value={o.deliveryAddress || 'Not given'} plain />}
                  </dl>
                </section>

                <section aria-labelledby="order-hist-h">
                  <h2 id="order-hist-h" className="text-lg font-semibold">
                    History
                  </h2>
                  <ol className="mt-2 space-y-2 border-l-2 border-line pl-4 text-[15px]">
                    <li>
                      <span className="font-semibold">Placed</span> <span className="num text-ink-2">{t.dateTime(o.createdAt)}</span>
                    </li>
                    {o.statusHistory
                      .filter((h, i) => !(i === 0 && h.status === 'pending'))
                      .map((h, i) => (
                        <li key={i}>
                          <span className="font-semibold">{STATUS_LABEL[h.status] ?? h.status}</span>{' '}
                          <span className="num text-ink-2">{t.dateTime(h.at)}</span>
                          <span className="text-ink-2">
                            {h.by === 'customer'
                              ? ' · by the customer'
                              : h.by === 'system'
                                ? ' · automatically'
                                : h.by === 'store'
                                  ? ' · by the shop'
                                  : ''}
                          </span>
                          {h.reason && <span className="block text-ink-2 [overflow-wrap:anywhere]">{h.reason}</span>}
                        </li>
                      ))}
                  </ol>
                </section>

                <section aria-labelledby="order-notes-h">
                  <h2 id="order-notes-h" className="text-lg font-semibold">
                    Internal notes
                  </h2>
                  <p className="text-sm text-ink-2">The customer never sees these.</p>
                  {o.internalNotes.length > 0 ? (
                    <ul className="mt-2 space-y-2">
                      {o.internalNotes.map((n, i) => (
                        <li key={i} className="rounded-[var(--radius-input)] border border-line bg-surface px-3 py-2 text-[15px]">
                          <span className="whitespace-pre-line [overflow-wrap:anywhere]">{n.text}</span>
                          <span className="mt-0.5 block text-[13px] text-ink-3">
                            {n.byName || 'Someone'} · <span className="num">{t.dateTime(n.at)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[15px] text-ink-3">No notes yet.</p>
                  )}
                  {manage && (
                    <form onSubmit={addNote} className="mt-3">
                      <div className="flex gap-2">
                        <Input
                          aria-label="New internal note"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          maxLength={500}
                          placeholder="e.g. Customer called, running 10 min late"
                          aria-invalid={Boolean(notes.fieldErrors.text) || undefined}
                          className="h-11 min-w-0 flex-1"
                        />
                        <Button type="submit" variant="secondary" loading={notes.pending} disabled={!note.trim()}>
                          Add note
                        </Button>
                      </div>
                      {(notes.fieldErrors.text || notes.formError) && (
                        <div className="mt-2">
                          <FormAlert>{notes.fieldErrors.text || notes.formError}</FormAlert>
                        </div>
                      )}
                    </form>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={reasonFor !== null}
        onClose={() => {
          setReasonFor(null);
          move.setFormError('');
        }}
        title={reasonFor === 'rejected' ? `Reject order ${o?.publicReference ?? ''}?` : `Cancel order ${o?.publicReference ?? ''}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReasonFor(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={move.pending} onClick={() => reasonFor && transition(reasonFor, reason.trim())}>
              {reasonFor === 'rejected' ? 'Reject order' : 'Cancel order'}
            </Button>
          </>
        }
      >
        <p className="mb-4 text-ink-2">Stock and any promo use this order held go back to the store. This can’t be undone.</p>
        <Field label="Reason" optional hint="The customer sees this on their order page.">
          {(f) => (
            <Textarea
              id={f.id}
              aria-describedby={f.describedBy}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="e.g. Sorry, we’ve run out of samosas"
            />
          )}
        </Field>
        {move.formError && (
          <div className="mt-3">
            <FormAlert>{move.formError}</FormAlert>
          </div>
        )}
      </Dialog>

      <Dialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save as customer"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>
              Not now
            </Button>
            <Button loading={saveCustomer.pending} onClick={onSaveCustomer}>
              Save customer
            </Button>
          </>
        }
      >
        <p className="text-ink-2">
          {o?.customerDetails.name} {o?.customerDetails.phone && `· ${o.customerDetails.phone}`} will be saved to this store only. If they’re already
          saved with the same phone number, this order is added to their record.
        </p>
        <div className="mt-4">
          <Checkbox checked={marketing} onChange={(e) => setMarketing(e.target.checked)} label="They agreed to hear about offers from this store" />
          <p className="ml-7 mt-1 text-sm text-ink-3">Only tick this if they actually said yes.</p>
        </div>
        {saveCustomer.formError && (
          <div className="mt-3">
            <FormAlert>{saveCustomer.formError}</FormAlert>
          </div>
        )}
      </Dialog>
    </>
  );
}

function Line({ label, value, className, plain }: { label: ReactNode; value: ReactNode; className?: string; plain?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${className ?? ''}`}>
      <dt className={className ? 'shrink-0' : 'shrink-0 text-ink-2'}>{label}</dt>
      <dd className={plain ? 'text-right [overflow-wrap:anywhere]' : 'num text-right'}>{value}</dd>
    </div>
  );
}
