import { useState } from 'react';
import { LoadError } from '@/components/admin-ui';
import { useStoreWorkspace } from '@/components/store-context';
import { EmptyState } from '@/components/ui/empty-state';
import { FormAlert } from '@/components/ui/form-alert';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { qs, useResource } from '@/lib/admin';
import { api, isApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { CursorPager, useCursorPages } from './customers-parts';
import { HideReviewDialog, RatingSummaryCard, ReviewCard, type OwnerReview, type ReviewSummary } from './reviews-parts';

type ListData = { summary: ReviewSummary; reviews: OwnerReview[]; nextCursor: string | null };
type Scope = 'all' | 'store' | 'items';
type Filter = 'all' | 'unreplied' | 'low' | 'hidden';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All published' },
  { key: 'unreplied', label: 'Needs a reply' },
  { key: 'low', label: '1–2 stars' },
  { key: 'hidden', label: 'Hidden' },
];

export default function ReviewsTab() {
  const { storeId, store, can } = useStoreWorkspace();
  const toast = useToast();
  const manage = can('reviews.manage');
  const [scope, setScope] = useState<Scope>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const pages = useCursorPages(`${scope}|${filter}`);
  const list = useResource<ListData>(`/stores/${storeId}/reviews${qs({ scope, filter, cursor: pages.cursor })}`);
  const [hiding, setHiding] = useState<OwnerReview | null>(null);
  const reviewsOff = (store.reviews as { enabled?: boolean } | undefined)?.enabled === false;
  const summary = list.data?.summary;

  /** Returns the error message, or null when it worked. */
  async function patch(id: string, body: Record<string, unknown>, message: string) {
    try {
      await api(`/stores/${storeId}/reviews/${id}`, { method: 'PATCH', body });
      toast({ tone: 'success', message });
      list.reload();
      return null;
    } catch (err) {
      return isApiError(err) ? err.message : 'Something went wrong. Please try again.';
    }
  }

  async function patchWithToast(id: string, body: Record<string, unknown>, message: string) {
    const err = await patch(id, body, message);
    if (err) toast({ tone: 'error', message: err });
    return !err;
  }

  return (
    <div className="max-w-4xl">
      <h2 className="text-lg font-semibold">Reviews</h2>
      <p className="mt-1 max-w-2xl text-[15px] text-ink-2">
        Reviews of the store and of its products. Replies are public on the store page. Hidden reviews don’t count towards the rating.
      </p>

      {reviewsOff && (
        <div className="mt-4">
          <FormAlert tone="info">Reviews are switched off in this store’s settings, so customers can’t leave new ones.</FormAlert>
        </div>
      )}

      {summary && summary.count + summary.hidden + summary.productReviews > 0 && (
        <div className="mt-5">
          <RatingSummaryCard summary={summary} />
        </div>
      )}

      <div className="mt-6 overflow-x-auto">
        <Segmented<Scope>
          label="Which reviews"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'Everything' },
            { value: 'store', label: 'The store' },
            { value: 'items', label: 'Products' },
          ]}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter reviews">
        {FILTERS.map((f) => {
          const count = f.key === 'unreplied' ? summary?.unreplied : f.key === 'hidden' ? summary?.hidden : undefined;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                'h-9 rounded-full border-[1.5px] px-3.5 text-[14px] font-semibold',
                filter === f.key ? 'border-ink bg-ink text-paper' : 'border-line-strong bg-surface text-ink hover:border-ink-3',
              )}
            >
              {f.label}
              {count ? <span className="num ml-1.5">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {list.error ? (
          <LoadError onRetry={list.reload} />
        ) : !list.data ? (
          <div className="space-y-3">
            <Skeleton className="h-36 w-full rounded-[var(--radius-card)]" />
            <Skeleton className="h-36 w-full rounded-[var(--radius-card)]" />
          </div>
        ) : list.data.reviews.length === 0 ? (
          <EmptyState title={filter === 'all' && scope === 'all' ? 'No reviews yet' : 'No reviews here'}>
            {filter !== 'all' || scope !== 'all'
              ? 'Nothing matches this filter. Try another one.'
              : 'Customers can rate their order from the order page once it’s ready, and review products from each product page.'}
          </EmptyState>
        ) : (
          <>
            <ul className="space-y-3">
              {list.data.reviews.map((r) => (
                <ReviewCard
                  key={`${r.id}-${r.status}-${r.reply?.text ?? ''}`}
                  r={r}
                  manage={manage}
                  onReply={(text) => patchWithToast(r.id, { reply: text }, text ? 'Reply posted' : 'Reply removed')}
                  onHide={() => setHiding(r)}
                  onUnhide={() => patchWithToast(r.id, { hidden: false }, 'Review shown again')}
                />
              ))}
            </ul>
            <CursorPager
              page={pages.page}
              nextCursor={list.data.nextCursor}
              onNext={pages.next}
              onPrev={pages.prev}
              newerLabel="Newer"
              olderLabel="Older"
            />
          </>
        )}
      </div>

      {manage && (
        <HideReviewDialog
          review={hiding}
          onClose={() => setHiding(null)}
          onHide={(reason) => (hiding ? patch(hiding.id, { hidden: true, hiddenReason: reason }, 'Review hidden') : Promise.resolve(null))}
        />
      )}
    </div>
  );
}
