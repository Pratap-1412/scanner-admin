import { useState, type FormEvent, type ReactNode } from 'react';
import { useAdmin } from '@/components/admin-shell';
import { AccountPicker } from '@/components/account-picker';
import { useStoreWorkspace, type StoreData } from '@/components/store-context';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, PasswordInput, Select, Textarea, Toggle } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { PriceInput } from '@/components/ui/price-input';
import { useToast } from '@/components/ui/toast';
import { formatDate, useResource, type AdminUser } from '@/lib/admin';
import { api } from '@/lib/api';
import { useRouter } from '@/lib/router';
import { useSubmit } from '@/lib/use-submit';

/* Store fields this tab edits, as the API returns them. */
type Hours = { day: number; closed: boolean; open: string; close: string };
type Settings = StoreData & {
  address?: { city?: string; state?: string; postalCode?: string };
  mapUrl?: string;
  gstin?: string;
  receiptFooter?: string;
  pricesIncludeTax?: boolean;
  socialLinks?: { website?: string; whatsapp?: string; instagram?: string };
  theme?: { accentColor?: string };
  openingHours?: Hours[];
  orderingSettings: StoreData['orderingSettings'] & {
    requireName?: boolean;
    requirePhone?: boolean;
    minimumOrder?: number;
    instructions?: string;
    allowCustomerCancel?: boolean;
    leadTimeMinutes?: number;
    allowScheduled?: boolean;
    maxOpenOrders?: number | null;
    respectHours?: boolean;
    deliveryFee?: number;
    freeDeliveryAbove?: number | null;
    deliveryNote?: string;
  };
  payments?: { acceptCash?: boolean; acceptUpi?: boolean; upiId?: string; upiName?: string; acceptCard?: boolean; note?: string };
  announcement?: { text?: string; tone?: 'info' | 'offer' | 'warning'; active?: boolean };
  reviews?: { enabled?: boolean; allowWithoutOrder?: boolean; showOnStorePage?: boolean; itemReviews?: boolean; itemReviewsBuyersOnly?: boolean };
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FULFILMENT: [string, string][] = [
  ['pickup', 'Pickup'],
  ['dine_in', 'Dine-in (table QR)'],
  ['delivery', 'Delivery'],
];

export default function SettingsTab() {
  const { store: raw, can } = useStoreWorkspace();
  const store = raw as Settings;
  const editable = can('store.settings');

  return (
    <div className="space-y-10">
      <Lifecycle />
      <Owner />
      <Details store={store} editable={editable} />
      <Ordering store={store} editable={editable} />
      <Payments store={store} editable={editable} />
      <OpeningHours store={store} editable={editable} />
      <Announcement store={store} editable={editable} />
      <ReviewSettings store={store} editable={editable} />
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-5 sm:px-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-[15px] text-ink-2">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** One PATCH per section: sends only that section's fields, then reloads the store. */
function useSave() {
  const { storeId, reload } = useStoreWorkspace();
  const toast = useToast();
  const submit = useSubmit();
  async function save(body: Record<string, unknown>, message = 'Saved') {
    const ok = await submit.run(() => api(`/stores/${storeId}`, { method: 'PATCH', body }));
    if (ok) {
      toast({ tone: 'success', message });
      reload();
    }
  }
  return { ...submit, save };
}

function SaveRow({ editable, pending, formError }: { editable: boolean; pending: boolean; formError: string }) {
  if (!editable) return <p className="text-sm text-ink-3">Your admin role can see these settings but not change them.</p>;
  return (
    <div className="space-y-3">
      <FormAlert>{formError}</FormAlert>
      <Button type="submit" loading={pending}>
        Save changes
      </Button>
    </div>
  );
}

/* ───────────── Status ───────────── */

function Lifecycle() {
  const { storeId, store, can, reload } = useStoreWorkspace();
  const router = useRouter();
  const toast = useToast();
  const action = useSubmit();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const remove = useSubmit();

  async function transition(kind: 'publish' | 'pause' | 'archive' | 'restore', message: string) {
    const ok = await action.run(() => api(`/stores/${storeId}/${kind}`, { method: 'POST' }));
    if (ok) {
      toast({ tone: 'success', message });
      reload();
    }
  }

  async function destroy(e: FormEvent) {
    e.preventDefault();
    const ok = await remove.run(() => api(`/stores/${storeId}`, { method: 'DELETE', body: { password } }));
    if (ok) {
      toast({ tone: 'success', message: `${store.name} was deleted` });
      router.replace('/stores');
    }
  }

  const s = store.status;
  return (
    <Section
      title="Status"
      description={
        s === 'published'
          ? 'Live: customers can open the store and order.'
          : s === 'paused'
            ? 'Paused: the store page shows that it’s closed for now.'
            : s === 'archived'
              ? 'Archived: hidden from customers. Restore it as a draft or delete it for good.'
              : 'Draft: only the team can see it.'
      }
    >
      <div className="flex flex-wrap gap-2">
        {can('store.publish') && (s === 'draft' || s === 'paused') && (
          <Button loading={action.pending} onClick={() => transition('publish', 'The store is live')}>
            Publish
          </Button>
        )}
        {can('store.publish') && s === 'published' && (
          <Button variant="secondary" loading={action.pending} onClick={() => transition('pause', 'The store is paused')}>
            Pause
          </Button>
        )}
        {can('store.archive') && s !== 'archived' && (
          <Button variant="danger" disabled={action.pending} onClick={() => transition('archive', 'The store is archived')}>
            Archive
          </Button>
        )}
        {can('store.archive') && s === 'archived' && (
          <>
            <Button variant="secondary" loading={action.pending} onClick={() => transition('restore', 'Restored as a draft')}>
              Restore as draft
            </Button>
            <Button variant="danger" onClick={() => setDeleting(true)}>
              Delete store
            </Button>
          </>
        )}
        {!can('store.publish') && !can('store.archive') && <p className="text-sm text-ink-3">Your admin role can’t change the store’s status.</p>}
      </div>
      <div className="mt-3">
        <FormAlert>{action.formError}</FormAlert>
      </div>
      <p className="mt-4 text-sm text-ink-3">Created {formatDate(store.createdAt)}</p>

      <Dialog open={deleting} onClose={() => setDeleting(false)} title={`Delete ${store.name}?`}>
        <form onSubmit={destroy} noValidate className="space-y-5">
          <p className="text-[15px] text-ink-2">
            This removes the store and everything in it: catalogue, QR codes, orders, customers, reviews and promo codes. Printed QR codes stop
            working. It can’t be undone.
          </p>
          <Field label="Your password" hint="Your own admin password, to confirm." error={remove.fieldErrors.password}>
            {(f) => (
              <PasswordInput
                id={f.id}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-invalid={f.invalid}
              />
            )}
          </Field>
          <FormAlert>{remove.fieldErrors.password ? '' : remove.formError}</FormAlert>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleting(false)}>
              Keep it
            </Button>
            <Button type="submit" variant="danger" loading={remove.pending} disabled={!password}>
              Delete for good
            </Button>
          </div>
        </form>
      </Dialog>
    </Section>
  );
}

/* ───────────── Owner ───────────── */

function Owner() {
  const { storeId, store, reload } = useStoreWorkspace();
  const { can } = useAdmin();
  const toast = useToast();
  const owner = useResource<{ user: AdminUser }>(can('users.view') ? `/admin/users/${store.ownerUserId}` : null);
  const [changing, setChanging] = useState(false);
  const [next, setNext] = useState<AdminUser | null>(null);
  const submit = useSubmit();

  async function confirm() {
    if (!next) return;
    const ok = await submit.run(() => api(`/admin/stores/${storeId}/owner`, { body: { userId: next.id } }));
    if (ok) {
      toast({ tone: 'success', message: `${next.name} now owns ${store.name}` });
      setChanging(false);
      setNext(null);
      reload();
      owner.reload();
    }
  }

  const o = owner.data?.user;
  return (
    <Section title="Owner">
      {can('users.view') ? (
        o ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[15px]">
            <dt className="text-ink-2">Name</dt>
            <dd className="font-medium">{o.name}</dd>
            <dt className="text-ink-2">Email</dt>
            <dd className="min-w-0 truncate">{o.email}</dd>
            <dt className="text-ink-2">Phone</dt>
            <dd className="num">
              {o.phone ? (
                <a href={`tel:${o.phone.replace(/[^\d+]/g, '')}`} className="underline underline-offset-4">
                  {o.phone}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </dl>
        ) : (
          <p className="text-ink-2">{owner.error ? 'The owner’s account couldn’t be loaded.' : 'Loading…'}</p>
        )
      ) : (
        <p className="text-sm text-ink-3">Your admin role can’t see accounts.</p>
      )}
      {can('stores.owner') && can('users.view') && (
        <div className="mt-4">
          {changing ? (
            <div className="space-y-3">
              <Field label="New owner" hint="Any active account. The current owner stays on the team as a manager.">
                {(f) => <AccountPicker id={f.id} value={next} onChange={setNext} exclude={[store.ownerUserId]} />}
              </Field>
              <FormAlert>{submit.formError}</FormAlert>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setChanging(false)}>
                  Cancel
                </Button>
                <Button onClick={confirm} loading={submit.pending} disabled={!next}>
                  Make owner
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setChanging(true)}>
              Change owner
            </Button>
          )}
        </div>
      )}
    </Section>
  );
}

/* ───────────── Details ───────────── */

function Details({ store, editable }: { store: Settings; editable: boolean }) {
  const s = useSave();
  const [v, setV] = useState({
    name: store.name,
    slug: store.slug,
    businessType: store.businessType,
    shopCategory: store.shopCategory ?? '',
    description: store.description ?? '',
    phone: store.phone ?? '',
    email: store.email ?? '',
    city: store.address?.city ?? '',
    state: store.address?.state ?? '',
    postalCode: store.address?.postalCode ?? '',
    mapUrl: store.mapUrl ?? '',
    gstin: store.gstin ?? '',
    receiptFooter: store.receiptFooter ?? '',
    website: store.socialLinks?.website ?? '',
    whatsapp: store.socialLinks?.whatsapp ?? '',
    instagram: store.socialLinks?.instagram ?? '',
    accentColor: store.theme?.accentColor ?? '#0B6B70',
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void s.save(
      {
        name: v.name,
        slug: v.slug,
        businessType: v.businessType,
        shopCategory: v.shopCategory,
        description: v.description,
        phone: v.phone,
        email: v.email,
        address: { city: v.city, state: v.state, postalCode: v.postalCode },
        mapUrl: v.mapUrl,
        gstin: v.gstin,
        receiptFooter: v.receiptFooter,
        socialLinks: { website: v.website, whatsapp: v.whatsapp, instagram: v.instagram },
        theme: { accentColor: v.accentColor },
      },
      'Store details saved',
    );
  }

  const e = s.fieldErrors;
  return (
    <Section title="Store details">
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!editable} className="grid gap-5 sm:grid-cols-2">
          <Field label="Store name" error={e.name}>
            {(f) => <Input id={f.id} value={v.name} onChange={set('name')} maxLength={80} aria-invalid={f.invalid} />}
          </Field>
          <Field label="Store link" hint="/s/your-link" error={e.slug}>
            {(f) => <Input id={f.id} value={v.slug} onChange={set('slug')} maxLength={40} aria-invalid={f.invalid} />}
          </Field>
          <Field label="Business type" error={e.businessType}>
            {(f) => (
              <Select id={f.id} value={v.businessType} onChange={set('businessType')} aria-invalid={f.invalid}>
                {['kirana', 'restaurant', 'cafe', 'bakery', 'clothing', 'salon', 'services', 'other'].map((t) => (
                  <option key={t} value={t}>
                    {t[0]!.toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Type of shop" optional error={e.shopCategory}>
            {(f) => (
              <Input
                id={f.id}
                value={v.shopCategory}
                onChange={set('shopCategory')}
                maxLength={60}
                placeholder="South Indian · Pure veg"
                aria-invalid={f.invalid}
              />
            )}
          </Field>
          <Field label="Description" optional error={e.description} className="sm:col-span-2">
            {(f) => <Textarea id={f.id} value={v.description} onChange={set('description')} maxLength={500} aria-invalid={f.invalid} />}
          </Field>
          <Field label="Store phone" optional error={e.phone}>
            {(f) => <Input id={f.id} type="tel" value={v.phone} onChange={set('phone')} aria-invalid={f.invalid} />}
          </Field>
          <Field label="Store email" optional error={e.email}>
            {(f) => <Input id={f.id} type="email" value={v.email} onChange={set('email')} aria-invalid={f.invalid} />}
          </Field>
          <Field label="City" optional error={e['address.city']}>
            {(f) => <Input id={f.id} value={v.city} onChange={set('city')} maxLength={60} aria-invalid={f.invalid} />}
          </Field>
          <Field label="State" optional error={e['address.state']}>
            {(f) => <Input id={f.id} value={v.state} onChange={set('state')} maxLength={60} aria-invalid={f.invalid} />}
          </Field>
          <Field label="PIN code" optional error={e['address.postalCode']}>
            {(f) => <Input id={f.id} value={v.postalCode} onChange={set('postalCode')} maxLength={12} aria-invalid={f.invalid} />}
          </Field>
          <Field label="Map link" optional error={e.mapUrl}>
            {(f) => <Input id={f.id} value={v.mapUrl} onChange={set('mapUrl')} placeholder="https://maps.google.com/…" aria-invalid={f.invalid} />}
          </Field>
          <Field label="GSTIN" optional error={e.gstin}>
            {(f) => <Input id={f.id} value={v.gstin} onChange={set('gstin')} maxLength={15} aria-invalid={f.invalid} />}
          </Field>
          <Field label="Receipt footer" optional error={e.receiptFooter}>
            {(f) => <Input id={f.id} value={v.receiptFooter} onChange={set('receiptFooter')} maxLength={140} aria-invalid={f.invalid} />}
          </Field>
          <Field label="Website" optional error={e['socialLinks.website']}>
            {(f) => <Input id={f.id} value={v.website} onChange={set('website')} aria-invalid={f.invalid} />}
          </Field>
          <Field label="WhatsApp number" optional error={e['socialLinks.whatsapp']}>
            {(f) => <Input id={f.id} type="tel" value={v.whatsapp} onChange={set('whatsapp')} aria-invalid={f.invalid} />}
          </Field>
          <Field label="Instagram" optional error={e['socialLinks.instagram']}>
            {(f) => <Input id={f.id} value={v.instagram} onChange={set('instagram')} aria-invalid={f.invalid} />}
          </Field>
          <Field label="Accent colour" error={e['theme.accentColor']}>
            {(f) => (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick accent colour"
                  value={v.accentColor}
                  onChange={set('accentColor')}
                  className="h-12 w-14 rounded-[var(--radius-input)] border border-line-strong bg-surface p-1"
                />
                <Input id={f.id} value={v.accentColor} onChange={set('accentColor')} maxLength={7} className="num" aria-invalid={f.invalid} />
              </div>
            )}
          </Field>
        </fieldset>
        <div className="mt-6">
          <SaveRow editable={editable} pending={s.pending} formError={Object.keys(e).length ? 'Please check the highlighted fields.' : s.formError} />
        </div>
      </form>
    </Section>
  );
}

/* ───────────── Ordering ───────────── */

function Ordering({ store, editable }: { store: Settings; editable: boolean }) {
  const s = useSave();
  const o = store.orderingSettings;
  const [v, setV] = useState({
    enabled: Boolean(o.enabled),
    fulfilmentTypes: o.fulfilmentTypes ?? ['pickup'],
    minimumOrder: o.minimumOrder ?? 0,
    deliveryFee: o.deliveryFee ?? 0,
    freeDeliveryAbove: o.freeDeliveryAbove ?? null,
    deliveryNote: o.deliveryNote ?? '',
    instructions: o.instructions ?? '',
    leadTimeMinutes: String(o.leadTimeMinutes ?? 0),
    maxOpenOrders: o.maxOpenOrders == null ? '' : String(o.maxOpenOrders),
    requireName: o.requireName ?? true,
    requirePhone: o.requirePhone ?? true,
    allowCustomerCancel: o.allowCustomerCancel ?? true,
    respectHours: o.respectHours ?? true,
    allowScheduled: o.allowScheduled ?? false,
  });
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((x) => ({ ...x, [k]: value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void s.save(
      {
        orderingSettings: {
          ...v,
          minimumOrder: v.minimumOrder ?? 0,
          deliveryFee: v.deliveryFee ?? 0,
          leadTimeMinutes: Number(v.leadTimeMinutes) || 0,
          maxOpenOrders: v.maxOpenOrders ? Number(v.maxOpenOrders) : null,
        },
      },
      'Ordering settings saved',
    );
  }

  const e = s.fieldErrors;
  return (
    <Section title="Ordering">
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!editable} className="space-y-5">
          <Toggle
            checked={v.enabled}
            onChange={(x) => set('enabled', x)}
            label="Take orders online"
            description="When off, the store shows its catalogue but customers can’t order."
            disabled={!editable}
          />
          <div>
            <p className="text-[15px] font-semibold">How customers get their order</p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              {FULFILMENT.map(([key, label]) => (
                <Checkbox
                  key={key}
                  label={label}
                  checked={v.fulfilmentTypes.includes(key)}
                  onChange={(ev) =>
                    set('fulfilmentTypes', ev.target.checked ? [...v.fulfilmentTypes, key] : v.fulfilmentTypes.filter((t) => t !== key))
                  }
                />
              ))}
            </div>
            {e['orderingSettings.fulfilmentTypes'] && <p className="mt-1 text-sm font-medium text-danger">{e['orderingSettings.fulfilmentTypes']}</p>}
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Minimum order" error={e['orderingSettings.minimumOrder']}>
              {(f) => <PriceInput id={f.id} value={v.minimumOrder} onValueChange={(m) => set('minimumOrder', m ?? 0)} aria-invalid={f.invalid} />}
            </Field>
            <Field label="Delivery fee" error={e['orderingSettings.deliveryFee']}>
              {(f) => <PriceInput id={f.id} value={v.deliveryFee} onValueChange={(m) => set('deliveryFee', m ?? 0)} aria-invalid={f.invalid} />}
            </Field>
            <Field label="Free delivery above" optional error={e['orderingSettings.freeDeliveryAbove']}>
              {(f) => (
                <PriceInput id={f.id} value={v.freeDeliveryAbove} onValueChange={(m) => set('freeDeliveryAbove', m)} aria-invalid={f.invalid} />
              )}
            </Field>
            <Field label="Preparation time (minutes)" error={e['orderingSettings.leadTimeMinutes']}>
              {(f) => (
                <Input
                  id={f.id}
                  inputMode="numeric"
                  value={v.leadTimeMinutes}
                  onChange={(ev) => set('leadTimeMinutes', ev.target.value)}
                  aria-invalid={f.invalid}
                />
              )}
            </Field>
            <Field label="Most open orders at once" optional error={e['orderingSettings.maxOpenOrders']}>
              {(f) => (
                <Input
                  id={f.id}
                  inputMode="numeric"
                  value={v.maxOpenOrders}
                  onChange={(ev) => set('maxOpenOrders', ev.target.value)}
                  placeholder="No limit"
                  aria-invalid={f.invalid}
                />
              )}
            </Field>
          </div>
          <Field label="Delivery note" optional error={e['orderingSettings.deliveryNote']}>
            {(f) => (
              <Input
                id={f.id}
                value={v.deliveryNote}
                onChange={(ev) => set('deliveryNote', ev.target.value)}
                maxLength={160}
                placeholder="Within 3 km only"
                aria-invalid={f.invalid}
              />
            )}
          </Field>
          <Field label="Instructions shown at checkout" optional error={e['orderingSettings.instructions']}>
            {(f) => (
              <Textarea
                id={f.id}
                value={v.instructions}
                onChange={(ev) => set('instructions', ev.target.value)}
                maxLength={300}
                aria-invalid={f.invalid}
              />
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle checked={v.requireName} onChange={(x) => set('requireName', x)} label="Ask for the customer’s name" disabled={!editable} />
            <Toggle checked={v.requirePhone} onChange={(x) => set('requirePhone', x)} label="Ask for a phone number" disabled={!editable} />
            <Toggle
              checked={v.allowCustomerCancel}
              onChange={(x) => set('allowCustomerCancel', x)}
              label="Customers can cancel before it’s accepted"
              disabled={!editable}
            />
            <Toggle
              checked={v.respectHours}
              onChange={(x) => set('respectHours', x)}
              label="Only take orders during opening hours"
              disabled={!editable}
            />
            <Toggle checked={v.allowScheduled} onChange={(x) => set('allowScheduled', x)} label="Allow orders for later" disabled={!editable} />
          </div>
        </fieldset>
        <div className="mt-6">
          <SaveRow editable={editable} pending={s.pending} formError={s.formError} />
        </div>
      </form>
    </Section>
  );
}

/* ───────────── Payments ───────────── */

function Payments({ store, editable }: { store: Settings; editable: boolean }) {
  const s = useSave();
  const p = store.payments ?? {};
  const [v, setV] = useState({
    acceptCash: p.acceptCash ?? true,
    acceptUpi: p.acceptUpi ?? false,
    upiId: p.upiId ?? '',
    upiName: p.upiName ?? '',
    acceptCard: p.acceptCard ?? false,
    note: p.note ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((x) => ({ ...x, [k]: value }));
  const e = s.fieldErrors;
  return (
    <Section title="Payments" description="How customers can pay. Payment happens at the shop or on delivery; the app doesn’t take money.">
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void s.save({ payments: v }, 'Payment settings saved');
        }}
        noValidate
      >
        <fieldset disabled={!editable} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Toggle checked={v.acceptCash} onChange={(x) => set('acceptCash', x)} label="Cash" disabled={!editable} />
            <Toggle checked={v.acceptUpi} onChange={(x) => set('acceptUpi', x)} label="UPI" disabled={!editable} />
            <Toggle checked={v.acceptCard} onChange={(x) => set('acceptCard', x)} label="Card" disabled={!editable} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="UPI ID" optional={!v.acceptUpi} error={e['payments.upiId']}>
              {(f) => (
                <Input id={f.id} value={v.upiId} onChange={(ev) => set('upiId', ev.target.value)} placeholder="shop@upi" aria-invalid={f.invalid} />
              )}
            </Field>
            <Field label="Name on UPI" optional error={e['payments.upiName']}>
              {(f) => (
                <Input id={f.id} value={v.upiName} onChange={(ev) => set('upiName', ev.target.value)} maxLength={60} aria-invalid={f.invalid} />
              )}
            </Field>
          </div>
          <Field label="Payment note" optional error={e['payments.note']}>
            {(f) => <Input id={f.id} value={v.note} onChange={(ev) => set('note', ev.target.value)} maxLength={140} aria-invalid={f.invalid} />}
          </Field>
        </fieldset>
        <div className="mt-6">
          <SaveRow editable={editable} pending={s.pending} formError={s.formError} />
        </div>
      </form>
    </Section>
  );
}

/* ───────────── Opening hours ───────────── */

function OpeningHours({ store, editable }: { store: Settings; editable: boolean }) {
  const s = useSave();
  const [hours, setHours] = useState<Hours[]>(() =>
    [0, 1, 2, 3, 4, 5, 6].map((day) => store.openingHours?.find((h) => h.day === day) ?? { day, closed: false, open: '09:00', close: '21:00' }),
  );
  const update = (day: number, patch: Partial<Hours>) => setHours((list) => list.map((h) => (h.day === day ? { ...h, ...patch } : h)));
  return (
    <Section title="Opening hours">
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void s.save({ openingHours: hours }, 'Opening hours saved');
        }}
        noValidate
      >
        <fieldset disabled={!editable}>
          <ul className="divide-y divide-line">
            {hours.map((h) => (
              <li key={h.day} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                <span className="w-28 font-medium">{DAYS[h.day]}</span>
                <Checkbox label="Closed" checked={h.closed} onChange={(ev) => update(h.day, { closed: ev.target.checked })} />
                {!h.closed && (
                  <span className="flex items-center gap-2">
                    <Input
                      type="time"
                      aria-label={`${DAYS[h.day]} opens`}
                      value={h.open}
                      onChange={(ev) => update(h.day, { open: ev.target.value })}
                      className="h-10 w-32"
                    />
                    <span className="text-ink-2">to</span>
                    <Input
                      type="time"
                      aria-label={`${DAYS[h.day]} closes`}
                      value={h.close}
                      onChange={(ev) => update(h.day, { close: ev.target.value })}
                      className="h-10 w-32"
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="mt-6">
          <SaveRow editable={editable} pending={s.pending} formError={s.formError} />
        </div>
      </form>
    </Section>
  );
}

/* ───────────── Announcement ───────────── */

function Announcement({ store, editable }: { store: Settings; editable: boolean }) {
  const s = useSave();
  const a = store.announcement ?? {};
  const [v, setV] = useState({ text: a.text ?? '', tone: a.tone ?? 'info', active: a.active ?? false });
  return (
    <Section title="Announcement" description="A short line at the top of the store page, like “Closed on Sunday for Diwali”.">
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void s.save({ announcement: v }, 'Announcement saved');
        }}
        noValidate
      >
        <fieldset disabled={!editable} className="space-y-5">
          <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="Show the announcement" disabled={!editable} />
          <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
            <Field label="Text" error={s.fieldErrors['announcement.text']}>
              {(f) => (
                <Input id={f.id} value={v.text} onChange={(ev) => setV({ ...v, text: ev.target.value })} maxLength={140} aria-invalid={f.invalid} />
              )}
            </Field>
            <Field label="Style">
              {(f) => (
                <Select id={f.id} value={v.tone} onChange={(ev) => setV({ ...v, tone: ev.target.value as typeof v.tone })}>
                  <option value="info">Information</option>
                  <option value="offer">Offer</option>
                  <option value="warning">Warning</option>
                </Select>
              )}
            </Field>
          </div>
        </fieldset>
        <div className="mt-6">
          <SaveRow editable={editable} pending={s.pending} formError={s.formError} />
        </div>
      </form>
    </Section>
  );
}

/* ───────────── Reviews ───────────── */

function ReviewSettings({ store, editable }: { store: Settings; editable: boolean }) {
  const s = useSave();
  const r = store.reviews ?? {};
  const [v, setV] = useState({
    enabled: r.enabled ?? true,
    showOnStorePage: r.showOnStorePage ?? true,
    allowWithoutOrder: r.allowWithoutOrder ?? false,
    itemReviews: r.itemReviews ?? true,
    itemReviewsBuyersOnly: r.itemReviewsBuyersOnly ?? false,
  });
  const set = (k: keyof typeof v) => (x: boolean) => setV((cur) => ({ ...cur, [k]: x }));
  return (
    <Section title="Reviews">
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void s.save({ reviews: v }, 'Review settings saved');
        }}
        noValidate
      >
        <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-2">
          <Toggle checked={v.enabled} onChange={set('enabled')} label="Customers can leave reviews" disabled={!editable} />
          <Toggle checked={v.showOnStorePage} onChange={set('showOnStorePage')} label="Show reviews on the store page" disabled={!editable} />
          <Toggle checked={v.allowWithoutOrder} onChange={set('allowWithoutOrder')} label="Allow reviews without an order" disabled={!editable} />
          <Toggle checked={v.itemReviews} onChange={set('itemReviews')} label="Reviews on individual items" disabled={!editable} />
          <Toggle
            checked={v.itemReviewsBuyersOnly}
            onChange={set('itemReviewsBuyersOnly')}
            label="Only buyers can review an item"
            disabled={!editable}
          />
        </fieldset>
        <div className="mt-6">
          <SaveRow editable={editable} pending={s.pending} formError={s.formError} />
        </div>
      </form>
    </Section>
  );
}
