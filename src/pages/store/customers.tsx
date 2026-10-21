import { Download, Plus, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { LoadError, RowList, SearchBox } from '@/components/admin-ui';
import { useStoreWorkspace } from '@/components/store-context';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { formatDate, qs, useResource } from '@/lib/admin';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { useRouter, useSearchParams } from '@/lib/router';
import { useDebouncedValue } from '@/lib/use-debounced';
import {
  AddCustomerDialog,
  CursorPager,
  CustomerDetail,
  FromOrderDialog,
  useCursorPages,
  type Customer,
  type CustomerSource,
} from './customers-parts';

type ListData = { customers: Customer[]; nextCursor: string | null; tags: string[] };
type SourceFilter = '' | CustomerSource;

export default function CustomersTab() {
  const { storeId } = useStoreWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const openId = params.get('customer');
  const base = `/stores/${storeId}/customers`;

  // The open customer lives in the URL (?customer=<id>), so the Reviews tab can link to it and Back works.
  // The list remounts (and refetches) when the detail closes, so edits and deletes show straight away.
  if (openId && /^[a-f\d]{24}$/.test(openId)) {
    return <CustomerDetail key={openId} customerId={openId} onBack={() => router.push(base)} />;
  }
  return <CustomerList onOpen={(id) => router.push(`${base}?customer=${id}`)} />;
}

function CustomerList({ onOpen }: { onOpen: (id: string) => void }) {
  const { storeId, store, can } = useStoreWorkspace();
  const toast = useToast();
  const manage = can('customers.manage');
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [source, setSource] = useState<SourceFilter>('');
  const q = useDebouncedValue(search.trim(), 300);
  const pages = useCursorPages(`${q}|${tag}|${source}`);
  const list = useResource<ListData>(`/stores/${storeId}/customers${qs({ q, tag, source, cursor: pages.cursor })}`);
  const [adding, setAdding] = useState(false);
  const [fromOrder, setFromOrder] = useState(false);
  const [exporting, setExporting] = useState(false);
  const filtered = Boolean(q || tag || source);

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await fetch(`/api/v1/stores/${storeId}/customers/export.csv`, { credentials: 'same-origin', signal: AbortSignal.timeout(60_000) });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(err?.error?.message ?? 'The export didn’t download. Please try again.');
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${store.slug}-customers.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast({
        tone: 'error',
        message: err instanceof Error && err.name !== 'TimeoutError' ? err.message : 'The export didn’t download. Please try again.',
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="text-lg font-semibold">Customers</h2>
          <p className="mt-1 text-[15px] text-ink-2">
            Everyone who ordered or reviewed with a phone number, saved automatically, plus anyone added by hand.
          </p>
        </div>
        {manage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportCsv} loading={exporting} icon={<Download size={17} strokeWidth={1.75} aria-hidden />}>
              Export CSV
            </Button>
            <Button variant="secondary" onClick={() => setFromOrder(true)} icon={<ReceiptText size={17} strokeWidth={1.75} aria-hidden />}>
              From an order
            </Button>
            <Button onClick={() => setAdding(true)} icon={<Plus size={18} strokeWidth={1.75} aria-hidden />}>
              Add customer
            </Button>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchBox label="Search name or phone" value={search} onChange={setSearch} />
        <div className="overflow-x-auto">
          <Segmented<SourceFilter>
            label="Where they came from"
            value={source}
            onChange={setSource}
            options={[
              { value: '', label: 'Everyone' },
              { value: 'order', label: 'First ordered' },
              { value: 'review', label: 'First reviewed' },
              { value: 'manual', label: 'Added by hand' },
            ]}
          />
        </div>
      </div>
      {list.data && list.data.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by tag">
          {list.data.tags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? '' : t)}
              aria-pressed={tag === t}
              className={cn(
                'h-9 rounded-full border-[1.5px] px-3.5 text-[14px] font-semibold',
                tag === t ? 'border-ink bg-ink text-paper' : 'border-line-strong bg-surface text-ink hover:border-ink-3',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5">
        {list.error ? (
          <LoadError onRetry={list.reload} />
        ) : !list.data ? (
          <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
        ) : list.data.customers.length === 0 ? (
          filtered ? (
            <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-5 py-6 text-ink-2">No customers match.</p>
          ) : (
            <EmptyState title="No customers yet">
              When someone orders or reviews with their phone number, they show up here with their orders and reviews. Nobody has to sign up.
            </EmptyState>
          )
        ) : (
          <>
            <RowList>
              {list.data.customers.map((c) => (
                <li key={c.id}>
                  <button onClick={() => onOpen(c.id)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-paper">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.name || 'No name'}</span>
                      <span className="block truncate text-sm text-ink-2">
                        <span className="num">{c.phone || 'No phone'}</span>
                        {c.tags.length > 0 && ` · ${c.tags.join(', ')}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm text-ink-2">
                      <span className="num block">
                        {c.orderCount} order{c.orderCount === 1 ? '' : 's'}
                        <span className="hidden sm:inline">{c.reviewCount ? ` · ${c.reviewCount} review${c.reviewCount === 1 ? '' : 's'}` : ''}</span>
                      </span>
                      {c.totalSpent > 0 && <span className="num block font-semibold text-ink">{formatMoney(c.totalSpent, store.currency)}</span>}
                    </span>
                    <span className="num hidden w-28 shrink-0 text-right text-sm text-ink-3 md:block">
                      {c.lastSeenAt ? formatDate(c.lastSeenAt) : '—'}
                    </span>
                  </button>
                </li>
              ))}
            </RowList>
            <CursorPager page={pages.page} nextCursor={list.data.nextCursor} onNext={pages.next} onPrev={pages.prev} />
          </>
        )}
      </div>

      <AddCustomerDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(c) => {
          setAdding(false);
          onOpen(c.id);
        }}
      />
      <FromOrderDialog
        open={fromOrder}
        onClose={() => setFromOrder(false)}
        onSaved={(c) => {
          setFromOrder(false);
          onOpen(c.id);
        }}
      />
    </div>
  );
}
