import { useId, useState } from 'react';
import { useStoreWorkspace } from '@/components/store-context';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { StatusPill } from '@/components/ui/status-pill';
import { formatDate, formatDateTime } from '@/lib/admin';
import { cn } from '@/lib/cn';
import { Link } from '@/lib/router';

/* ---------- Types (from api/src/modules/reviews) ---------- */

export type HideReason = 'abusive' | 'spam' | 'personal_info' | 'not_about_store';

export type OwnerReview = {
  id: string;
  rating: number;
  comment: string;
  name: string;
  verified: boolean;
  reply: { text: string; at: string | null } | null;
  createdAt: string;
  edited: boolean;
  status: 'published' | 'hidden';
  hiddenReason: HideReason | null;
  orderId: string | null;
  orderRef: string | null;
  item: { id: string; name: string; image: { url: string } | null } | null;
  /** Full for people who can see customers, masked ("98••••••21") for everyone else. */
  phone: string;
  /** Only set for people who can see customers. */
  customerId: string | null;
  replyBy: string;
};

export type ReviewSummary = {
  average: number;
  count: number;
  distribution: { stars: number; count: number }[];
  unreplied: number;
  hidden: number;
  productReviews: number;
};

export const STAR_WORDS = ['', 'Poor', 'Not great', 'Good', 'Very good', 'Excellent'];

export const HIDE_REASONS: { value: HideReason; label: string }[] = [
  { value: 'abusive', label: 'Abusive or hateful language' },
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'personal_info', label: 'Shares someone’s personal details' },
  { value: 'not_about_store', label: 'Not about this store' },
];

/* ---------- Stars ---------- */

const STAR = 'M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z';
const EDGE = 'var(--warning)';

function Star({ fill, size }: { fill: number; size: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" width={24 * fill} height="24" />
        </clipPath>
      </defs>
      <path d={STAR} fill="var(--surface)" stroke={EDGE} strokeWidth="1.3" strokeLinejoin="round" />
      {fill > 0 && <path d={STAR} fill="var(--accent)" stroke={EDGE} strokeWidth="1.3" strokeLinejoin="round" clipPath={`url(#${id})`} />}
    </svg>
  );
}

/** Read-only stars; supports fractions like 4.3. */
export function Stars({ value, size = 18, className }: { value: number; size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={`${value.toFixed(1).replace(/\.0$/, '')} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} fill={Math.max(0, Math.min(1, value - (i - 1)))} />
      ))}
    </span>
  );
}

/* ---------- Rating summary ---------- */

export function RatingSummaryCard({ summary }: { summary: ReviewSummary }) {
  const maxBar = Math.max(1, ...summary.distribution.map((d) => d.count));
  return (
    <section
      aria-label="Rating summary"
      className="grid gap-6 rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center"
    >
      <div>
        <p className="num text-[44px] font-semibold leading-none">{summary.average.toFixed(1)}</p>
        <Stars value={summary.average} className="mt-1.5" />
        <p className="mt-1.5 text-sm text-ink-2">
          Store rating from <span className="num">{summary.count}</span> published review{summary.count === 1 ? '' : 's'}
        </p>
      </div>
      <div className="space-y-4">
        <ul className="max-w-md space-y-1" aria-label="Store ratings breakdown">
          {summary.distribution.map((d) => (
            <li key={d.stars} className="grid grid-cols-[3.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm">
              <span className="text-ink-2">{d.stars} star</span>
              <span className="h-2 rounded-full bg-paper-deep" aria-hidden>
                <span className="block h-2 rounded-full bg-accent" style={{ width: `${(d.count / maxBar) * 100}%` }} />
              </span>
              <span className="num text-right text-ink-2">{d.count}</span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-ink-2">Product reviews</dt>
            <dd className="num font-semibold">{summary.productReviews}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-ink-2">Need a reply</dt>
            <dd className="num font-semibold">{summary.unreplied}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-ink-2">Hidden</dt>
            <dd className="num font-semibold">{summary.hidden}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/* ---------- One review ---------- */

export function ReviewCard({
  r,
  manage,
  onReply,
  onHide,
  onUnhide,
}: {
  r: OwnerReview;
  manage: boolean;
  onReply: (text: string) => Promise<boolean>;
  onHide: () => void;
  onUnhide: () => Promise<boolean>;
}) {
  const { storeId, can } = useStoreWorkspace();
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState(r.reply?.text ?? '');
  const [busy, setBusy] = useState(false);
  const replyId = useId();
  const hidden = r.status === 'hidden';
  const reason = HIDE_REASONS.find((x) => x.value === r.hiddenReason)?.label;

  async function busyWhile(fn: () => Promise<boolean>) {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    return ok;
  }

  return (
    <li className={cn('rounded-[var(--radius-card)] border bg-surface p-4 sm:p-5', hidden ? 'border-dashed border-line-strong' : 'border-line')}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[15px] font-semibold">
        {r.item ? (
          <>
            {r.item.image && <img src={r.item.image.url} alt="" className="size-8 rounded-[var(--radius-photo)] object-cover" />}
            <span className="min-w-0 [overflow-wrap:anywhere]">{r.item.name}</span>
          </>
        ) : (
          <span className="text-ink-2">The store</span>
        )}
        {hidden && <StatusPill className="ml-auto">Hidden</StatusPill>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Stars value={r.rating} size={17} />
        <span className="font-semibold">{STAR_WORDS[r.rating] ?? ''}</span>
        <span className="text-sm text-ink-2">
          {r.name} · {r.item ? (r.verified ? 'bought it' : 'not matched to an order') : r.verified ? 'ordered' : 'no order'} ·{' '}
          {formatDate(r.createdAt)}
          {r.edited && ' · edited'}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {r.phone &&
          (r.customerId && can('customers.view') ? (
            <Link
              href={`/stores/${storeId}/customers?customer=${r.customerId}`}
              className="num font-semibold underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              {r.phone}
            </Link>
          ) : (
            <span className="num text-ink-2">{r.phone}</span>
          ))}
        {r.orderRef && (
          <span className="text-ink-2">
            Order <span className="num font-semibold text-ink">{r.orderRef}</span>
          </span>
        )}
      </div>

      {r.comment ? (
        <p className="mt-2 whitespace-pre-line text-[15px] [overflow-wrap:anywhere]">{r.comment}</p>
      ) : (
        <p className="mt-2 text-sm text-ink-3">No comment, just a rating.</p>
      )}

      {hidden && reason && <p className="mt-2 text-sm text-ink-2">Hidden because: {reason}</p>}

      {r.reply && !replying && (
        <div className="mt-3 border-l-2 border-line-strong pl-3 text-[15px]">
          <p className="text-sm font-semibold text-ink-2">
            Store’s reply{r.replyBy ? ` · ${r.replyBy}` : ''}
            {r.reply.at && <span className="font-normal"> · {formatDateTime(r.reply.at)}</span>}
          </p>
          <p className="whitespace-pre-line [overflow-wrap:anywhere]">{r.reply.text}</p>
        </div>
      )}

      {replying && (
        <div className="mt-3 space-y-2">
          <label className="text-sm font-semibold" htmlFor={replyId}>
            Public reply
          </label>
          <Textarea
            id={replyId}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="Thank them, or explain what the store will do differently."
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              disabled={!text.trim()}
              onClick={async () => {
                if (await busyWhile(() => onReply(text.trim()))) setReplying(false);
              }}
            >
              Post reply
            </Button>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => {
                setText(r.reply?.text ?? '');
                setReplying(false);
              }}
            >
              Cancel
            </Button>
            <span className="num ml-auto text-sm text-ink-3">{text.length}/500</span>
          </div>
        </div>
      )}

      {manage && !replying && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!hidden && (
            <Button size="sm" variant="secondary" onClick={() => setReplying(true)}>
              {r.reply ? 'Edit reply' : 'Reply'}
            </Button>
          )}
          {r.reply && !hidden && (
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => void busyWhile(() => onReply(''))}>
              Remove reply
            </Button>
          )}
          {hidden ? (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => void busyWhile(onUnhide)}>
              Show again
            </Button>
          ) : (
            <Button size="sm" variant="quiet" className="ml-auto text-danger" onClick={onHide}>
              Hide
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/* ---------- Hide with a reason ---------- */

export function HideReviewDialog({
  review,
  onClose,
  onHide,
}: {
  review: OwnerReview | null;
  onClose: () => void;
  onHide: (reason: HideReason) => Promise<string | null>;
}) {
  const [reason, setReason] = useState<HideReason | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function close() {
    setReason(null);
    setError('');
    onClose();
  }

  return (
    <Dialog
      open={Boolean(review)}
      onClose={close}
      title="Hide this review?"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Keep it
          </Button>
          <Button
            variant="danger"
            disabled={!reason}
            loading={busy}
            onClick={async () => {
              if (!reason) return;
              setBusy(true);
              const err = await onHide(reason);
              setBusy(false);
              if (err) setError(err);
              else close();
            }}
          >
            Hide review
          </Button>
        </>
      }
    >
      <p className="text-ink-2">
        Hide a review only when it breaks a rule. An honest bad review isn’t a reason. Hiding takes it off the store page, updates the rating, and is
        recorded in the store’s activity log.
      </p>
      <fieldset className="mt-4 space-y-2">
        <legend className="mb-1 text-[15px] font-semibold">Which rule does it break?</legend>
        {HIDE_REASONS.map((x) => (
          <label key={x.value} className="flex cursor-pointer items-center gap-2.5 text-[15px]">
            <input
              type="radio"
              name="hide-reason"
              checked={reason === x.value}
              onChange={() => setReason(x.value)}
              className="size-[18px] accent-[var(--brand)]"
            />
            {x.label}
          </label>
        ))}
      </fieldset>
      {error && (
        <div className="mt-4">
          <FormAlert>{error}</FormAlert>
        </div>
      )}
    </Dialog>
  );
}
