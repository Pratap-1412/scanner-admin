import { useState, type FormEvent } from 'react';
import { useStoreWorkspace } from '@/components/store-context';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Toggle } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { PriceInput } from '@/components/ui/price-input';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { useSubmit } from '@/lib/use-submit';

/* ---------- Types (from api/src/modules/promos) ---------- */

export type PromoType = 'percent' | 'flat';

export type Promo = {
  id: string;
  code: string;
  description: string;
  type: PromoType;
  /** A percentage (1–90) or an amount in minor units. */
  value: number;
  minOrder: number;
  maxDiscount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Tone = 'neutral' | 'success' | 'warning';

/** Where a code stands right now, as the checkout would see it. */
export function promoState(p: Promo, now = Date.now()): { label: string; tone: Tone } {
  if (!p.isActive) return { label: 'Off', tone: 'neutral' };
  if (p.endsAt && new Date(p.endsAt).getTime() < now) return { label: 'Expired', tone: 'neutral' };
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return { label: 'Scheduled', tone: 'warning' };
  if (p.usageLimit && p.usedCount >= p.usageLimit) return { label: 'Used up', tone: 'neutral' };
  return { label: 'Active', tone: 'success' };
}

/** "10% off up to ₹100 on orders of ₹500 or more" */
export function describePromo(p: Promo, currency: string) {
  const parts = [p.type === 'percent' ? `${p.value}% off` : `${formatMoney(p.value, currency)} off`];
  if (p.type === 'percent' && p.maxDiscount) parts.push(`up to ${formatMoney(p.maxDiscount, currency)}`);
  if (p.minOrder) parts.push(`on orders of ${formatMoney(p.minOrder, currency)} or more`);
  return parts.join(' ');
}

/** ISO → the value a datetime-local input wants, in the browser's time zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

/* ---------- Create or edit ---------- */

export function PromoDialog({ promo, onClose, onSaved }: { promo: Promo | null; onClose: () => void; onSaved: () => void }) {
  const { storeId, store } = useStoreWorkspace();
  const toast = useToast();
  const [code, setCode] = useState(promo?.code ?? '');
  const [description, setDescription] = useState(promo?.description ?? '');
  const [type, setType] = useState<PromoType>(promo?.type ?? 'percent');
  const [percent, setPercent] = useState(promo?.type === 'percent' ? String(promo.value) : '10');
  const [flat, setFlat] = useState<number | null>(promo?.type === 'flat' ? promo.value : null);
  const [minOrder, setMinOrder] = useState<number | null>(promo?.minOrder || null);
  const [maxDiscount, setMaxDiscount] = useState<number | null>(promo?.maxDiscount ?? null);
  const [startsAt, setStartsAt] = useState(toLocalInput(promo?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(promo?.endsAt ?? null));
  const [limit, setLimit] = useState(promo?.usageLimit ? String(promo.usageLimit) : '');
  const [active, setActive] = useState(promo?.isActive ?? true);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const { pending, fieldErrors, formError, run } = useSubmit();
  const errors = { ...fieldErrors, ...localErrors };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    const pct = Number(percent);
    if (type === 'percent' && !(Number.isInteger(pct) && pct >= 1 && pct <= 90)) local.value = 'Use a whole number from 1 to 90.';
    if (type === 'flat' && !flat) local.value = 'Enter the amount off.';
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) local.endsAt = 'Make it end after it starts.';
    if (limit && promo && Number(limit) < promo.usedCount) local.usageLimit = `It has already been used ${promo.usedCount} times.`;
    setLocalErrors(local);
    if (Object.keys(local).length) return;

    const body = {
      code,
      description: description.trim(),
      type,
      value: type === 'percent' ? pct : flat,
      minOrder: minOrder ?? 0,
      maxDiscount: type === 'percent' ? maxDiscount : null,
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt),
      usageLimit: limit ? Number(limit) : null,
      isActive: active,
    };
    const ok = await run(() =>
      promo ? api(`/stores/${storeId}/promos/${promo.id}`, { method: 'PATCH', body }) : api(`/stores/${storeId}/promos`, { body }),
    );
    if (ok) {
      toast({ tone: 'success', message: promo ? `${code} saved` : `${code} created` });
      onSaved();
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={promo ? `Edit ${promo.code}` : 'New promo code'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="promo-form" loading={pending}>
            {promo ? 'Save changes' : 'Create code'}
          </Button>
        </>
      }
    >
      <form id="promo-form" onSubmit={onSubmit} noValidate className="space-y-5">
        <Field label="Code" hint="3 to 20 letters or numbers, like DIWALI10. Customers type this at checkout." error={errors.code}>
          {(f) => (
            <Input
              id={f.id}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
              className="num uppercase tracking-wide"
              aria-invalid={f.invalid}
              aria-describedby={f.describedBy}
            />
          )}
        </Field>
        <Field label="Description" optional hint="Shown to the customer when the code works." error={errors.description}>
          {(f) => (
            <Input
              id={f.id}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={120}
              aria-invalid={f.invalid}
              aria-describedby={f.describedBy}
            />
          )}
        </Field>
        <div className="space-y-1.5">
          <p className="text-[15px] font-semibold">Discount type</p>
          <Segmented<PromoType>
            label="Discount type"
            value={type}
            onChange={setType}
            options={[
              { value: 'percent', label: 'Percentage' },
              { value: 'flat', label: 'Fixed amount' },
            ]}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {type === 'percent' ? (
            <Field label="Percent off" hint="1 to 90." error={errors.value}>
              {(f) => (
                <Input
                  id={f.id}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={90}
                  step={1}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="num"
                  aria-invalid={f.invalid}
                  aria-describedby={f.describedBy}
                />
              )}
            </Field>
          ) : (
            <Field label="Amount off" error={errors.value}>
              {(f) => <PriceInput id={f.id} value={flat} onValueChange={setFlat} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}
            </Field>
          )}
          {type === 'percent' && (
            <Field label="Maximum discount" optional hint="Caps the amount off." error={errors.maxDiscount}>
              {(f) => (
                <PriceInput id={f.id} value={maxDiscount} onValueChange={setMaxDiscount} aria-invalid={f.invalid} aria-describedby={f.describedBy} />
              )}
            </Field>
          )}
          <Field label="Minimum order" optional hint="Order subtotal before the discount." error={errors.minOrder}>
            {(f) => <PriceInput id={f.id} value={minOrder} onValueChange={setMinOrder} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}
          </Field>
          <Field label="Total uses" optional hint="Across all customers. Empty means no limit." error={errors.usageLimit}>
            {(f) => (
              <Input
                id={f.id}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="num"
                aria-invalid={f.invalid}
                aria-describedby={f.describedBy}
              />
            )}
          </Field>
          <Field label="Starts" optional hint="Empty means straight away." error={errors.startsAt}>
            {(f) => (
              <Input
                id={f.id}
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                aria-invalid={f.invalid}
                aria-describedby={f.describedBy}
              />
            )}
          </Field>
          <Field label="Ends" optional hint="Empty means it doesn’t expire." error={errors.endsAt}>
            {(f) => (
              <Input
                id={f.id}
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                aria-invalid={f.invalid}
                aria-describedby={f.describedBy}
              />
            )}
          </Field>
        </div>
        {promo && (
          <p className="text-sm text-ink-2">
            Used <span className="num">{promo.usedCount}</span> time{promo.usedCount === 1 ? '' : 's'} so far. Times are in your browser’s time zone.
          </p>
        )}
        <Toggle checked={active} onChange={setActive} label="Active" description="Turned-off codes are refused at checkout." />
        <FormAlert>{formError}</FormAlert>
      </form>
    </Dialog>
  );
}
