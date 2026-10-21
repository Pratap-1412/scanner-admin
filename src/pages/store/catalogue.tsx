import { Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { LoadError, SearchBox } from '@/components/admin-ui';
import { useStoreWorkspace } from '@/components/store-context';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { qs, useResource } from '@/lib/admin';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { imgProps } from '@/lib/image';
import { formatMoney } from '@/lib/money';
import { useDebouncedValue } from '@/lib/use-debounced';
import {
  BADGE_LABEL,
  CategoriesView,
  DietaryMark,
  ImportExportView,
  ItemEditor,
  StockDialog,
  categoryOptions,
  errorText,
  plural,
  pluralWord,
  useDietaryMarks,
  type CategoryList,
  type Item,
} from './catalogue-parts';

type View = 'items' | 'categories' | 'transfer';
type BulkAction = 'available' | 'unavailable' | 'show' | 'hide' | 'feature' | 'unfeature' | 'move' | 'delete';
type ItemPage = { items: Item[]; nextCursor: string | null };

const PAGE_SIZE = 30;
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The store's catalogue: items, categories, and CSV import/export, with the owner's full controls. */
export default function CatalogueTab() {
  const { storeId, preset } = useStoreWorkspace();
  const cats = useResource<CategoryList>(`/stores/${storeId}/categories`);
  const [view, setView] = useState<View>('items');
  const [categoryId, setCategoryId] = useState('');
  // Bumped after an import so the item list refetches.
  const [itemsVersion, setItemsVersion] = useState(0);

  return (
    <div>
      <div className="mb-6 overflow-x-auto [scrollbar-width:none]">
        <Segmented<View>
          label={`${preset.catalogueLabel} sections`}
          value={view}
          onChange={setView}
          options={[
            { value: 'items', label: capitalise(pluralWord(preset.itemLabel)) },
            { value: 'categories', label: 'Categories' },
            { value: 'transfer', label: 'Import and export' },
          ]}
        />
      </div>
      {view === 'items' && (
        <ItemsView key={itemsVersion} cats={cats.data} reloadCats={cats.reload} categoryId={categoryId} onCategoryChange={setCategoryId} />
      )}
      {view === 'categories' && (
        <CategoriesView
          data={cats.data}
          error={cats.error}
          reload={cats.reload}
          onShowItems={(id) => {
            setCategoryId(id);
            setView('items');
          }}
        />
      )}
      {view === 'transfer' && (
        <ImportExportView
          onImported={() => {
            cats.reload();
            setItemsVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

function ItemsView({
  cats,
  reloadCats,
  categoryId,
  onCategoryChange,
}: {
  cats: CategoryList | undefined;
  reloadCats: () => void;
  categoryId: string;
  onCategoryChange: (id: string) => void;
}) {
  const { storeId, store, preset, can } = useStoreWorkspace();
  const toast = useToast();
  const canEdit = can('catalogue.edit');
  const canToggle = canEdit || can('catalogue.availability');
  const marksOn = useDietaryMarks();
  const label = preset.itemLabel;
  const labels = pluralWord(label);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dietary, setDietary] = useState('');
  // Cursors of the pages after the first, so "Previous" can step back.
  const [cursors, setCursors] = useState<string[]>([]);
  const q = useDebouncedValue(search.trim(), 300);
  const cursor = cursors.at(-1);
  const list = useResource<ItemPage>(`/stores/${storeId}/items${qs({ q, categoryId, status, dietary, cursor, limit: PAGE_SIZE })}`);

  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [stockFor, setStockFor] = useState<Item | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState('');
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Availability switches move at once; the override stays until fresh data arrives.
  const [switching, setSwitching] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [seen, setSeen] = useState(list.data);
  if (seen !== list.data) {
    setSeen(list.data);
    setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([id]) => switching.has(id))));
  }

  const items = list.data?.items ?? [];
  const catName = new Map(cats?.categories.map((c) => [c.id, c.name]));
  const totalCount = cats ? cats.categories.reduce((n, c) => n + c.itemCount, 0) + cats.uncategorisedCount : null;
  const filtered = Boolean(q || categoryId || status || dietary);
  const allPicked = items.length > 0 && items.every((i) => picked.has(i.id));
  const page = cursors.length + 1;

  /** Filters start again from the first page with nothing selected. */
  function filter<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setCursors([]);
      setPicked(new Set());
    };
  }

  function refresh() {
    list.reload();
    reloadCats();
  }

  function togglePick(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const availableNow = (item: Item) => overrides[item.id] ?? item.isAvailable;

  async function toggleAvailable(item: Item) {
    if (switching.has(item.id)) return;
    const next = !availableNow(item);
    setOverrides((o) => ({ ...o, [item.id]: next }));
    setSwitching((s) => new Set(s).add(item.id));
    try {
      await api(`/stores/${storeId}/items/${item.id}`, { method: 'PATCH', body: { isAvailable: next } });
      toast({ tone: 'success', message: `${item.name} is ${next ? 'available again' : 'now unavailable'}` });
      list.reload();
    } catch (err) {
      setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([id]) => id !== item.id)));
      toast({ tone: 'error', message: errorText(err, `Could not update ${item.name}.`) });
    } finally {
      setSwitching((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }
  }

  async function bulk(action: BulkAction, extra: Record<string, unknown> = {}) {
    setBulkBusy(true);
    try {
      const res = await api<{ updated: number }>(`/stores/${storeId}/items/bulk`, { body: { ids: [...picked], action, ...extra } });
      toast({ tone: 'success', message: `${action === 'delete' ? 'Deleted' : 'Updated'} ${plural(res.updated, label)}` });
      setPicked(new Set());
      setConfirmBulkDelete(false);
      setMoveTo('');
      if (action === 'delete') setCursors([]);
      refresh();
    } catch (err) {
      toast({ tone: 'error', message: errorText(err, `Could not update the ${labels}.`) });
    } finally {
      setBulkBusy(false);
    }
  }

  const options = categoryOptions(cats?.categories ?? []);

  return (
    <section aria-labelledby="items-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="items-heading" className="text-lg font-semibold">
            {capitalise(labels)}
          </h2>
          {totalCount !== null && <p className="text-[15px] text-ink-2">{plural(totalCount, label)} in this store</p>}
        </div>
        {canEdit && (
          <Button onClick={() => setEditing('new')} icon={<Plus size={18} strokeWidth={1.75} aria-hidden />}>
            Add {label}
          </Button>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchBox label={`Search ${labels}, codes or tags`} value={search} onChange={filter(setSearch)} />
        <Select aria-label="Category" value={categoryId} onChange={(e) => filter(onCategoryChange)(e.target.value)} className="h-11 sm:w-48">
          <option value="">All categories</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
          <option value="none">No category</option>
        </Select>
        <Select aria-label="Status" value={status} onChange={(e) => filter(setStatus)(e.target.value)} className="h-11 sm:w-48">
          <option value="">Any status</option>
          <option value="available">Available</option>
          <option value="unavailable">Not available</option>
          <option value="hidden">Hidden</option>
          <option value="low_stock">Low stock (5 or less)</option>
          <option value="featured">Featured</option>
          <option value="on_sale">On sale</option>
        </Select>
        {marksOn && (
          <Select aria-label="Food type" value={dietary} onChange={(e) => filter(setDietary)(e.target.value)} className="h-11 sm:w-40">
            <option value="">Any food type</option>
            <option value="veg">Veg</option>
            <option value="non_veg">Non-veg</option>
            <option value="egg">Egg</option>
            <option value="vegan">Vegan</option>
            <option value="none">Not marked</option>
          </Select>
        )}
      </div>

      {canToggle && items.length > 0 && (
        <div
          role="region"
          aria-label={`Change selected ${labels}`}
          className={cn(
            'mt-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border px-3 py-2',
            picked.size ? 'border-ink bg-surface' : 'border-transparent px-0',
          )}
        >
          <label className="mr-1 flex cursor-pointer items-center gap-2 text-[15px] font-semibold">
            <input
              type="checkbox"
              className="size-[18px] accent-[var(--brand)]"
              checked={allPicked}
              onChange={() => setPicked(allPicked ? new Set() : new Set(items.map((i) => i.id)))}
            />
            {picked.size ? `${picked.size} selected` : 'Select all on this page'}
          </label>
          {picked.size > 0 && (
            <>
              <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulk('available')}>
                Turn on
              </Button>
              <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulk('unavailable')}>
                Turn off
              </Button>
              {canEdit && (
                <>
                  <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulk('hide')}>
                    Hide
                  </Button>
                  <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulk('show')}>
                    Show
                  </Button>
                  <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulk('feature')}>
                    Feature
                  </Button>
                  <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulk('unfeature')}>
                    Unfeature
                  </Button>
                  <span className="flex items-center gap-1.5">
                    <Select aria-label="Move to category" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="h-9 w-40 text-[14px]">
                      <option value="">Move to…</option>
                      {options.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                      <option value="none">No category</option>
                    </Select>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!moveTo || bulkBusy}
                      onClick={() => bulk('move', { categoryId: moveTo === 'none' ? null : moveTo })}
                    >
                      Move
                    </Button>
                  </span>
                  <Button size="sm" variant="danger" disabled={bulkBusy} onClick={() => setConfirmBulkDelete(true)}>
                    Delete
                  </Button>
                </>
              )}
              <Button size="sm" variant="quiet" onClick={() => setPicked(new Set())}>
                Clear
              </Button>
            </>
          )}
        </div>
      )}

      <div className="mt-4">
        {list.error && !list.data ? (
          <LoadError onRetry={list.reload} />
        ) : !list.data ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : items.length === 0 ? (
          filtered || page > 1 ? (
            <p className="py-8 text-ink-2">Nothing matches these filters.</p>
          ) : (
            <EmptyState title={`No ${labels} yet`}>
              {canEdit
                ? `Add the first ${label} with a name and a price, or import a spreadsheet. Photos, options and add-ons can come later.`
                : `This store hasn’t added any ${labels}.`}
            </EmptyState>
          )
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {items.map((item) => {
              const on = availableNow(item);
              const soldOut = item.trackStock && (item.stockQuantity ?? 0) <= 0;
              const price = item.salePrice ?? item.basePrice;
              return (
                <li key={item.id} className={cn('flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4', picked.has(item.id) && 'bg-brand-tint/60')}>
                  {canToggle && (
                    <input
                      type="checkbox"
                      className="size-[18px] shrink-0 accent-[var(--brand)]"
                      checked={picked.has(item.id)}
                      onChange={() => togglePick(item.id)}
                      aria-label={`Select ${item.name}`}
                    />
                  )}
                  {item.images[0] ? (
                    <img
                      {...imgProps(item.images[0].url, 56)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-14 shrink-0 rounded-[var(--radius-photo)] object-cover"
                    />
                  ) : (
                    <span
                      className="flex size-14 shrink-0 items-center justify-center rounded-[var(--radius-photo)] bg-paper-deep text-xl text-ink-3"
                      aria-hidden
                    >
                      {item.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {marksOn && item.dietary && <DietaryMark value={item.dietary} />}
                      <button
                        type="button"
                        onClick={() => setEditing(item)}
                        className="truncate text-left font-semibold underline decoration-transparent decoration-2 underline-offset-4 hover:decoration-line-strong"
                      >
                        {item.name}
                      </button>
                      {item.rating && item.rating.count > 0 && (
                        <span
                          className="num inline-flex shrink-0 items-center gap-0.5 text-[13px] text-ink-2"
                          aria-label={`Rated ${item.rating.average.toFixed(1)}`}
                        >
                          <Star size={12} strokeWidth={1.75} className="fill-[var(--accent)] text-[#8a5a00]" aria-hidden />
                          {item.rating.average.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-ink-2">
                      <span className="num font-semibold text-ink sm:hidden">{formatMoney(price, store.currency)} · </span>
                      {item.categoryId ? (catName.get(item.categoryId) ?? 'No category') : 'No category'}
                      {item.variants.length > 0 && ` · ${plural(item.variants.length, 'option')}`}
                      {item.addOns.length > 0 && ` · ${plural(item.addOns.length, 'add-on')}`}
                      {item.sku && ` · ${item.sku}`}
                    </p>
                    {(item.trackStock || item.isFeatured || item.visibility === 'hidden' || item.badges.length > 0) && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {item.trackStock &&
                          (canToggle ? (
                            <button
                              type="button"
                              onClick={() => setStockFor(item)}
                              className={cn(
                                'num text-[13px] font-semibold underline decoration-line-strong underline-offset-4 hover:decoration-ink',
                                soldOut ? 'text-danger' : 'text-ink-2',
                              )}
                            >
                              {soldOut ? 'Sold out' : `${item.stockQuantity} in stock`}
                              <span className="sr-only">, change stock for {item.name}</span>
                            </button>
                          ) : (
                            <span className={cn('num text-[13px] font-semibold', soldOut ? 'text-danger' : 'text-ink-2')}>
                              {soldOut ? 'Sold out' : `${item.stockQuantity} in stock`}
                            </span>
                          ))}
                        {item.visibility === 'hidden' && <StatusPill className="h-5 text-[11px]">Hidden</StatusPill>}
                        {item.isFeatured && (
                          <StatusPill tone="brand" className="h-5 text-[11px]">
                            Featured
                          </StatusPill>
                        )}
                        {item.badges.map((b) => (
                          <span
                            key={b}
                            className="inline-flex h-5 items-center rounded-full border border-line-strong px-2 text-[11px] font-semibold text-ink-2"
                          >
                            {BADGE_LABEL[b]}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="num hidden shrink-0 text-right font-semibold sm:block">
                    {formatMoney(price, store.currency)}
                    {item.salePrice != null && <s className="block text-sm font-normal text-ink-3">{formatMoney(item.basePrice, store.currency)}</s>}
                  </span>
                  {canToggle ? (
                    <label className="flex shrink-0 cursor-pointer flex-col items-center gap-0.5 text-[11px] font-medium text-ink-2">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={on}
                        aria-busy={switching.has(item.id)}
                        onChange={() => toggleAvailable(item)}
                        className="peer sr-only"
                        aria-label={`${item.name} available to order`}
                      />
                      <span
                        aria-hidden
                        className={cn(
                          'relative inline-flex h-7 w-12 rounded-full border-[1.5px] transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
                          on ? 'border-brand bg-brand' : 'border-line-strong bg-paper-deep',
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-[3px] size-[18px] rounded-full bg-surface transition-transform duration-150 ease-[var(--ease-out)]',
                            on ? 'translate-x-[23px]' : 'translate-x-[3px]',
                          )}
                        />
                      </span>
                      {on ? 'On' : 'Off'}
                    </label>
                  ) : (
                    <StatusPill tone={on ? 'success' : 'neutral'} className="shrink-0">
                      {on ? 'On' : 'Off'}
                    </StatusPill>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {(page > 1 || list.data?.nextCursor) && (
        <div className="mt-4 flex items-center justify-between gap-4 text-[15px]">
          <p className="text-ink-2">
            Page <span className="num">{page}</span>
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                setCursors((c) => c.slice(0, -1));
                setPicked(new Set());
              }}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!list.data?.nextCursor}
              onClick={() => {
                const next = list.data?.nextCursor;
                if (next) setCursors((c) => [...c, next]);
                setPicked(new Set());
              }}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <ItemEditor
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? null : editing}
          categories={cats?.categories ?? []}
          defaultCategoryId={categoryId && categoryId !== 'none' ? categoryId : ''}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
          onDuplicated={(copy) => {
            setEditing(copy);
            refresh();
          }}
          onDeleted={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {stockFor && (
        <StockDialog
          item={stockFor}
          onClose={() => setStockFor(null)}
          onSaved={() => {
            setStockFor(null);
            list.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => bulk('delete')}
        loading={bulkBusy}
        title={`Delete ${plural(picked.size, label)}?`}
        confirmLabel="Delete for good"
      >
        <p>They will disappear from the store page and can’t be brought back.</p>
        <p className="mt-2">
          Only out for today? <strong className="text-ink">Turn them off</strong> instead.
        </p>
      </ConfirmDialog>
    </section>
  );
}
