import { cn } from '@/lib/cn';
import { Link } from '@/lib/router';
import { APP_NAME } from '@/lib/site';

type Tone = 'color' | 'reverse' | 'mono';

/*
 * The mark: a QR code's corner "finder" square under a bazaar stall's awning.
 * A shop you open with a QR code. Drawn on a 48-unit grid; no gradients, no clip paths,
 * so it can be inlined many times on a page and recoloured freely.
 */
const STRIPE_W = 10.5;
const stripe = (i: number) => {
  const x = 3 + i * STRIPE_W;
  const left = i === 0 ? `M${x} 5Q${x} 3 ${x + 2} 3` : `M${x} 3`;
  const right = i === 3 ? `H${x + STRIPE_W - 2}Q${x + STRIPE_W} 3 ${x + STRIPE_W} 5` : `H${x + STRIPE_W}`;
  return `${left}${right}V11A5.25 5.25 0 0 1 ${x} 11Z`;
};
const RING = 'M11.8 18H36.2Q38 18 38 19.8V44.2Q38 46 36.2 46H11.8Q10 46 10 44.2V19.8Q10 18 11.8 18ZM14 22V42H34V22Z';

const PALETTE: Record<Tone, { body: string; stripeA: string; stripeB: string }> = {
  color: { body: 'var(--brand)', stripeA: 'var(--brand)', stripeB: 'var(--accent)' },
  reverse: { body: 'var(--paper)', stripeA: 'var(--paper)', stripeB: 'var(--accent)' },
  mono: { body: 'currentColor', stripeA: 'currentColor', stripeB: 'currentColor' },
};

export function BrandMark({ className, tone = 'color' }: { className?: string; tone?: Tone }) {
  const p = PALETTE[tone];
  return (
    <svg viewBox="0 0 48 48" className={cn('size-8', className)} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={stripe(i)} fill={i % 2 ? p.stripeB : p.stripeA} />
      ))}
      <path d={RING} fill={p.body} fillRule="evenodd" />
      <rect x="18" y="26" width="12" height="12" rx="0.8" fill={p.body} />
    </svg>
  );
}

/** Mark plus the product name as live text, so renaming is a config change. */
export function Wordmark({ href = '/', className, tone = 'color' }: { href?: string; className?: string; tone?: Tone }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2 rounded-md', className)} aria-label={`${APP_NAME} admin home`}>
      <BrandMark tone={tone} className="size-9" />
      <span className={cn('display text-[28px] leading-none lowercase', tone === 'reverse' ? 'text-paper' : 'text-ink')}>{APP_NAME}</span>
    </Link>
  );
}
