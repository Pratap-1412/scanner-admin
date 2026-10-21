import { Download, Printer, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStoreWorkspace } from '@/components/store-context';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Toggle } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { qs, useResource } from '@/lib/admin';
import { api, ApiError, isApiError, renewSession } from '@/lib/api';
import { cn } from '@/lib/cn';
import { downloadFrom } from '@/lib/download';
import { APP_NAME, WEB_URL } from '@/lib/site';
import { useDebouncedValue } from '@/lib/use-debounced';
import { useSubmit } from '@/lib/use-submit';

/* ---------- API shapes (api/src/modules/qrs) ---------- */

export type DestinationType = 'store' | 'category' | 'item' | 'items';
export type ContextType = 'none' | 'table' | 'counter' | 'room' | 'other';
export type QrStyle = { foreground: string; background: string; showLogo: boolean; frameText: string };

export type Qr = {
  id: string;
  name: string;
  publicCode: string;
  /** What the printed code encodes, from the API's QR base URL. */
  url?: string;
  destinationType: DestinationType;
  categoryId: string | null;
  itemIds: string[];
  contextType: ContextType;
  contextLabel: string;
  style: QrStyle;
  isActive: boolean;
  isPrimary: boolean;
  scanCount: number;
  lastScannedAt: string | null;
  createdAt: string;
};

export type Category = { id: string; name: string; itemCount: number };
type Item = { id: string; name: string };

export type PosterTemplate = 'classic' | 'band' | 'minimal' | 'slip' | 'tent';
export type PosterDesign = {
  template: PosterTemplate;
  orientation: 'portrait' | 'landscape';
  size: 'a6' | 'a5' | 'a4' | 'square';
  accent: string;
  headline: string;
  subline: string;
  footerNote: string;
  showLogo: boolean;
  showSteps: boolean;
  showPhone: boolean;
  showHours: boolean;
  showAddress: boolean;
  showSocial: boolean;
  showWifi: boolean;
  wifiName: string;
  wifiPassword: string;
  showLink: boolean;
  showBrand: boolean;
};

/* ---------- Labels and defaults ---------- */

export const DEST_LABEL: Record<DestinationType, string> = {
  store: 'Whole store',
  category: 'One category',
  item: 'One item',
  items: 'A few items',
};

export const CONTEXT_LABEL: Record<ContextType, string> = {
  none: 'Anywhere',
  table: 'Table',
  counter: 'Counter',
  room: 'Room',
  other: 'Other spot',
};

/** Same as the API's DEFAULT_DESIGN (poster/design.ts). */
export const DEFAULT_DESIGN: PosterDesign = {
  template: 'classic',
  orientation: 'portrait',
  size: 'a5',
  accent: '',
  headline: 'Scan to see the menu',
  subline: '',
  footerNote: '',
  showLogo: true,
  showSteps: true,
  showPhone: true,
  showHours: true,
  showAddress: false,
  showSocial: false,
  showWifi: false,
  wifiName: '',
  wifiPassword: '',
  showLink: true,
  showBrand: true,
};

const SIZE_LABEL: Record<PosterDesign['size'], string> = {
  a6: 'A6 card (10.5 × 14.8 cm)',
  a5: 'A5 (14.8 × 21 cm)',
  a4: 'A4 poster (21 × 29.7 cm)',
  square: 'Sticker (8 × 8 cm)',
};

const TEMPLATES: { value: PosterTemplate; label: string; hint: string }[] = [
  { value: 'classic', label: 'Classic', hint: 'Name, code, steps and details' },
  { value: 'band', label: 'Brand band', hint: 'Store colour across the top' },
  { value: 'minimal', label: 'Minimal', hint: 'A big code and the table' },
  { value: 'slip', label: 'Order slip', hint: 'Looks like a printed receipt' },
  { value: 'tent', label: 'Table tent', hint: 'Folds in half and stands up' },
];

const HEADLINES = ['Scan to see the menu', 'Scan to order', 'Scan, pick, relax', 'Our menu is on your phone'];
const ACCENTS = ['#0B6B70', '#1E5A8A', '#7A3E9D', '#A33B2B', '#B86E00', '#2F6B2F', '#1D2622'];
const SAFE_STYLE: QrStyle = { foreground: '#1D2622', background: '#FFFFFF', showLogo: false, frameText: '' };
const FG_SWATCHES = ['#1D2622', '#0B6B70', '#1E3A5F', '#5B2333', '#3A3A3A'];
const BG_SWATCHES = ['#FFFFFF', '#F5F2EA', '#FFF7E0', '#EAF4F1'];
const DESIGN_KEYS = Object.keys(DEFAULT_DESIGN) as (keyof PosterDesign)[];

/** The API refuses a sheet with more codes than this. */
export const MAX_PER_SHEET = 60;

/* ---------- Helpers ---------- */

/** The link a code opens on the web app. */
export const publicLink = (qr: Qr) => qr.url || `${WEB_URL}/q/${qr.publicCode}`;
export const shortLink = (qr: Qr) => publicLink(qr).replace(/^https?:\/\//, '');

const errorMessage = (err: unknown, fallback: string) => (isApiError(err) ? err.message : fallback);

function luminance(hex: string) {
  const v = hex.replace('#', '');
  const [r = 0, g = 0, b = 0] = [0, 2, 4]
    .map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Same rule as the API's checkQrColours, so the form can explain before saving. */
export function checkQrColours(foreground: string, background: string): string | null {
  const fg = luminance(foreground);
  const bg = luminance(background);
  if (fg >= bg) return 'Use a dark colour for the code on a light background. Many phones can’t read light-on-dark codes.';
  if ((bg + 0.05) / (fg + 0.05) < 4.5)
    return 'These colours are too close together to scan reliably. Make the code darker or the background lighter.';
  return null;
}

/** Only the design's own keys, from the store's saved `qrDesign`. */
export function savedDesign(value: unknown): Partial<PosterDesign> {
  if (!value || typeof value !== 'object') return {};
  const out: Partial<Record<keyof PosterDesign, unknown>> = {};
  for (const k of DESIGN_KEYS) if (Object.hasOwn(value, k)) out[k] = (value as Record<string, unknown>)[k];
  return out as Partial<PosterDesign>;
}

const read = (obj: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

/** GETs a file from the API with the session cookie, renewing the session once on 401. */
async function fetchFile(path: string, retry = true): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { credentials: 'same-origin', signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'You seem to be offline. Check your connection and try again.');
  }
  if (res.status === 401 && retry && (await renewSession())) return fetchFile(path, false);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
    throw new ApiError(res.status, body?.error?.code ?? 'DOWNLOAD_FAILED', body?.error?.message ?? 'The download failed. Please try again.');
  }
  return res;
}

/** Saves a GET download (code PNG/SVG) under the server's file name. */
export async function downloadGet(path: string, fallbackName: string) {
  const res = await fetchFile(path);
  const blob = await res.blob();
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* ---------- Real code images ---------- */

// The download route shares a print rate limit, so each code's image is fetched once per
// design and kept for the session.
const imageUrls = new Map<string, string>();
const imageLoads = new Map<string, Promise<string>>();
const latestKey = new Map<string, string>();

function loadQrImage(storeId: string, qr: Qr) {
  const key = `${storeId}/${qr.id}/${qr.style.foreground}${qr.style.background}${qr.style.showLogo}${qr.style.frameText}`;
  const done = imageUrls.get(key);
  if (done) return { key, promise: Promise.resolve(done) };
  let promise = imageLoads.get(key);
  if (!promise) {
    promise = fetchFile(`/stores/${storeId}/qrs/${qr.id}/download?format=svg`)
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        imageUrls.set(key, url);
        const previous = latestKey.get(qr.id);
        if (previous && previous !== key) {
          const old = imageUrls.get(previous);
          imageUrls.delete(previous);
          // Give anything still showing it a moment to switch over.
          if (old) setTimeout(() => URL.revokeObjectURL(old), 5_000);
        }
        latestKey.set(qr.id, key);
        return url;
      })
      .finally(() => imageLoads.delete(key));
    imageLoads.set(key, promise);
  }
  return { key, promise };
}

/** The real, scannable code, loaded when it scrolls into view. */
export function QrImage({ storeId, qr, className, alt = '' }: { storeId: string; qr: Qr; className?: string; alt?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<{ key: string; url: string | null; failed: boolean }>({ key: '', url: null, failed: false });

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const { key, promise } = loadQrImage(storeId, qr);
    promise.then(
      (url) => alive && setState({ key, url, failed: false }),
      () => alive && setState({ key, url: null, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [visible, storeId, qr]);

  return (
    <div ref={ref} className={cn('flex items-center justify-center', className)}>
      {state.url ? (
        <img src={state.url} alt={alt} className="block max-h-full w-full object-contain" />
      ) : state.failed ? (
        <span className="px-1 text-center text-xs text-ink-3">Preview unavailable</span>
      ) : (
        <Skeleton className="aspect-square w-full" />
      )}
    </div>
  );
}

/* ---------- Small controls ---------- */

function Swatches({ value, options, onChange, label }: { value: string; options: string[]; onChange: (c: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={label}>
      {options.map((c) => {
        const on = value.toLowerCase() === c.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={c}
            onClick={() => onChange(c)}
            className={cn('size-9 rounded-full border border-line-strong ring-offset-2 ring-offset-surface', on && 'ring-2 ring-ink')}
            style={{ background: c }}
          />
        );
      })}
      <label className="ml-1 inline-flex items-center gap-2 text-sm text-ink-2">
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="size-9 cursor-pointer rounded-md border border-line-strong bg-surface p-0.5"
        />
        <span className="num">{value || 'Custom'}</span>
      </label>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-[15px] font-semibold">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function RadioCard({ checked, onChange, label, hint, name }: { checked: boolean; onChange: () => void; label: string; hint: string; name: string }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col rounded-[10px] border-[1.5px] bg-surface px-3.5 py-2.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink',
        checked ? 'border-brand bg-brand-tint' : 'border-line hover:border-line-strong',
      )}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onChange} />
      <span className="text-[15px] font-semibold">{label}</span>
      <span className="text-sm text-ink-2">{hint}</span>
    </label>
  );
}

/* ---------- Create / edit ---------- */

type Draft = Pick<Qr, 'name' | 'destinationType' | 'categoryId' | 'itemIds' | 'contextType' | 'contextLabel' | 'style' | 'isActive'>;

const CONTEXT_PLACEHOLDER: Record<ContextType, string> = { table: 'Table 4', counter: 'Front counter', room: 'Room 12', other: 'Stall B', none: '' };

/** Picks one item or several, with search. The API takes up to 50. */
function ItemPicker({
  storeId,
  single,
  value,
  onChange,
  error,
}: {
  storeId: string;
  single: boolean;
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}) {
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const list = useResource<{ items: Item[]; nextCursor: string | null }>(`/stores/${storeId}/items${qs({ limit: 100, q })}`);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!list.data) return;
    setNames((n) => ({ ...n, ...Object.fromEntries(list.data!.items.map((i) => [i.id, i.name])) }));
  }, [list.data]);

  // Codes made earlier may point at items outside the first page; look those up by id.
  const [lookedUp] = useState(() => new Set<string>());
  useEffect(() => {
    if (!list.data || q) return;
    const missing = value.filter((id) => !names[id] && !lookedUp.has(id));
    if (!missing.length) return;
    missing.forEach((id) => lookedUp.add(id));
    void Promise.all(
      missing.map((id) =>
        api<{ item: Item }>(`/stores/${storeId}/items/${id}`)
          .then((r) => [id, r.item.name] as const)
          .catch(() => [id, 'Item no longer in the catalogue'] as const),
      ),
    ).then((pairs) => setNames((n) => ({ ...n, ...Object.fromEntries(pairs) })));
  }, [list.data, q, value, names, lookedUp, storeId]);

  const toggle = (id: string, on: boolean) => onChange(single ? [id] : on ? [...value, id].slice(0, 50) : value.filter((x) => x !== id));

  return (
    <fieldset className="space-y-2">
      <legend className="text-[15px] font-semibold">{single ? 'Choose one item' : 'Choose two or more items'}</legend>
      {error && (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen items">
          {value.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-paper-deep py-0.5 pl-3 pr-1 text-sm">
              <span className="max-w-[14rem] truncate">{names[id] ?? 'Loading…'}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== id))}
                className="rounded-full p-1 text-ink-2 hover:bg-paper hover:text-ink"
                aria-label={`Remove ${names[id] ?? 'item'}`}
              >
                <X size={14} strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search items"
        aria-label="Search items"
        className="h-11"
      />
      <div className="max-h-56 overflow-y-auto rounded-[10px] border border-line bg-surface">
        {list.error ? (
          <p className="px-3.5 py-3 text-sm text-danger">Items didn’t load. Close and try again.</p>
        ) : !list.data ? (
          <Skeleton className="m-3 h-24" />
        ) : list.data.items.length === 0 ? (
          <p className="px-3.5 py-3 text-sm text-ink-2">{q ? 'No items match.' : 'This store has no items yet.'}</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.data.items.map((i) => (
              <li key={i.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 text-[15px]">
                  <input
                    type={single ? 'radio' : 'checkbox'}
                    name="qr-items"
                    checked={value.includes(i.id)}
                    onChange={(e) => toggle(i.id, e.target.checked)}
                    className="size-[18px] shrink-0 accent-[var(--brand)]"
                  />
                  <span className="min-w-0 truncate">{i.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      {list.data?.nextCursor && <p className="text-sm text-ink-2">Showing the newest 100. Search to find others.</p>}
    </fieldset>
  );
}

export function QrFormDialog({
  qr,
  categories,
  onClose,
  onSaved,
}: {
  qr: Qr | null;
  categories: Category[] | undefined;
  onClose: () => void;
  onSaved: (qr: Qr) => void;
}) {
  const { storeId, store, preset } = useStoreWorkspace();
  const toast = useToast();
  const save = useSubmit();
  const [d, setD] = useState<Draft>(
    qr
      ? { ...qr, style: { ...SAFE_STYLE, ...qr.style } }
      : {
          name: '',
          destinationType: 'store',
          categoryId: null,
          itemIds: [],
          contextType: 'none',
          contextLabel: '',
          style: SAFE_STYLE,
          isActive: true,
        },
  );
  const [preview, setPreview] = useState<{ svg: string; warning: string | null } | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setStyle = (patch: Partial<QrStyle>) => setD((x) => ({ ...x, style: { ...x.style, ...patch } }));
  const primary = Boolean(qr?.isPrimary);
  const fe = save.fieldErrors;
  const colourProblem = checkQrColours(d.style.foreground, d.style.background);
  const hasLogo = Boolean(store.logo);

  // Rendered by the same code as downloads, with a sample code.
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<{ svg: string; warning: string | null }>(`/stores/${storeId}/qrs/preview`, { body: { style: d.style }, signal: ctrl.signal })
        .then(setPreview)
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [storeId, d.style]);

  async function onSave() {
    const body = primary
      ? { name: d.name, style: d.style }
      : {
          ...d,
          categoryId: d.destinationType === 'category' ? d.categoryId : null,
          itemIds: d.destinationType === 'item' ? d.itemIds.slice(0, 1) : d.destinationType === 'items' ? d.itemIds : [],
          contextLabel: d.contextType === 'none' ? '' : d.contextLabel,
        };
    const res = await save.run(() =>
      qr ? api<{ qr: Qr }>(`/stores/${storeId}/qrs/${qr.id}`, { method: 'PATCH', body }) : api<{ qr: Qr }>(`/stores/${storeId}/qrs`, { body }),
    );
    if (!res) return;
    toast({ tone: 'success', message: qr ? 'QR code updated. Printed copies keep working.' : `${res.qr.name} created` });
    onSaved(res.qr);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={primary ? 'Edit the main store code' : qr ? `Edit ${qr.name}` : 'Create a QR code'}
      className="w-[min(100%-2rem,46rem)]!"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} loading={save.pending} disabled={!d.name.trim() || Boolean(colourProblem)}>
            {qr ? 'Save changes' : 'Create QR code'}
          </Button>
        </>
      }
    >
      <div>
        {primary && (
          <p className="mb-5 text-[15px] text-ink-2">
            This code always opens the whole store, so it can’t be pointed elsewhere, switched off or deleted. Its name, colours and label can change.
          </p>
        )}

        {!primary && (
          <Section title="What it opens">
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['store', `The full ${preset.catalogueLabel.toLowerCase()}`],
                  ['category', 'Jumps straight to one category'],
                  ['item', 'For a poster or a special'],
                  ['items', 'A short pick, like today’s specials'],
                ] as const
              ).map(([value, hint]) => (
                <RadioCard
                  key={value}
                  name="qr-destination"
                  checked={d.destinationType === value}
                  onChange={() => set('destinationType', value)}
                  label={DEST_LABEL[value]}
                  hint={hint}
                />
              ))}
            </div>
            {d.destinationType === 'category' && (
              <Field label="Category" error={fe.categoryId}>
                {(f) => (
                  <Select id={f.id} value={d.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || null)} aria-invalid={f.invalid}>
                    <option value="">Choose a category</option>
                    {categories?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.itemCount})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            {(d.destinationType === 'item' || d.destinationType === 'items') && (
              <ItemPicker
                storeId={storeId}
                single={d.destinationType === 'item'}
                value={d.destinationType === 'item' ? d.itemIds.slice(0, 1) : d.itemIds}
                onChange={(ids) => set('itemIds', ids)}
                error={fe.itemIds}
              />
            )}
          </Section>
        )}

        <Section title={primary ? 'Name' : 'Where it goes'}>
          <Field label="Name for reference" hint="Only the store team sees this, like “Table 4” or “Shop window poster”." error={fe.name}>
            {(f) => (
              <Input
                id={f.id}
                value={d.name}
                onChange={(e) => set('name', e.target.value)}
                maxLength={60}
                aria-invalid={f.invalid}
                aria-describedby={f.describedBy}
              />
            )}
          </Field>
          {!primary && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Is it for a specific spot?" hint="The spot is shown on every order from this code.">
                {(f) => (
                  <Select
                    id={f.id}
                    value={d.contextType}
                    onChange={(e) => set('contextType', e.target.value as ContextType)}
                    aria-describedby={f.describedBy}
                  >
                    <option value="none">No, anywhere</option>
                    <option value="table">A table</option>
                    <option value="counter">A counter</option>
                    <option value="room">A room</option>
                    <option value="other">Something else</option>
                  </Select>
                )}
              </Field>
              {d.contextType !== 'none' && (
                <Field label="Spot label" error={fe.contextLabel}>
                  {(f) => (
                    <Input
                      id={f.id}
                      value={d.contextLabel}
                      onChange={(e) => set('contextLabel', e.target.value)}
                      placeholder={CONTEXT_PLACEHOLDER[d.contextType]}
                      maxLength={40}
                      aria-invalid={f.invalid}
                    />
                  )}
                </Field>
              )}
            </div>
          )}
        </Section>

        <Section title="Look">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <div className="min-w-0 space-y-4">
              <div>
                <p className="mb-2 text-[15px] font-semibold">Code colour</p>
                <Swatches label="Code colour" value={d.style.foreground} options={FG_SWATCHES} onChange={(c) => setStyle({ foreground: c })} />
              </div>
              <div>
                <p className="mb-2 text-[15px] font-semibold">Background</p>
                <Swatches label="Background colour" value={d.style.background} options={BG_SWATCHES} onChange={(c) => setStyle({ background: c })} />
              </div>
              <Field label="Label under the code" optional hint="Short and clear, like “Scan to order”." error={fe['style.frameText']}>
                {(f) => (
                  <Input
                    id={f.id}
                    value={d.style.frameText}
                    onChange={(e) => setStyle({ frameText: e.target.value })}
                    maxLength={40}
                    aria-invalid={f.invalid}
                    aria-describedby={f.describedBy}
                  />
                )}
              </Field>
              <Toggle
                checked={d.style.showLogo && hasLogo}
                onChange={(v) => setStyle({ showLogo: v })}
                label="Store logo in the middle"
                description={hasLogo ? 'Kept small so the code still scans.' : 'The store has no logo yet. Add one in store settings first.'}
                disabled={!hasLogo}
              />
              <Button
                variant="quiet"
                onClick={() => setD((x) => ({ ...x, style: SAFE_STYLE }))}
                icon={<RotateCcw size={15} strokeWidth={1.75} aria-hidden />}
              >
                Reset to scan-safe design
              </Button>
            </div>
            <div className="order-first sm:order-none">
              <div className="mx-auto w-full max-w-[11rem] rounded-[var(--radius-photo)] border border-line bg-surface p-2">
                {preview ? (
                  <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`} alt="Design preview" className="w-full" />
                ) : (
                  <Skeleton className="aspect-square w-full" />
                )}
              </div>
              <p className="mt-2 text-center text-[13px] text-ink-2">Design preview with a sample code</p>
            </div>
          </div>
          {(colourProblem || fe['style.foreground']) && <FormAlert>{colourProblem ?? fe['style.foreground']}</FormAlert>}
        </Section>

        {qr && !primary && (
          <Section title="Status">
            <Toggle
              checked={d.isActive}
              onChange={(v) => set('isActive', v)}
              label="Active"
              description="When off, scans open the store without the spot label."
            />
          </Section>
        )}

        <FormAlert>{save.formError}</FormAlert>
      </div>
    </Dialog>
  );
}

/* ---------- Posters ---------- */

function PosterControls({ design, set }: { design: PosterDesign; set: (patch: Partial<PosterDesign>) => void }) {
  const { store } = useStoreWorkspace();
  const storeAccent = read(store, 'theme', 'accentColor');
  const accent = design.accent || (typeof storeAccent === 'string' ? storeAccent : '') || '#0B6B70';
  const fixedOrientation = design.template === 'tent' || design.size === 'square';
  const missing = (v: unknown, what: string) => (v ? undefined : `The store has no ${what} yet.`);

  return (
    <div>
      <Section title="Style">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Poster style">
          {TEMPLATES.map((t) => (
            <RadioCard
              key={t.value}
              name="poster-template"
              checked={design.template === t.value}
              onChange={() => set({ template: t.value })}
              label={t.label}
              hint={t.hint}
            />
          ))}
        </div>
      </Section>

      <Section title="Size and direction">
        <Segmented
          label="Paper size"
          value={design.size}
          onChange={(size) => set({ size })}
          options={(['a6', 'a5', 'a4', 'square'] as const).map((s) => ({
            value: s,
            label: s === 'square' ? 'Sticker' : s.toUpperCase(),
            hint: SIZE_LABEL[s],
          }))}
        />
        <Segmented
          label="Orientation"
          value={fixedOrientation ? 'portrait' : design.orientation}
          onChange={(orientation) => set({ orientation })}
          disabled={fixedOrientation}
          options={[
            { value: 'portrait', label: 'Portrait' },
            { value: 'landscape', label: 'Landscape' },
          ]}
        />
        <p className="text-[13px] text-ink-2">
          {SIZE_LABEL[design.size]}
          {design.template === 'tent' ? '. Prints as two halves; fold along the line so it stands.' : ''}
        </p>
      </Section>

      <Section title="Accent colour">
        <Swatches label="Accent colour" value={accent} options={ACCENTS} onChange={(c) => set({ accent: c })} />
      </Section>

      <Section title="Words">
        <Field label="Headline">
          {(f) => <Input id={f.id} value={design.headline} onChange={(e) => set({ headline: e.target.value })} maxLength={60} />}
        </Field>
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {HEADLINES.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => set({ headline: h })}
              className={cn(
                'rounded-full border px-3 py-1 text-[13px] font-medium',
                design.headline === h ? 'border-ink bg-ink text-paper' : 'border-line-strong bg-surface',
              )}
            >
              {h}
            </button>
          ))}
        </div>
        <Field label="Second line" optional hint="For example: “No app needed. Order from your table.”">
          {(f) => (
            <Input
              id={f.id}
              value={design.subline}
              onChange={(e) => set({ subline: e.target.value })}
              maxLength={90}
              aria-describedby={f.describedBy}
            />
          )}
        </Field>
        <Field label="Small print" optional hint="For example: “Free refills on filter coffee”.">
          {(f) => (
            <Input
              id={f.id}
              value={design.footerNote}
              onChange={(e) => set({ footerNote: e.target.value })}
              maxLength={90}
              aria-describedby={f.describedBy}
            />
          )}
        </Field>
      </Section>

      <Section title="What to show">
        <Toggle checked={design.showLogo} onChange={(v) => set({ showLogo: v })} label="Store logo" description={missing(store.logo, 'logo')} />
        <Toggle checked={design.showSteps} onChange={(v) => set({ showSteps: v })} label="How it works (1 · 2 · 3)" />
        <Toggle
          checked={design.showPhone}
          onChange={(v) => set({ showPhone: v })}
          label="Phone number"
          description={missing(store.phone, 'phone number')}
        />
        <Toggle checked={design.showHours} onChange={(v) => set({ showHours: v })} label="Opening hours" />
        <Toggle
          checked={design.showAddress}
          onChange={(v) => set({ showAddress: v })}
          label="Address"
          description={missing(read(store, 'address', 'line1') || read(store, 'address', 'city'), 'address')}
        />
        <Toggle
          checked={design.showSocial}
          onChange={(v) => set({ showSocial: v })}
          label="Instagram and website"
          description={missing(read(store, 'socialLinks', 'instagram') || read(store, 'socialLinks', 'website'), 'social links')}
        />
        <Toggle checked={design.showWifi} onChange={(v) => set({ showWifi: v })} label="Wi-Fi for customers" />
        {design.showWifi && (
          <div className="grid gap-3 sm:ml-[60px] sm:grid-cols-2">
            <Field label="Network name">
              {(f) => <Input id={f.id} value={design.wifiName} onChange={(e) => set({ wifiName: e.target.value })} maxLength={40} />}
            </Field>
            <Field label="Password" optional>
              {(f) => <Input id={f.id} value={design.wifiPassword} onChange={(e) => set({ wifiPassword: e.target.value })} maxLength={63} />}
            </Field>
          </div>
        )}
        <Toggle
          checked={design.showLink}
          onChange={(v) => set({ showLink: v })}
          label="Short link under the code"
          description="For phones that can’t scan."
        />
        <Toggle checked={design.showBrand} onChange={(v) => set({ showBrand: v })} label={`“Made with ${APP_NAME}” line`} />
      </Section>
    </div>
  );
}

/** Server-rendered, so the preview matches the download exactly. */
function PosterPreview({ storeId, qrId, design }: { storeId: string; qrId?: string; design: PosterDesign }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setBusy(true);
      api<{ svg: string }>(`/stores/${storeId}/qrs/poster/preview`, { body: { design, ...(qrId ? { qrId } : {}) }, signal: ctrl.signal })
        .then((r) => {
          setSvg(r.svg);
          setError('');
        })
        .catch((e: unknown) => {
          if ((e as Error).name !== 'AbortError') setError(errorMessage(e, 'Preview unavailable. Check your connection.'));
        })
        .finally(() => setBusy(false));
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [storeId, qrId, design]);

  return (
    <div>
      {svg ? (
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
          alt="Poster preview"
          className={cn('mx-auto max-h-[60dvh] w-auto max-w-full border border-line bg-white transition-opacity', busy && 'opacity-70')}
        />
      ) : (
        <Skeleton className="mx-auto aspect-[1/1.414] w-full max-w-xs" />
      )}
      {error && <p className="mt-2 text-center text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Save the current design as the store's starting point for posters and sheets. */
function useSaveDefault() {
  const { storeId, can, reload } = useStoreWorkspace();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  async function saveDefault(design: PosterDesign) {
    setSaving(true);
    try {
      await api(`/stores/${storeId}`, { method: 'PATCH', body: { qrDesign: design } });
      reload();
      toast({ tone: 'success', message: 'Saved. New posters and print sheets start from this design.' });
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not save the design.') });
    } finally {
      setSaving(false);
    }
  }
  return { allowed: can('store.settings'), saving, saveDefault };
}

export function PosterDialog({ qr, onClose }: { qr: Qr; onClose: () => void }) {
  const { storeId, store } = useStoreWorkspace();
  const toast = useToast();
  const initial = () => ({ ...DEFAULT_DESIGN, ...savedDesign(store.qrDesign) });
  const [design, setDesign] = useState<PosterDesign>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const def = useSaveDefault();
  const set = (patch: Partial<PosterDesign>) => setDesign((d) => ({ ...d, ...patch }));

  async function download(format: 'png' | 'pdf' | 'svg', open = false) {
    setBusy(open ? 'print' : format);
    try {
      await downloadFrom(`/stores/${storeId}/qrs/${qr.id}/poster`, { design, format }, `poster.${format}`, open);
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'The download failed.') });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Poster for ${qr.isPrimary ? 'the main store code' : qr.name}`} className="w-[min(100%-2rem,64rem)]!">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="lg:order-2">
          <div className="lg:sticky lg:top-0">
            <div className="rounded-[var(--radius-card)] border border-line bg-paper-deep p-4">
              <PosterPreview storeId={storeId} qrId={qr.id} design={design} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button onClick={() => download('pdf')} loading={busy === 'pdf'} icon={<Download size={17} strokeWidth={1.75} aria-hidden />}>
                PDF
              </Button>
              <Button
                variant="secondary"
                onClick={() => download('png')}
                loading={busy === 'png'}
                icon={<Download size={17} strokeWidth={1.75} aria-hidden />}
              >
                PNG
              </Button>
              <Button
                variant="secondary"
                onClick={() => download('svg')}
                loading={busy === 'svg'}
                icon={<Download size={17} strokeWidth={1.75} aria-hidden />}
              >
                SVG
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => download('pdf', true)}
                loading={busy === 'print'}
                icon={<Printer size={17} strokeWidth={1.75} aria-hidden />}
              >
                Open to print
              </Button>
              {def.allowed && (
                <Button variant="quiet" onClick={() => def.saveDefault(design)} loading={def.saving}>
                  Save as the store’s default
                </Button>
              )}
            </div>
            <p className="mt-3 text-sm text-ink-2">
              PDF is best for a print shop, PNG for WhatsApp and Instagram. Print at 100% size and test the code with a phone first.
            </p>
          </div>
        </div>
        <div className="min-w-0 lg:order-1">
          <PosterControls design={design} set={set} />
          <Button variant="quiet" onClick={() => setDesign(initial())} icon={<RotateCcw size={15} strokeWidth={1.75} aria-hidden />}>
            Start again
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

const LAYOUTS = [
  { value: 1, label: '1 per page', hint: 'Uses the size you choose' },
  { value: 2, label: '2 per A4', hint: 'Two A5 posters side by side' },
  { value: 4, label: '4 per A4', hint: 'Four A6 table cards' },
] as const;

/** One PDF with a poster for every chosen code. */
export function SheetDialog({ qrs, onClose }: { qrs: Qr[]; onClose: () => void }) {
  const { storeId, store } = useStoreWorkspace();
  const toast = useToast();
  const active = qrs.filter((q) => q.isActive);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(active.slice(0, MAX_PER_SHEET).map((q) => q.id)));
  const [perPage, setPerPage] = useState<1 | 2 | 4>(4);
  const [design, setDesign] = useState<PosterDesign>(() => ({ ...DEFAULT_DESIGN, ...savedDesign(store.qrDesign) }));
  const [busy, setBusy] = useState<'download' | 'open' | null>(null);
  const def = useSaveDefault();

  const ids = active.filter((q) => picked.has(q.id)).map((q) => q.id);
  const tent = design.template === 'tent';
  const effective = tent ? 1 : perPage;
  const pages = Math.ceil(ids.length / effective);
  const tooMany = ids.length > MAX_PER_SHEET;
  const allOn = ids.length === active.length;
  const previewDesign: PosterDesign =
    effective === 2
      ? { ...design, size: 'a5', orientation: 'portrait' }
      : effective === 4
        ? { ...design, size: 'a6', orientation: 'portrait' }
        : design;

  async function get(open: boolean) {
    setBusy(open ? 'open' : 'download');
    try {
      await downloadFrom(`/stores/${storeId}/qrs/sheet`, { qrIds: ids, perPage: effective, design }, 'qr-sheet.pdf', open);
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not make the PDF.') });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Print many codes at once" className="w-[min(100%-2rem,64rem)]!">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 space-y-6">
          <p className="text-[15px] text-ink-2">
            One PDF with a poster for every chosen code. Cut along the dotted lines. Codes that are off are left out.
          </p>
          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[15px] font-semibold">Codes to print</h3>
              <button
                type="button"
                className="text-sm font-semibold underline underline-offset-4"
                onClick={() => setPicked(allOn ? new Set() : new Set(active.map((q) => q.id)))}
              >
                {allOn ? 'Clear all' : 'Select all'}
              </button>
            </div>
            {active.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">No active codes to print.</p>
            ) : (
              <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                {active.map((q) => (
                  <Checkbox
                    key={q.id}
                    className="rounded-[8px] border border-line bg-surface px-3 py-2.5"
                    checked={picked.has(q.id)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(q.id);
                      else next.delete(q.id);
                      setPicked(next);
                    }}
                    label={q.isPrimary ? 'Store QR code (main)' : q.name}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-[15px] font-semibold">Layout</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {LAYOUTS.map((l) => (
                <label
                  key={l.value}
                  className={cn(
                    'flex cursor-pointer flex-col rounded-[10px] border-[1.5px] bg-surface px-3 py-2.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink',
                    effective === l.value ? 'border-brand bg-brand-tint' : 'border-line',
                    tent && l.value !== 1 && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <input
                    type="radio"
                    name="sheet-layout"
                    className="sr-only"
                    disabled={tent && l.value !== 1}
                    checked={effective === l.value}
                    onChange={() => setPerPage(l.value)}
                  />
                  <span className="text-[15px] font-semibold">{l.label}</span>
                  <span className="text-[13px] text-ink-2">{l.hint}</span>
                </label>
              ))}
            </div>
            {tent && <p className="mt-2 text-sm text-ink-2">Table tents fill a whole page, so they print one per page.</p>}
          </section>

          <section>
            <h3 className="mb-3 text-[15px] font-semibold">Design</h3>
            <PosterControls design={design} set={(p) => setDesign((x) => ({ ...x, ...p }))} />
          </section>
        </div>

        <div className="min-w-0">
          <div className="space-y-4 lg:sticky lg:top-0">
            <div className="rounded-[var(--radius-card)] border border-line bg-paper-deep p-4">
              <p className="mb-3 text-sm font-semibold text-ink-2">How each one looks</p>
              <PosterPreview storeId={storeId} qrId={ids[0]} design={previewDesign} />
            </div>
            <p className="text-[15px]">
              <span className="num font-semibold">{ids.length}</span> code{ids.length === 1 ? '' : 's'} on{' '}
              <span className="num font-semibold">{pages}</span> page
              {pages === 1 ? '' : 's'}
            </p>
            {tooMany && (
              <p className="text-[15px] text-danger" role="status">
                One PDF can hold up to {MAX_PER_SHEET} codes. Untick some and print the rest in a second PDF.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => get(false)}
                loading={busy === 'download'}
                disabled={!ids.length || tooMany}
                icon={<Download size={17} strokeWidth={1.75} aria-hidden />}
              >
                Download PDF
              </Button>
              <Button
                variant="secondary"
                onClick={() => get(true)}
                loading={busy === 'open'}
                disabled={!ids.length || tooMany}
                icon={<Printer size={17} strokeWidth={1.75} aria-hidden />}
              >
                Open to print
              </Button>
            </div>
            {def.allowed && (
              <Button variant="quiet" onClick={() => def.saveDefault(design)} loading={def.saving}>
                Save design as the store’s default
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
