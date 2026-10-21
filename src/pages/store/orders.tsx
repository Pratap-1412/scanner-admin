import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { LoadError, RowList, SearchBox } from '@/components/admin-ui';
import { useStoreWorkspace } from '@/components/store-context';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { qs, timeAgo, useResource } from '@/lib/admin';
import { formatMoney } from '@/lib/money';
import { useDebouncedValue } from '@/lib/use-debounced';
import { FULFILMENT_LABEL, OrderDetailDialog, STATUS_LABEL, STATUS_TONE, storeTime, usePoll, type OrderRow } from './orders-parts';

type View = 'new' | 'active' | 'ready' | 'done' | 'all';
type Counts = { new: number; active: number; ready: number; unseen: number };
type Summary = {
  date: string;
  timezone: string;
  currency: string;
  todayCount: number;
  todayValue: number;
  popular: { name: string; quantity: number }[];
};
type ListPage = { orders: OrderRow[]; nextCursor: string | null };

const PAGE_SIZE = 25;

/** Midnight at the start of `date` (YYYY-MM-DD) in the store's time zone, as an ISO instant. */
function zonedStart(date: string, timeZone: string) {
  const guess = new Date(`${date}T00:00:00Z`);
  const wall = new Date(guess.toLocaleString('en-US', { timeZone }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (wall.getTime() - utc.getTime())).toISOString();
}

const nextDay = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

export default function OrdersTab() {
  const { storeId, store } = useStoreWorkspace();
  const base = `/stores/${storeId}/orders`;
  const [view, setView] = useState<View>('all');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // Cursor paging as the API does it: each entry is the cursor that opens that page.
  // Any filter change starts again from the newest page.
  const filterKey = `${view}|${q}|${from}|${to}`;
  const [paging, setPaging] = useState({ key: filterKey, cursors: [''] });
  const cursors = paging.key === filterKey ? paging.cursors : [''];
  const setCursors = (fn: (cs: string[]) => string[]) => setPaging({ key: filterKey, cursors: fn(cursors) });
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const rangeInvalid = Boolean(from && to && from > to);
  const cursor = cursors[cursors.length - 1] ?? '';
  const listPath = `${base}${qs({
    view,
    q,
    from: from && !rangeInvalid ? zonedStart(from, store.timezone) : undefined,
    to: to && !rangeInvalid ? zonedStart(nextDay(to), store.timezone) : undefined,
    cursor,
    limit: PAGE_SIZE,
  })}`;

  const list = useResource<ListPage>(listPath);
  const counts = useResource<Counts>(`${base}/counts`);
  const summary = useResource<Summary>(`${base}/summary`);
  const { reload: reloadList } = list;
  const { reload: reloadCounts } = counts;
  const { reload: reloadSummary } = summary;

  const reloadAll = useCallback(() => {
    reloadList();
    reloadCounts();
    reloadSummary();
  }, [reloadList, reloadCounts, reloadSummary]);
  usePoll(reloadAll);

  // The refresh button shows progress until the list answers.
  useEffect(() => setRefreshing(false), [list.data, list.error]);

  const t = storeTime(store.timezone);
  const money = (n: number, currency = store.currency) => formatMoney(n, currency);
  const c = counts.data;
  const label = (text: string, n?: number) => (n ? `${text} (${n})` : text);
  const filtered = Boolean(q || from || to);
  const page = cursors.length;

  return (
    <div>
      <section aria-labelledby="orders-today-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="orders-today-h" className="text-lg font-semibold">
            Today
            {summary.data ? (
              <span className="num ml-2 text-[15px] font-normal text-ink-2">
                {new Date(`${summary.data.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
              </span>
            ) : null}
          </h2>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-3 sm:inline">Refreshes every 20 seconds</span>
            <Button
              variant="secondary"
              size="sm"
              loading={refreshing}
              icon={<RefreshCw size={15} strokeWidth={1.75} aria-hidden />}
              onClick={() => {
                setRefreshing(true);
                reloadAll();
              }}
            >
              Refresh
            </Button>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface sm:grid-cols-5">
          <Stat label="Orders today" value={summary.data?.todayCount} />
          <Stat label="Value today" value={summary.data ? money(summary.data.todayValue, summary.data.currency) : undefined} />
          <Stat label="New" value={c?.new} />
          <Stat label="In progress" value={c?.active} />
          <Stat label="Ready" value={c?.ready} className="col-span-2 sm:col-span-1" />
        </dl>
        {Boolean(summary.error || counts.error) && (
          <p className="mt-2 text-sm text-danger">
            Some of these numbers didn’t load.{' '}
            <button onClick={reloadAll} className="font-semibold underline underline-offset-4">
              Try again
            </button>
          </p>
        )}
        <p className="mt-2 text-sm text-ink-2">
          Today excludes rejected and cancelled orders.
          {c && c.unseen > 0 && (
            <>
              {' '}
              <span className="num font-semibold text-ink">{c.unseen}</span> open {c.unseen === 1 ? 'order hasn’t' : 'orders haven’t'} been opened
              yet.
            </>
          )}
          {summary.data && summary.data.popular.length > 0 && (
            <span className="block">
              Popular in the last 30 days:{' '}
              {summary.data.popular.map((p, i) => (
                <span key={p.name}>
                  {i > 0 && ', '}
                  {p.name} <span className="num text-ink-3">({p.quantity})</span>
                </span>
              ))}
            </span>
          )}
        </p>
      </section>

      <section aria-labelledby="orders-list-h" className="mt-8">
        <h2 id="orders-list-h" className="text-lg font-semibold">
          Orders
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <Segmented<View>
              label="Order status"
              value={view}
              onChange={setView}
              options={[
                { value: 'all', label: 'All' },
                { value: 'new', label: label('New', c?.new) },
                { value: 'active', label: label('In progress', c?.active) },
                { value: 'ready', label: label('Ready', c?.ready) },
                { value: 'done', label: 'Finished', hint: 'Completed, rejected and cancelled' },
              ]}
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <SearchBox label="Order no., table or name" value={search} onChange={(v) => setSearch(v.slice(0, 40))} />
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-ink-2 sm:flex-none">
                From
                <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-11 sm:w-40" />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-ink-2 sm:flex-none">
                To
                <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-11 sm:w-40" />
              </label>
            </div>
            {filtered && (
              <Button
                variant="quiet"
                size="sm"
                className="self-start sm:mb-2.5 sm:self-auto"
                onClick={() => {
                  setSearch('');
                  setFrom('');
                  setTo('');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
          {rangeInvalid && (
            <p role="alert" className="text-sm font-medium text-danger">
              The start date is after the end date.
            </p>
          )}
          {(from || to) && !rangeInvalid && <p className="text-sm text-ink-3">Dates are in the store’s time zone ({store.timezone}).</p>}
        </div>

        <div className="mt-4">
          {list.error && !list.data ? (
            <LoadError onRetry={list.reload} />
          ) : !list.data ? (
            <Skeleton className="h-72 w-full rounded-[var(--radius-card)]" />
          ) : list.data.orders.length === 0 ? (
            page > 1 ? (
              <EmptyState title="No older orders">
                <button onClick={() => setCursors(() => [''])} className="font-semibold underline underline-offset-4">
                  Back to the newest
                </button>
              </EmptyState>
            ) : filtered ? (
              <EmptyState title="No orders match">Try a different order number, name or date range.</EmptyState>
            ) : (
              <EmptyState title={view === 'new' ? 'No new orders' : view === 'all' ? 'No orders yet' : 'Nothing here right now'}>
                {view === 'all'
                  ? 'Orders appear here when customers order from this store’s QR codes or link.'
                  : 'Orders move between these lists as the shop works through them.'}
              </EmptyState>
            )
          ) : (
            <>
              {list.error && (
                <p role="status" className="mb-3 text-sm text-warning">
                  Couldn’t refresh just now, so this list may be out of date.
                </p>
              )}
              <div className="hidden px-4 pb-2 text-sm text-ink-2 md:grid md:grid-cols-[7rem_8rem_minmax(0,1fr)_8rem_7rem_8.5rem] md:gap-3">
                <span>Order</span>
                <span>Placed</span>
                <span>Customer</span>
                <span>Fulfilment</span>
                <span className="text-right">Total</span>
                <span>Status</span>
              </div>
              <RowList>
                {list.data.orders.map((o) => (
                  <li key={o.id}>
                    <OrderRowButton order={o} onOpen={() => setOpenId(o.id)} time={t.dateTime} money={money} />
                  </li>
                ))}
              </RowList>
              {(page > 1 || list.data.nextCursor) && (
                <div className="mt-4 flex items-center justify-between gap-4 text-[15px]">
                  <p className="text-ink-2">
                    Page <span className="num">{page}</span>
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setCursors((cs) => cs.slice(0, -1))}>
                      Newer
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!list.data.nextCursor}
                      onClick={() => {
                        const next = list.data?.nextCursor;
                        if (next) setCursors((cs) => [...cs, next]);
                      }}
                    >
                      Older
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {openId && <OrderDetailDialog key={openId} orderId={openId} onClose={() => setOpenId(null)} onChanged={reloadAll} />}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string | number | undefined; className?: string }) {
  return (
    <div
      className={`border-b border-line px-4 py-3 odd:border-r last:border-r-0 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${className ?? ''}`}
    >
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="num mt-0.5 text-xl font-semibold">{value ?? <Skeleton className="mt-1 h-6 w-12" />}</dd>
    </div>
  );
}

function OrderRowButton({
  order: o,
  onOpen,
  time,
  money,
}: {
  order: OrderRow;
  onOpen: () => void;
  time: (iso: string) => string;
  money: (n: number, currency?: string) => string;
}) {
  const items = o.items
    .slice(0, 3)
    .map((l) => `${l.quantity}× ${l.name}${l.variantName ? ` (${l.variantName})` : ''}`)
    .join(', ');
  const fulfilment = FULFILMENT_LABEL[o.fulfilmentType] ?? o.fulfilmentType;
  const more = o.items.length > 3 ? ` + ${o.items.length - 3} more` : '';
  return (
    <button
      onClick={onOpen}
      className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3 text-left text-[15px] hover:bg-paper/60 focus-visible:bg-paper/60 md:grid-cols-[7rem_8rem_minmax(0,1fr)_8rem_7rem_8.5rem] md:items-center"
    >
      <span className="flex items-center gap-2">
        <span className="num font-bold">{o.publicReference}</span>
        {!o.seen && (
          <>
            <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden />
            <span className="sr-only">Not opened yet</span>
          </>
        )}
      </span>
      <span className="num text-right font-semibold md:hidden">{money(o.grandTotal, o.currency)}</span>

      <span className="text-sm text-ink-2 md:text-[15px]">
        <span className="num" title={timeAgo(o.createdAt)}>
          {time(o.createdAt)}
        </span>
        {o.scheduledFor && (
          <span className="block font-semibold text-warning">
            For <span className="num">{time(o.scheduledFor)}</span>
          </span>
        )}
      </span>
      <span className="flex justify-end md:hidden">
        <StatusPill tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</StatusPill>
      </span>

      <span className="col-span-2 min-w-0 md:col-span-1">
        <span className={o.customerName ? 'block truncate font-medium' : 'block truncate text-ink-3'}>{o.customerName || 'Guest'}</span>
        <span className="block truncate text-sm text-ink-2">
          {items}
          {more}
        </span>
      </span>

      <span className="col-span-2 text-sm text-ink-2 md:col-span-1 md:text-[15px] md:text-ink">
        {o.contextLabel ? (
          <>
            <span className="font-medium">{o.contextLabel}</span>
            <span className="text-ink-2 md:block md:text-sm">
              <span className="md:hidden"> · </span>
              {fulfilment}
            </span>
          </>
        ) : (
          fulfilment
        )}
        <span className="md:hidden"> · {o.paymentStatus === 'paid' ? 'Paid' : 'Not paid'}</span>
      </span>

      <span className="num hidden text-right font-semibold md:block">
        {money(o.grandTotal, o.currency)}
        <span className={`block text-sm font-normal ${o.paymentStatus === 'paid' ? 'text-success' : 'text-ink-3'}`}>
          {o.paymentStatus === 'paid' ? 'Paid' : 'Not paid'}
        </span>
      </span>
      <span className="hidden md:block">
        <StatusPill tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</StatusPill>
      </span>
    </button>
  );
}
