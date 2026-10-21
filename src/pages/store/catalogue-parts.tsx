import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  CornerDownRight,
  Download,
  Eye,
  EyeOff,
  FileUp,
  ImagePlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useStoreWorkspace } from '@/components/store-context';
import { Button, Spinner } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea, Toggle } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { PriceInput } from '@/components/ui/price-input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { api, isApiError, renewSession } from '@/lib/api';
import { cn } from '@/lib/cn';
import { imgProps } from '@/lib/image';
import { useSubmit } from '@/lib/use-submit';

/* ---------- API shapes (api/src/modules/catalogue) ---------- */

export type ImageRef = {
  url: string;
  publicId: string;
  key?: string | null;
  provider?: string | null;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
};

export type Dietary = 'veg' | 'non_veg' | 'egg' | 'vegan';
export type Badge = 'bestseller' | 'new' | 'chef_special' | 'recommended' | 'limited' | 'seasonal';
export type Allergen = 'gluten' | 'dairy' | 'nuts' | 'peanuts' | 'egg' | 'soy' | 'fish' | 'shellfish' | 'sesame' | 'mustard';
export type Option = { _id?: string; name: string; price: number; isAvailable?: boolean; dietary?: Dietary | null };
export type Attribute = { label: string; value: string };

export type Item = {
  id: string;
  categoryId: string | null;
  kind: 'product' | 'service';
  name: string;
  description: string;
  images: ImageRef[];
  sku: string;
  unitLabel: string;
  basePrice: number;
  salePrice: number | null;
  variants: Option[];
  addOns: Option[];
  maxAddOns: number | null;
  trackStock: boolean;
  stockQuantity: number | null;
  isAvailable: boolean;
  visibility: 'visible' | 'hidden';
  sortOrder: number;
  dietary: Dietary | null;
  spiceLevel: number | null;
  badges: Badge[];
  isFeatured: boolean;
  tags: string[];
  allergens: Allergen[];
  prepTimeMinutes: number | null;
  serves: number | null;
  attributes: Attribute[];
  rating?: { average: number; count: number };
  updatedAt: string;
};

export type Category = {
  id: string;
  parentId: string | null;
  name: string;
  description: string;
  image: ImageRef | null;
  sortOrder: number;
  isActive: boolean;
  itemCount: number;
};

export type CategoryList = { categories: Category[]; uncategorisedCount: number };

export const DIETARY_LABEL: Record<Dietary, string> = { veg: 'Veg', non_veg: 'Non-veg', egg: 'Contains egg', vegan: 'Vegan' };
export const BADGE_LABEL: Record<Badge, string> = {
  bestseller: 'Bestseller',
  new: 'New',
  chef_special: 'Chef’s special',
  recommended: 'Must try',
  limited: 'Limited',
  seasonal: 'Seasonal',
};
const ALLERGEN_LABEL: Record<Allergen, string> = {
  gluten: 'Gluten',
  dairy: 'Dairy',
  nuts: 'Tree nuts',
  peanuts: 'Peanuts',
  egg: 'Egg',
  soy: 'Soy',
  fish: 'Fish',
  shellfish: 'Shellfish',
  sesame: 'Sesame',
  mustard: 'Mustard',
};
const SPICE_LABEL = ['Not spicy', 'Mild', 'Medium', 'Hot'];
const FOOD_BUSINESSES = ['restaurant', 'cafe', 'bakery', 'kirana'];

/* ---------- Small helpers ---------- */

/** "1 dish", "3 dishes", "2 items". */
export function plural(n: number, word: string) {
  if (n === 1) return `${n} ${word}`;
  return `${n} ${/(s|sh|ch|x)$/.test(word) ? `${word}es` : `${word}s`}`;
}

export const pluralWord = (word: string) => (/(s|sh|ch|x)$/.test(word) ? `${word}es` : `${word}s`);

export const errorText = (err: unknown, fallback = 'Something went wrong. Please try again.') => (isApiError(err) ? err.message : fallback);

/** Whether this store shows the veg / non-veg marks: the store's own setting, else its business type. */
export function useDietaryMarks() {
  const { store, preset } = useStoreWorkspace();
  const setting = (store.catalogue as { dietaryMarks?: boolean | null } | undefined)?.dietaryMarks;
  return setting ?? preset.dietaryMarks ?? false;
}

/** Main categories, each followed by its sub-categories (indented). */
export function categoryOptions(list: Category[]) {
  const ids = new Set(list.map((c) => c.id));
  const top = list.filter((c) => !c.parentId || !ids.has(c.parentId));
  return top.flatMap((c) => [
    { id: c.id, label: c.name },
    ...list.filter((x) => x.parentId === c.id).map((x) => ({ id: x.id, label: `  ↳ ${x.name}` })),
  ]);
}

const MARK: Record<Dietary, { color: string; shape: 'dot' | 'triangle' }> = {
  veg: { color: '#1E7A4C', shape: 'dot' },
  vegan: { color: '#1E7A4C', shape: 'dot' },
  non_veg: { color: '#8B3A1E', shape: 'triangle' },
  egg: { color: '#9A6400', shape: 'dot' },
};

/** The FSSAI food mark: green dot for veg, brown triangle for non-veg. Always carries a text label. */
export function DietaryMark({ value, size = 14 }: { value: Dietary; size?: number }) {
  const m = MARK[value];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={DIETARY_LABEL[value]} className="inline-block shrink-0">
      <title>{DIETARY_LABEL[value]}</title>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="var(--surface)" stroke={m.color} strokeWidth="1.6" />
      {m.shape === 'dot' ? <circle cx="8" cy="8" r="3.6" fill={m.color} /> : <path d="M8 4.2 L12 11.4 L4 11.4 Z" fill={m.color} />}
    </svg>
  );
}

const iconBtn = 'inline-flex size-10 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-paper hover:text-ink disabled:opacity-30';

/* ---------- Image upload ---------- */

const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Uploads through the API (which checks the real file type) and returns image references. */
export function ImageUploader({
  value,
  onChange,
  max = 1,
  purpose,
  label = 'Add photo',
}: {
  value: ImageRef[];
  onChange: (images: ImageRef[]) => void;
  max?: number;
  purpose: 'item' | 'category';
  label?: string;
}) {
  const { storeId } = useStoreWorkspace();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState('');

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    const chosen = Array.from(files).slice(0, max - value.length);
    const bad = chosen.find((f) => !IMAGE_TYPES.includes(f.type) || f.size > MAX_BYTES);
    if (bad) {
      setError(bad.size > MAX_BYTES ? `“${bad.name}” is over 5 MB. Try a smaller photo.` : 'Use a JPG, PNG or WebP photo.');
      return;
    }
    setBusy(true);
    const uploaded: ImageRef[] = [];
    try {
      for (const f of chosen) {
        const form = new FormData();
        // The purpose goes first so the API knows the folder before the file arrives.
        form.append('purpose', purpose);
        form.append('file', f);
        const res = await api<{ image: ImageRef }>(`/stores/${storeId}/uploads`, { form, signal: AbortSignal.timeout(60_000) });
        uploaded.push(res.image);
      }
    } catch (err) {
      if (isApiError(err) && err.code === 'MEDIA_UNAVAILABLE') setUnavailable(err.message);
      else setError(errorText(err, 'The upload failed. Please try again.'));
    } finally {
      if (uploaded.length) onChange([...value, ...uploaded]);
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {value.map((img, i) => (
          <div key={img.publicId} className="relative size-24 overflow-hidden rounded-[var(--radius-photo)] border border-line bg-paper">
            <img {...imgProps(img.url, 96)} alt="" decoding="async" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="absolute right-1 top-1 rounded-full bg-ink/80 p-1.5 text-paper hover:bg-ink disabled:hidden"
              aria-label={`Remove photo ${i + 1}`}
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}
        {value.length < max && !unavailable && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="flex size-24 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-photo)] border-[1.5px] border-dashed border-line-strong bg-surface text-[14px] font-semibold text-ink-2 hover:border-ink-3 hover:text-ink disabled:opacity-60"
          >
            {busy ? <Spinner /> : <ImagePlus size={20} strokeWidth={1.75} aria-hidden />}
            {busy ? 'Uploading' : label}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept={IMAGE_TYPES.join(',')} multiple={max > 1} className="hidden" onChange={(e) => onFiles(e.target.files)} />
      {unavailable ? (
        <div className="mt-2">
          <FormAlert tone="info">{unavailable} Everything else saves as normal.</FormAlert>
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-2">JPG, PNG or WebP, up to 5 MB{max > 1 ? `, ${max} photos max` : ''}.</p>
      )}
      {error && (
        <p className="mt-1 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------- Item editor ---------- */

type Draft = {
  name: string;
  kind: 'product' | 'service';
  basePrice: number | null;
  salePrice: number | null;
  categoryId: string;
  unitLabel: string;
  description: string;
  images: ImageRef[];
  variants: Option[];
  addOns: Option[];
  maxAddOns: number | null;
  trackStock: boolean;
  stockQuantity: number | null;
  isAvailable: boolean;
  visibility: 'visible' | 'hidden';
  sortOrder: number;
  sku: string;
  dietary: Dietary | null;
  spiceLevel: number | null;
  badges: Badge[];
  isFeatured: boolean;
  tags: string;
  allergens: Allergen[];
  prepTimeMinutes: number | null;
  serves: number | null;
  attributes: Attribute[];
};

const fromItem = (i: Item | null, categoryId = ''): Draft => ({
  name: i?.name ?? '',
  kind: i?.kind ?? 'product',
  basePrice: i?.basePrice ?? null,
  salePrice: i?.salePrice ?? null,
  categoryId: i ? (i.categoryId ?? '') : categoryId,
  unitLabel: i?.unitLabel ?? '',
  description: i?.description ?? '',
  images: i?.images ?? [],
  variants: i?.variants ?? [],
  addOns: i?.addOns ?? [],
  maxAddOns: i?.maxAddOns ?? null,
  trackStock: i?.trackStock ?? false,
  stockQuantity: i?.stockQuantity ?? null,
  isAvailable: i?.isAvailable ?? true,
  visibility: i?.visibility ?? 'visible',
  sortOrder: i?.sortOrder ?? 0,
  sku: i?.sku ?? '',
  dietary: i?.dietary ?? null,
  spiceLevel: i?.spiceLevel ?? null,
  badges: i?.badges ?? [],
  isFeatured: i?.isFeatured ?? false,
  tags: (i?.tags ?? []).join(', '),
  allergens: i?.allergens ?? [],
  prepTimeMinutes: i?.prepTimeMinutes ?? null,
  serves: i?.serves ?? null,
  attributes: i?.attributes ?? [],
});

/** Field errors the editor shows next to a field; anything else is listed under the form. */
const SHOWN_FIELDS = [
  'name',
  'basePrice',
  'salePrice',
  'categoryId',
  'description',
  'unitLabel',
  'sku',
  'tags',
  'stockQuantity',
  'prepTimeMinutes',
  'serves',
];

/** Optional detail tucked behind a disclosure, open when it already has content. */
function Section({ title, hint, defaultOpen, children }: { title: string; hint: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group border-t border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-semibold">{title}</span>
          <span className="text-sm text-ink-2">{hint}</span>
        </span>
        <ChevronDown size={20} strokeWidth={1.75} className="shrink-0 text-ink-2 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pb-6">{children}</div>
    </details>
  );
}

function OptionsEditor({
  value,
  onChange,
  nameLabel,
  addLabel,
  max,
  withMarks,
}: {
  value: Option[];
  onChange: (v: Option[]) => void;
  nameLabel: string;
  addLabel: string;
  max: number;
  withMarks?: boolean;
}) {
  const set = (i: number, patch: Partial<Option>) => onChange(value.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <div className="space-y-3">
      {value.map((o, i) => (
        <div key={o._id ?? `new-${i}`} className="flex flex-wrap items-center gap-2 border-b border-line pb-3 last:border-b-0 sm:border-0 sm:pb-0">
          <Input
            aria-label={`${nameLabel} ${i + 1}`}
            placeholder={nameLabel}
            value={o.name}
            onChange={(e) => set(i, { name: e.target.value })}
            maxLength={60}
            className="min-w-0 flex-1 basis-40"
          />
          <div className="w-28">
            <PriceInput
              aria-label={`Price of ${o.name || `${nameLabel.toLowerCase()} ${i + 1}`}`}
              value={o.price}
              onValueChange={(p) => set(i, { price: p ?? Number.NaN })}
            />
          </div>
          {withMarks && (
            <Select
              aria-label={`Food type of ${o.name || `${nameLabel.toLowerCase()} ${i + 1}`}`}
              value={o.dietary ?? ''}
              onChange={(e) => set(i, { dietary: (e.target.value || null) as Dietary | null })}
              className="w-32 px-2 text-[14px]"
            >
              <option value="">Food type</option>
              {(Object.keys(DIETARY_LABEL) as Dietary[]).map((k) => (
                <option key={k} value={k}>
                  {k === 'egg' ? 'Egg' : DIETARY_LABEL[k]}
                </option>
              ))}
            </Select>
          )}
          <Checkbox
            label="Available"
            checked={o.isAvailable !== false}
            onChange={(e) => set(i, { isAvailable: e.target.checked })}
            className="px-1"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="inline-flex size-11 items-center justify-center rounded-md text-ink-2 hover:bg-paper hover:text-danger"
            aria-label={`Remove ${o.name || `${nameLabel.toLowerCase()} ${i + 1}`}`}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      ))}
      {value.length < max && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange([...value, { name: '', price: 0, isAvailable: true }])}
          icon={<Plus size={16} strokeWidth={1.75} aria-hidden />}
        >
          {addLabel}
        </Button>
      )}
    </div>
  );
}

function AttributesEditor({ value, onChange }: { value: Attribute[]; onChange: (v: Attribute[]) => void }) {
  const set = (i: number, patch: Partial<Attribute>) => onChange(value.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <fieldset>
      <legend className="text-[15px] font-semibold">Details</legend>
      <p className="text-sm text-ink-2">A table on the product page, like “Net weight: 500 g”.</p>
      <div className="mt-2 space-y-2">
        {value.map((a, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-2">
            <Input
              aria-label={`Detail ${i + 1} name`}
              placeholder="Name"
              value={a.label}
              maxLength={40}
              onChange={(e) => set(i, { label: e.target.value })}
            />
            <Input
              aria-label={`Detail ${i + 1} value`}
              placeholder="Value"
              value={a.value}
              maxLength={120}
              onChange={(e) => set(i, { value: e.target.value })}
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="inline-flex size-11 items-center justify-center rounded-md text-ink-2 hover:bg-paper hover:text-danger"
              aria-label={`Remove ${a.label || `detail ${i + 1}`}`}
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      {value.length < 12 && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          onClick={() => onChange([...value, { label: '', value: '' }])}
          icon={<Plus size={16} strokeWidth={1.75} aria-hidden />}
        >
          Add detail
        </Button>
      )}
    </fieldset>
  );
}

const numberOrNull = (v: string, min: number, max: number) => (v === '' ? null : Math.min(max, Math.max(min, Math.round(Number(v)))));

/**
 * Add or edit one item, with every field the API accepts. Opened with `item` null to add.
 * Without catalogue.edit the form is shown read-only.
 */
export function ItemEditor({
  item,
  categories,
  defaultCategoryId,
  onClose,
  onSaved,
  onDuplicated,
  onDeleted,
}: {
  item: Item | null;
  categories: Category[];
  defaultCategoryId?: string;
  onClose: () => void;
  onSaved: (item: Item, created: boolean) => void;
  onDuplicated: (copy: Item) => void;
  onDeleted: (item: Item) => void;
}) {
  const { storeId, store, preset, can } = useStoreWorkspace();
  const toast = useToast();
  const canEdit = can('catalogue.edit');
  const [d, setD] = useState<Draft>(() => fromItem(item, defaultCategoryId));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSubmit();
  const dup = useSubmit();
  const remove = useSubmit();
  const label = preset.itemLabel;
  const marksOn = useDietaryMarks() || Boolean(d.dietary);
  const isFood = marksOn || FOOD_BUSINESSES.includes(store.businessType);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const fe = save.fieldErrors;
  const otherErrors = Object.entries(fe).filter(([k]) => !SHOWN_FIELDS.includes(k));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    if (!d.name.trim()) return save.setFormError('Enter a name.');
    if (d.basePrice === null) return save.setFormError('Enter a price, like 20 or 49.50.');
    if ([...d.variants, ...d.addOns].some((o) => o.name.trim() && !Number.isFinite(o.price))) {
      return save.setFormError('One of the option prices isn’t a number. Enter it like 20 or 49.50.');
    }
    const body = {
      ...d,
      name: d.name.trim(),
      categoryId: d.categoryId || null,
      variants: d.variants
        .filter((v) => v.name.trim())
        .map(({ _id, name, price, isAvailable }) => ({ ...(_id ? { _id } : {}), name: name.trim(), price, isAvailable: isAvailable !== false })),
      addOns: d.addOns
        .filter((v) => v.name.trim())
        .map(({ _id, name, price, isAvailable, dietary }) => ({
          ...(_id ? { _id } : {}),
          name: name.trim(),
          price,
          isAvailable: isAvailable !== false,
          dietary: dietary ?? null,
        })),
      maxAddOns: d.addOns.length > 1 ? d.maxAddOns : null,
      stockQuantity: d.trackStock ? (d.stockQuantity ?? 0) : null,
      tags: [
        ...new Set(
          d.tags
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
        ),
      ].slice(0, 10),
      attributes: d.attributes.map((a) => ({ label: a.label.trim(), value: a.value.trim() })).filter((a) => a.label && a.value),
    };
    const res = await save.run(() =>
      item
        ? api<{ item: Item }>(`/stores/${storeId}/items/${item.id}`, { method: 'PATCH', body })
        : api<{ item: Item }>(`/stores/${storeId}/items`, { body }),
    );
    if (!res) return;
    toast({ tone: 'success', message: item ? `Saved ${res.item.name}` : `Added ${res.item.name}` });
    onSaved(res.item, !item);
  }

  async function duplicate() {
    if (!item) return;
    const res = await dup.run(
      () => api<{ item: Item }>(`/stores/${storeId}/items/${item.id}/duplicate`, { method: 'POST' }),
      (err) => {
        toast({ tone: 'error', message: err.message });
        return true;
      },
    );
    if (res) {
      toast({ tone: 'success', message: 'Copy made. It’s hidden from customers until you show it.' });
      onDuplicated(res.item);
    }
  }

  async function onDelete() {
    if (!item) return;
    const ok = await remove.run(() => api(`/stores/${storeId}/items/${item.id}`, { method: 'DELETE' }));
    if (ok) {
      toast({ tone: 'success', message: `Deleted ${item.name}` });
      setConfirmDelete(false);
      onDeleted(item);
    }
  }

  const title = item ? (canEdit ? `Edit ${item.name}` : item.name) : `Add ${label}`;

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={title}
        className="w-[min(100%-2rem,46rem)]!"
        footer={
          <>
            {item && canEdit && (
              <span className="mr-auto flex gap-2">
                <Button variant="danger" onClick={() => setConfirmDelete(true)} icon={<Trash2 size={16} strokeWidth={1.75} aria-hidden />}>
                  Delete
                </Button>
                <Button variant="secondary" onClick={duplicate} loading={dup.pending} icon={<Copy size={16} strokeWidth={1.75} aria-hidden />}>
                  Duplicate
                </Button>
              </span>
            )}
            <Button variant="secondary" onClick={onClose}>
              {canEdit ? 'Cancel' : 'Close'}
            </Button>
            {canEdit && (
              <Button type="submit" form="item-editor" loading={save.pending}>
                {item ? 'Save changes' : `Add ${label}`}
              </Button>
            )}
          </>
        }
      >
        {!canEdit && (
          <div className="mb-4">
            <FormAlert tone="info">Your admin role can view this {label} but not change it.</FormAlert>
          </div>
        )}
        <form id="item-editor" onSubmit={onSubmit} noValidate>
          <fieldset disabled={!canEdit} className="min-w-0">
            <div className="space-y-5 pb-6">
              <Field label="Name" error={fe.name}>
                {(f) => (
                  <Input
                    id={f.id}
                    value={d.name}
                    onChange={(e) => set('name', e.target.value)}
                    maxLength={100}
                    autoFocus={!item}
                    aria-invalid={f.invalid}
                    aria-describedby={f.describedBy}
                  />
                )}
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Price" error={fe.basePrice}>
                  {(f) => (
                    <PriceInput
                      id={f.id}
                      value={d.basePrice}
                      onValueChange={(v) => set('basePrice', v)}
                      aria-invalid={f.invalid}
                      aria-describedby={f.describedBy}
                    />
                  )}
                </Field>
                <Field label="Category" error={fe.categoryId}>
                  {(f) => (
                    <Select id={f.id} value={d.categoryId} onChange={(e) => set('categoryId', e.target.value)} aria-invalid={f.invalid}>
                      <option value="">No category</option>
                      {categoryOptions(categories).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              {marksOn && (
                <fieldset>
                  <legend className="text-[15px] font-semibold">Food type</legend>
                  <p className="mb-2 text-sm text-ink-2">Shown as the green or brown mark, and used by the “Veg” filter.</p>
                  <Segmented<'' | Dietary>
                    label="Food type"
                    value={d.dietary ?? ''}
                    onChange={(v) => set('dietary', v || null)}
                    disabled={!canEdit}
                    options={[
                      { value: '', label: 'Not set' },
                      { value: 'veg', label: 'Veg' },
                      { value: 'non_veg', label: 'Non-veg' },
                      { value: 'egg', label: 'Egg' },
                      { value: 'vegan', label: 'Vegan' },
                    ]}
                  />
                </fieldset>
              )}
              <Toggle
                checked={d.isAvailable}
                onChange={(v) => set('isAvailable', v)}
                disabled={!canEdit}
                label="Available to order"
                description="Turn off when it’s finished for the day. It stays in the catalogue."
              />
            </div>

            <Section title="Photos" hint="Up to five. The first one is shown in the list." defaultOpen={d.images.length > 0}>
              {canEdit ? (
                <ImageUploader value={d.images} onChange={(v) => set('images', v)} max={5} purpose="item" />
              ) : d.images.length ? (
                <div className="flex flex-wrap gap-3">
                  {d.images.map((img) => (
                    <img
                      key={img.publicId}
                      {...imgProps(img.url, 96)}
                      alt=""
                      className="size-24 rounded-[var(--radius-photo)] border border-line object-cover"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-ink-2">No photos.</p>
              )}
            </Section>

            <Section title="Description and unit" hint="What’s in it, size or weight." defaultOpen={Boolean(d.description || d.unitLabel)}>
              <div className="space-y-5">
                <Field label="Description" optional hint={`Shown in full on the product page. ${d.description.length}/2000`} error={fe.description}>
                  {(f) => (
                    <Textarea
                      id={f.id}
                      value={d.description}
                      onChange={(e) => set('description', e.target.value)}
                      maxLength={2000}
                      rows={4}
                      aria-invalid={f.invalid}
                    />
                  )}
                </Field>
                <Field label="Unit or size" optional hint="Shown next to the price, like “1 kg”, “500 ml” or “per plate”." error={fe.unitLabel}>
                  {(f) => (
                    <Input id={f.id} value={d.unitLabel} onChange={(e) => set('unitLabel', e.target.value)} maxLength={30} aria-invalid={f.invalid} />
                  )}
                </Field>
              </div>
            </Section>

            <Section title="Sale price" hint="Show a lower price with the original crossed out." defaultOpen={d.salePrice !== null}>
              <Field
                label="Sale price"
                optional
                hint="Must be lower than the price. Leave empty for no sale."
                error={fe.salePrice}
                className="max-w-56"
              >
                {(f) => (
                  <PriceInput
                    id={f.id}
                    value={d.salePrice}
                    onValueChange={(v) => set('salePrice', v)}
                    aria-invalid={f.invalid}
                    aria-describedby={f.describedBy}
                  />
                )}
              </Field>
            </Section>

            <Section
              title="Options"
              hint="Choose one, like Small / Large or Half / Full. Each has its own price."
              defaultOpen={d.variants.length > 0}
            >
              <OptionsEditor value={d.variants} onChange={(v) => set('variants', v)} nameLabel="Option name" addLabel="Add option" max={20} />
            </Section>

            <Section title="Add-ons" hint="Extras customers can add, like extra cheese." defaultOpen={d.addOns.length > 0}>
              <OptionsEditor
                value={d.addOns}
                onChange={(v) => set('addOns', v)}
                nameLabel="Add-on name"
                addLabel="Add add-on"
                max={30}
                withMarks={marksOn}
              />
              {d.addOns.length > 1 && (
                <Field label="Most add-ons a customer can pick" optional className="mt-5 max-w-64">
                  {(f) => (
                    <Input
                      id={f.id}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={30}
                      value={d.maxAddOns ?? ''}
                      onChange={(e) => set('maxAddOns', numberOrNull(e.target.value, 1, 30))}
                    />
                  )}
                </Field>
              )}
            </Section>

            <Section title="Stock" hint="Count how many there are. It shows as sold out at zero." defaultOpen={d.trackStock}>
              <div className="space-y-4">
                <Toggle checked={d.trackStock} onChange={(v) => set('trackStock', v)} disabled={!canEdit} label={`Track stock for this ${label}`} />
                {d.trackStock && (
                  <Field label="In stock now" error={fe.stockQuantity} className="max-w-48">
                    {(f) => (
                      <Input
                        id={f.id}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={d.stockQuantity ?? ''}
                        onChange={(e) => set('stockQuantity', numberOrNull(e.target.value, 0, 1_000_000))}
                        aria-invalid={f.invalid}
                      />
                    )}
                  </Field>
                )}
              </div>
            </Section>

            <Section
              title="Labels and highlights"
              hint="Bestseller, New, Chef’s special. Featured items show at the top of the store page."
              defaultOpen={d.badges.length > 0 || d.isFeatured}
            >
              <div className="space-y-5">
                <fieldset>
                  <legend className="text-[15px] font-semibold">Labels</legend>
                  <p className="mb-2 text-sm text-ink-2">Pick up to three.</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {(Object.keys(BADGE_LABEL) as Badge[]).map((b) => {
                      const on = d.badges.includes(b);
                      return (
                        <Checkbox
                          key={b}
                          label={BADGE_LABEL[b]}
                          checked={on}
                          disabled={!on && d.badges.length >= 3}
                          onChange={(e) => set('badges', e.target.checked ? [...d.badges, b] : d.badges.filter((x) => x !== b))}
                        />
                      );
                    })}
                  </div>
                </fieldset>
                <Toggle
                  checked={d.isFeatured}
                  onChange={(v) => set('isFeatured', v)}
                  disabled={!canEdit}
                  label="Feature at the top of the store page"
                  description="Shown in “Popular here” and suggested on other product pages."
                />
              </div>
            </Section>

            {isFood && (
              <Section
                title="Food details"
                hint="Spice level, how long it takes, how many it serves, and allergens."
                defaultOpen={d.spiceLevel != null || d.prepTimeMinutes != null || d.serves != null || d.allergens.length > 0}
              >
                <div className="space-y-5">
                  <fieldset>
                    <legend className="mb-2 text-[15px] font-semibold">Spice level</legend>
                    <Segmented<string>
                      label="Spice level"
                      value={d.spiceLevel == null ? '' : String(d.spiceLevel)}
                      onChange={(v) => set('spiceLevel', v === '' ? null : Number(v))}
                      disabled={!canEdit}
                      options={[{ value: '', label: 'Not set' }, ...SPICE_LABEL.map((l, i) => ({ value: String(i), label: l }))]}
                    />
                  </fieldset>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Ready in (minutes)" optional error={fe.prepTimeMinutes}>
                      {(f) => (
                        <Input
                          id={f.id}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={600}
                          value={d.prepTimeMinutes ?? ''}
                          onChange={(e) => set('prepTimeMinutes', numberOrNull(e.target.value, 0, 600))}
                          aria-invalid={f.invalid}
                        />
                      )}
                    </Field>
                    <Field label="Serves" optional hint="Number of people." error={fe.serves}>
                      {(f) => (
                        <Input
                          id={f.id}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={50}
                          value={d.serves ?? ''}
                          onChange={(e) => set('serves', numberOrNull(e.target.value, 1, 50))}
                          aria-invalid={f.invalid}
                        />
                      )}
                    </Field>
                  </div>
                  <fieldset>
                    <legend className="text-[15px] font-semibold">Contains</legend>
                    <p className="mb-2 text-sm text-ink-2">Common allergens, so customers can check before ordering.</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(Object.keys(ALLERGEN_LABEL) as Allergen[]).map((a) => (
                        <Checkbox
                          key={a}
                          label={ALLERGEN_LABEL[a]}
                          checked={d.allergens.includes(a)}
                          onChange={(e) => set('allergens', e.target.checked ? [...d.allergens, a] : d.allergens.filter((x) => x !== a))}
                        />
                      ))}
                    </div>
                  </fieldset>
                </div>
              </Section>
            )}

            <Section
              title="Details and search words"
              hint="Product details table, and words that help customers find it."
              defaultOpen={d.attributes.length > 0 || Boolean(d.tags)}
            >
              <div className="space-y-5">
                <AttributesEditor value={d.attributes} onChange={(v) => set('attributes', v)} />
                <Field
                  label="Search words"
                  optional
                  hint="Separate with commas, like “paneer, starter, spicy”. Up to 10. Not shown on the page."
                  error={fe.tags}
                >
                  {(f) => <Input id={f.id} value={d.tags} onChange={(e) => set('tags', e.target.value)} maxLength={330} aria-invalid={f.invalid} />}
                </Field>
              </div>
            </Section>

            <Section
              title="Visibility, type and code"
              hint="Hide without deleting, set the order on the store page, or add an item code."
              defaultOpen={d.visibility === 'hidden' || Boolean(d.sku) || d.kind === 'service' || d.sortOrder !== 0}
            >
              <div className="space-y-5">
                <Toggle
                  checked={d.visibility === 'visible'}
                  onChange={(v) => set('visibility', v ? 'visible' : 'hidden')}
                  disabled={!canEdit}
                  label="Show on store page"
                  description="Hidden items stay in the catalogue but customers can’t see them."
                />
                <fieldset>
                  <legend className="mb-2 text-[15px] font-semibold">Type</legend>
                  <Segmented<'product' | 'service'>
                    label="Type"
                    value={d.kind}
                    onChange={(v) => set('kind', v)}
                    disabled={!canEdit}
                    options={[
                      { value: 'product', label: 'Product' },
                      { value: 'service', label: 'Service' },
                    ]}
                  />
                </fieldset>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Position" optional hint="Lower numbers show first on the store page." error={fe.sortOrder}>
                    {(f) => (
                      <Input
                        id={f.id}
                        type="number"
                        inputMode="numeric"
                        value={d.sortOrder}
                        onChange={(e) => set('sortOrder', numberOrNull(e.target.value, -1_000_000, 1_000_000) ?? 0)}
                        aria-invalid={f.invalid}
                      />
                    )}
                  </Field>
                  <Field label="Item code" optional hint="For the shop’s reference. Customers don’t see it." error={fe.sku}>
                    {(f) => <Input id={f.id} value={d.sku} onChange={(e) => set('sku', e.target.value)} maxLength={40} aria-invalid={f.invalid} />}
                  </Field>
                </div>
              </div>
            </Section>
          </fieldset>
          {(save.formError || otherErrors.length > 0) && (
            <div className="mt-2 space-y-2">
              <FormAlert>{save.formError || 'Please check the fields below.'}</FormAlert>
              {otherErrors.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-danger">
                  {otherErrors.map(([k, msg]) => (
                    <li key={k}>{msg}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </form>
      </Dialog>

      {item && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={onDelete}
          loading={remove.pending}
          title={`Delete ${item.name}?`}
          confirmLabel="Delete for good"
        >
          <p>It will disappear from the store page and can’t be brought back.</p>
          <p className="mt-2">
            Only out for today? <strong className="text-ink">Turn off “Available to order”</strong> instead.
          </p>
          {remove.formError && (
            <div className="mt-3">
              <FormAlert>{remove.formError}</FormAlert>
            </div>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

/** Sets the stock count without opening the full editor. Allowed with catalogue.availability. */
export function StockDialog({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: (item: Item) => void }) {
  const { storeId } = useStoreWorkspace();
  const toast = useToast();
  const { pending, fieldErrors, formError, run } = useSubmit();
  const [qty, setQty] = useState(String(item.stockQuantity ?? 0));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Math.max(0, Math.round(Number(qty) || 0));
    const res = await run(() => api<{ item: Item }>(`/stores/${storeId}/items/${item.id}`, { method: 'PATCH', body: { stockQuantity: n } }));
    if (res) {
      toast({ tone: 'success', message: `${res.item.name}: ${res.item.stockQuantity ?? 0} in stock` });
      onSaved(res.item);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Stock for ${item.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="stock-form" loading={pending}>
            Save stock
          </Button>
        </>
      }
    >
      <form id="stock-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="In stock now" hint="At zero it shows as sold out." error={fieldErrors.stockQuantity}>
          {(f) => (
            <Input
              id={f.id}
              type="number"
              inputMode="numeric"
              min={0}
              max={1_000_000}
              value={qty}
              autoFocus
              onChange={(e) => setQty(e.target.value)}
              aria-invalid={f.invalid}
              aria-describedby={f.describedBy}
              className="max-w-40"
            />
          )}
        </Field>
        <FormAlert>{formError}</FormAlert>
      </form>
    </Dialog>
  );
}

/* ---------- Categories ---------- */

type Node = Category & { children: Category[] };
type CategoryDraft = {
  id: string;
  name: string;
  description: string;
  parentId: string;
  image: ImageRef | null;
  isActive: boolean;
  hasChildren: boolean;
};

function buildTree(list: Category[]): Node[] {
  const ids = new Set(list.map((c) => c.id));
  const top = list.filter((c) => !c.parentId || !ids.has(c.parentId));
  return top.map((c) => ({ ...c, children: list.filter((x) => x.parentId === c.id) }));
}
const flatten = (tree: Node[]) => tree.flatMap((n) => [n, ...n.children]);

/** List, add, rename, nest, hide, reorder and delete categories. */
export function CategoriesView({
  data,
  error,
  reload,
  onShowItems,
}: {
  data: CategoryList | undefined;
  error: unknown;
  reload: () => void;
  onShowItems: (categoryId: string) => void;
}) {
  const { storeId, preset, can } = useStoreWorkspace();
  const canEdit = can('catalogue.edit');
  const toast = useToast();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [editing, setEditing] = useState<CategoryDraft | null>(null);
  const [deleting, setDeleting] = useState<Node | null>(null);
  const [busy, setBusy] = useState(false);
  const add = useSubmit();
  const edit = useSubmit();
  const del = useSubmit();
  const label = preset.itemLabel;

  const tree = useMemo(() => buildTree(data?.categories ?? []), [data]);
  const fail = (err: unknown) => toast({ tone: 'error', message: errorText(err) });

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const res = await add.run(() =>
      api<{ category: Category }>(`/stores/${storeId}/categories`, { body: { name: name.trim(), parentId: parentId || null } }),
    );
    if (res) {
      toast({ tone: 'success', message: `Added ${res.category.name}` });
      setName('');
      reload();
    }
  }

  /** Moves within its own level, then saves the whole order. */
  async function move(siblings: Category[], index: number, dir: -1 | 1, parent?: string) {
    const next = siblings.slice();
    const [moved] = next.splice(index, 1);
    next.splice(index + dir, 0, moved!);
    const nextTree = parent ? tree.map((n) => (n.id === parent ? { ...n, children: next } : n)) : next.map((s) => tree.find((n) => n.id === s.id)!);
    setBusy(true);
    try {
      await api(`/stores/${storeId}/categories/reorder`, { body: { ids: flatten(nextTree).map((c) => c.id) } });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
      reload();
    }
  }

  async function toggleActive(c: Category) {
    setBusy(true);
    try {
      await api(`/stores/${storeId}/categories/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } });
      toast({ tone: 'success', message: c.isActive ? `${c.name} is hidden from customers` : `${c.name} is showing again` });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
      reload();
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const ok = await edit.run(() =>
      api(`/stores/${storeId}/categories/${editing.id}`, {
        method: 'PATCH',
        body: {
          name: editing.name.trim(),
          description: editing.description,
          parentId: editing.parentId || null,
          image: editing.image,
          isActive: editing.isActive,
        },
      }),
    );
    if (ok) {
      toast({ tone: 'success', message: 'Category saved' });
      setEditing(null);
      reload();
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const ok = await del.run(() => api(`/stores/${storeId}/categories/${deleting.id}`, { method: 'DELETE' }));
    if (ok) {
      toast({ tone: 'success', message: `Deleted ${deleting.name}` });
      setDeleting(null);
      reload();
    }
  }

  const row = (c: Category, i: number, siblings: Category[], parent?: Node) => {
    const node = tree.find((n) => n.id === c.id);
    return (
      <li
        key={c.id}
        className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 sm:flex-nowrap sm:px-4', parent && 'bg-paper/50 pl-6 sm:pl-10')}
      >
        <span className="flex min-w-0 flex-1 basis-56 items-center gap-2">
          {parent ? (
            <CornerDownRight size={16} strokeWidth={1.75} className="shrink-0 text-ink-3" aria-hidden />
          ) : (
            <span className="num w-6 shrink-0 text-sm text-ink-3">{i + 1}</span>
          )}
          {c.image && <img {...imgProps(c.image.url, 36)} alt="" className="size-9 shrink-0 rounded-[var(--radius-photo)] object-cover" />}
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="font-semibold [overflow-wrap:anywhere]">{c.name}</span>
              {!c.isActive && <StatusPill className="h-5 text-[11px]">Hidden</StatusPill>}
            </span>
            <span className="block text-sm text-ink-2">
              <button
                type="button"
                onClick={() => onShowItems(c.id)}
                className="underline decoration-line-strong underline-offset-4 hover:decoration-ink"
              >
                {plural(c.itemCount, label)}
              </button>
              {node && node.children.length > 0 && ` · ${node.children.length} sub-categor${node.children.length === 1 ? 'y' : 'ies'}`}
            </span>
          </span>
        </span>
        {canEdit && (
          <span className="ml-auto flex shrink-0 items-center">
            <button className={iconBtn} onClick={() => move(siblings, i, -1, parent?.id)} disabled={busy || i === 0} aria-label={`Move ${c.name} up`}>
              <ArrowUp size={18} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              className={iconBtn}
              onClick={() => move(siblings, i, 1, parent?.id)}
              disabled={busy || i === siblings.length - 1}
              aria-label={`Move ${c.name} down`}
            >
              <ArrowDown size={18} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              className={iconBtn}
              onClick={() => toggleActive(c)}
              disabled={busy}
              aria-label={c.isActive ? `Hide ${c.name}` : `Show ${c.name}`}
              title={c.isActive ? 'Hide' : 'Show'}
            >
              {c.isActive ? <Eye size={18} strokeWidth={1.75} aria-hidden /> : <EyeOff size={18} strokeWidth={1.75} aria-hidden />}
            </button>
            <button
              className={iconBtn}
              onClick={() =>
                setEditing({
                  id: c.id,
                  name: c.name,
                  description: c.description,
                  parentId: c.parentId ?? '',
                  image: c.image,
                  isActive: c.isActive,
                  hasChildren: Boolean(node?.children.length),
                })
              }
              aria-label={`Edit ${c.name}`}
              title="Edit"
            >
              <Pencil size={17} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              className={`${iconBtn} hover:text-danger`}
              onClick={() => setDeleting(node ?? { ...c, children: [] })}
              aria-label={`Delete ${c.name}`}
              title="Delete"
            >
              <Trash2 size={17} strokeWidth={1.75} aria-hidden />
            </button>
          </span>
        )}
      </li>
    );
  };

  return (
    <section aria-labelledby="cat-heading">
      <h2 id="cat-heading" className="text-lg font-semibold">
        Categories
      </h2>
      <p className="mt-1 max-w-2xl text-[15px] text-ink-2">
        Group {pluralWord(label)} the way customers look for them. A category can hold sub-categories, like Drinks → Hot drinks.
      </p>

      {canEdit && (
        <form onSubmit={onAdd} className="mt-5 grid max-w-2xl gap-2 sm:grid-cols-[minmax(0,1fr)_13rem_auto]">
          <label className="sr-only" htmlFor="new-cat">
            New category name
          </label>
          <Input id="new-cat" value={name} onChange={(e) => setName(e.target.value)} placeholder="New category, e.g. Snacks" maxLength={60} />
          <Select aria-label="Put it inside" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Main category</option>
            {tree.map((n) => (
              <option key={n.id} value={n.id}>
                Inside {n.name}
              </option>
            ))}
          </Select>
          <Button type="submit" size="lg" loading={add.pending} disabled={!name.trim()} icon={<Plus size={18} strokeWidth={1.75} aria-hidden />}>
            Add category
          </Button>
        </form>
      )}
      {(add.formError || add.fieldErrors.name || add.fieldErrors.parentId) && (
        <div className="mt-3 max-w-2xl">
          <FormAlert>{add.fieldErrors.name ?? add.fieldErrors.parentId ?? add.formError}</FormAlert>
        </div>
      )}

      <div className="mt-6">
        {error && !data ? (
          <FormAlert>{errorText(error, 'The categories didn’t load.')}</FormAlert>
        ) : !data ? (
          <Skeleton className="h-48" />
        ) : tree.length === 0 ? (
          <p className="text-ink-2">
            No categories yet. {pluralWord(label).replace(/^./, (s) => s.toUpperCase())} without a category show under “More” on the store page.
          </p>
        ) : (
          <ol className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {tree.map((n, i) => [row(n, i, tree, undefined), ...n.children.map((child, j) => row(child, j, n.children, n))])}
          </ol>
        )}
      </div>
      {data && (
        <p className="mt-3 text-sm text-ink-2">
          {data.uncategorisedCount > 0 && (
            <>
              <button
                type="button"
                onClick={() => onShowItems('none')}
                className="underline decoration-line-strong underline-offset-4 hover:decoration-ink"
              >
                {plural(data.uncategorisedCount, label)} without a category
              </button>
              .{' '}
            </>
          )}
          Hidden categories, and what’s in them, don’t appear on the store page. Hiding a main category hides its sub-categories too.
        </p>
      )}

      {editing && (
        <Dialog
          open
          onClose={() => setEditing(null)}
          title={`Edit ${editing.name || 'category'}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" form="edit-cat" loading={edit.pending}>
                Save category
              </Button>
            </>
          }
        >
          <form id="edit-cat" onSubmit={saveEdit} noValidate className="space-y-5">
            <Field label="Name" error={edit.fieldErrors.name}>
              {(f) => (
                <Input
                  id={f.id}
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  maxLength={60}
                  aria-invalid={f.invalid}
                />
              )}
            </Field>
            <Field
              label="Sits inside"
              hint={editing.hasChildren ? 'It has its own sub-categories, so it stays a main category.' : undefined}
              error={edit.fieldErrors.parentId}
            >
              {(f) => (
                <Select
                  id={f.id}
                  value={editing.parentId}
                  disabled={editing.hasChildren}
                  onChange={(e) => setEditing({ ...editing, parentId: e.target.value })}
                >
                  <option value="">Nothing (main category)</option>
                  {tree
                    .filter((n) => n.id !== editing.id)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            <Field label="Short description" optional hint="Shown under the category name on the store page." error={edit.fieldErrors.description}>
              {(f) => (
                <Textarea
                  id={f.id}
                  rows={2}
                  value={editing.description}
                  maxLength={200}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              )}
            </Field>
            <div>
              <p className="mb-1.5 text-[15px] font-semibold">Photo</p>
              <ImageUploader
                value={editing.image ? [editing.image] : []}
                onChange={(x) => setEditing({ ...editing, image: x[0] ?? null })}
                purpose="category"
              />
              <p className="mt-1 text-sm text-ink-2">When two or more categories have photos, they show in the category bar.</p>
            </div>
            <Toggle
              checked={editing.isActive}
              onChange={(v) => setEditing({ ...editing, isActive: v })}
              label="Show on store page"
              description="Hidden categories keep their items, but customers can’t see them."
            />
            <FormAlert>{edit.formError}</FormAlert>
          </form>
        </Dialog>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => {
          setDeleting(null);
          del.setFormError('');
        }}
        onConfirm={confirmDelete}
        loading={del.pending}
        title={`Delete “${deleting?.name ?? ''}”?`}
        confirmLabel="Delete category"
      >
        {deleting && deleting.children.length > 0 ? (
          <FormAlert>{del.formError || `This category has ${deleting.children.length} sub-categories. Move or delete them first.`}</FormAlert>
        ) : deleting && deleting.itemCount > 0 ? (
          <FormAlert>{del.formError || `This category has ${plural(deleting.itemCount, label)}. Move them to another category first.`}</FormAlert>
        ) : (
          <>
            <p>The category will be removed from the store page. This can’t be undone.</p>
            {del.formError && (
              <div className="mt-3">
                <FormAlert>{del.formError}</FormAlert>
              </div>
            )}
          </>
        )}
      </ConfirmDialog>
    </section>
  );
}

/* ---------- CSV import and export ---------- */

type ImportResult = {
  dryRun: boolean;
  saved: boolean;
  summary: { create: number; update: number; errors: number };
  rows: { line: number; name: string; action: 'create' | 'update' | 'error'; errors: string[] }[];
};

const TEMPLATE =
  'name,price,sale_price,category,description,unit,code,available,visible,stock,food_type,labels,tags,featured\n' +
  'Atta 5 kg,265,250,Staples,Whole wheat,5 kg,ATTA5,yes,yes,20,veg,,"atta, flour",no\n' +
  'Masala chai,20,,Hot drinks,,,,yes,yes,,veg,Bestseller,"tea, chai",yes\n' +
  'Egg roll,60,,Rolls,,,,yes,yes,,egg,New,,no\n';

/** GETs a file from the API with the admin's cookies and saves it. */
async function downloadGet(path: string, fallbackName: string) {
  const get = () => fetch(`/api/v1${path}`, { credentials: 'same-origin', signal: AbortSignal.timeout(60_000) });
  let res = await get();
  if (res.status === 401 && (await renewSession())) res = await get();
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? 'The download failed. Please try again.');
  }
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

/** Export the catalogue as CSV, and import a CSV: checked first (dry run), then saved. */
export function ImportExportView({ onImported }: { onImported: () => void }) {
  const { storeId, store, preset, can } = useStoreWorkspace();
  const canEdit = can('catalogue.edit');
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const label = preset.itemLabel;

  if (!canEdit) {
    return (
      <section>
        <h2 className="text-lg font-semibold">Import and export</h2>
        <p className="mt-2 text-ink-2">Your admin role needs “Edit catalogue” to export or import a spreadsheet for this store.</p>
      </section>
    );
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadGet(`/stores/${storeId}/items/export.csv`, `${store.slug}-catalogue.csv`);
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'The download failed. Please try again.' });
    } finally {
      setExporting(false);
    }
  }

  async function send(dryRun: boolean, f = file) {
    if (!f) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', f);
      const res = await api<ImportResult>(`/stores/${storeId}/items/import${dryRun ? '?dryRun=true' : ''}`, {
        form,
        signal: AbortSignal.timeout(60_000),
      });
      setResult(res);
      if (res.saved) {
        toast({ tone: 'success', message: `Import done: ${res.summary.create} added, ${res.summary.update} updated` });
        onImported();
      }
    } catch (err) {
      setError(errorText(err, 'The upload failed. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError('');
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;
  const changes = result ? result.summary.create + result.summary.update : 0;

  return (
    <div className="space-y-10">
      <section aria-labelledby="export-heading">
        <h2 id="export-heading" className="text-lg font-semibold">
          Export
        </h2>
        <p className="mt-1 max-w-2xl text-[15px] text-ink-2">
          Every {label} as a CSV file you can open in Excel or Google Sheets. Edit it and import it back to update many at once.
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={exportCsv}
          loading={exporting}
          icon={<Download size={17} strokeWidth={1.75} aria-hidden />}
        >
          Download CSV
        </Button>
      </section>

      <section aria-labelledby="import-heading" className="border-t border-line pt-8">
        <h2 id="import-heading" className="text-lg font-semibold">
          Import
        </h2>
        {result?.saved ? (
          <div className="mt-3">
            <FormAlert tone="success">
              Import done. {plural(result.summary.create, label)} added and {result.summary.update} updated.
            </FormAlert>
            <Button variant="secondary" className="mt-4" onClick={reset}>
              Import another file
            </Button>
          </div>
        ) : (
          <>
            <ol className="mt-3 max-w-2xl space-y-5">
              <li>
                <p className="font-semibold">1. Start from the template, or the export above</p>
                <p className="text-[15px] text-ink-2">
                  Columns: <span className="num">name, price</span> (required), and optionally sale_price, category, description, unit, code,
                  available, visible, stock, food_type, labels, tags, featured. Rows with the same <span className="num">code</span> (or the same
                  name) update the existing {label}. New category names are created.
                </p>
                <a href={templateHref} download="catalogue-template.csv" className="mt-2 inline-block font-semibold underline underline-offset-4">
                  Download template
                </a>
              </li>
              <li>
                <p className="font-semibold">2. Choose the CSV file</p>
                <p className="text-[15px] text-ink-2">Up to 2,000 rows and 2 MB. Nothing is saved until you’ve checked the changes.</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={() => input.current?.click()} icon={<FileUp size={17} strokeWidth={1.75} aria-hidden />}>
                    {file ? 'Choose another file' : 'Choose file'}
                  </Button>
                  {file && <span className="text-[15px] [overflow-wrap:anywhere]">{file.name}</span>}
                </div>
                <input
                  ref={input}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    setResult(null);
                    e.target.value = '';
                    if (f) void send(true, f);
                  }}
                />
              </li>
            </ol>
            {error && (
              <div className="mt-4 max-w-2xl">
                <FormAlert>{error}</FormAlert>
              </div>
            )}
            {busy && !result && <p className="mt-6 text-ink-2">Checking the file…</p>}

            {result && (
              <div className="mt-8 border-t border-line pt-6" aria-live="polite">
                <p className="font-semibold">3. Check, then import</p>
                <p className="mt-1 text-[15px]">
                  <span className="font-semibold">{result.summary.create}</span> new, <span className="font-semibold">{result.summary.update}</span>{' '}
                  updated
                  {result.summary.errors > 0 && (
                    <>
                      , <span className="font-semibold text-danger">{result.summary.errors} with problems</span>. Fix them in the file and choose it
                      again.
                    </>
                  )}
                </p>
                <div className="mt-4 max-h-[50dvh] overflow-auto rounded-[var(--radius-card)] border border-line bg-surface">
                  <table className="w-full text-left text-[15px]">
                    <thead className="sticky top-0 bg-surface text-sm text-ink-2">
                      <tr className="border-b border-line">
                        <th className="px-3 py-2 font-medium">Row</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">What happens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r) => (
                        <tr key={r.line} className="border-b border-line align-top last:border-b-0">
                          <td className="num px-3 py-2 text-ink-2">{r.line}</td>
                          <td className="px-3 py-2 [overflow-wrap:anywhere]">{r.name || <span className="text-ink-3">(no name)</span>}</td>
                          <td className="px-3 py-2">
                            {r.action === 'error' ? (
                              <span className="text-danger">{r.errors.join('. ')}</span>
                            ) : (
                              <StatusPill tone={r.action === 'create' ? 'success' : 'brand'}>{r.action === 'create' ? 'Add' : 'Update'}</StatusPill>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button size="lg" className="mt-5" onClick={() => send(false)} loading={busy} disabled={result.summary.errors > 0 || changes === 0}>
                  Import {plural(changes, label)}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
