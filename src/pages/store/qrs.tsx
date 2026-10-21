import { Copy, Download, ExternalLink, Plus, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LoadError, RowList } from '@/components/admin-ui';
import { useStoreWorkspace } from '@/components/store-context';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatDateTime, timeAgo, useResource } from '@/lib/admin';
import { api, isApiError } from '@/lib/api';
import { useSubmit } from '@/lib/use-submit';
import {
  CONTEXT_LABEL,
  DEST_LABEL,
  downloadGet,
  PosterDialog,
  publicLink,
  QrFormDialog,
  QrImage,
  SheetDialog,
  shortLink,
  type Category,
  type Qr,
} from './qrs-parts';

function destination(qr: Qr, categories: Category[] | undefined) {
  if (qr.destinationType === 'category') {
    const name = categories?.find((c) => c.id === qr.categoryId)?.name;
    return name ? `Category: ${name}` : 'One category';
  }
  if (qr.destinationType === 'items') return `${qr.itemIds.length} items`;
  return DEST_LABEL[qr.destinationType];
}

const spot = (qr: Qr) => (qr.contextType === 'none' ? '' : qr.contextLabel || CONTEXT_LABEL[qr.contextType]);
const scans = (n: number) => `${n.toLocaleString('en-IN')} scan${n === 1 ? '' : 's'}`;
const lastScan = (qr: Qr) => (qr.lastScannedAt ? `Last scan ${timeAgo(qr.lastScannedAt)}` : 'Not scanned yet');

/** Copies the code's public link, with a toast either way. */
function useCopyLink() {
  const toast = useToast();
  return (qr: Qr) =>
    navigator.clipboard.writeText(publicLink(qr)).then(
      () => toast({ tone: 'success', message: 'Link copied' }),
      () => toast({ tone: 'error', message: 'Copying was blocked. Select the link and copy it by hand.' }),
    );
}

function useCodeDownload() {
  const { storeId } = useStoreWorkspace();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function download(qr: Qr, format: 'png' | 'svg') {
    setBusy(`${qr.id}:${format}`);
    try {
      await downloadGet(`/stores/${storeId}/qrs/${qr.id}/download?format=${format}`, `${qr.publicCode}.${format}`);
    } catch (err) {
      toast({ tone: 'error', message: isApiError(err) ? err.message : 'The download failed.' });
    } finally {
      setBusy(null);
    }
  }
  return { busy, download };
}

export default function QrsTab() {
  const { storeId, can, preset } = useStoreWorkspace();
  const list = useResource<{ qrs: Qr[] }>(`/stores/${storeId}/qrs`);
  const cats = useResource<{ categories: Category[] }>(`/stores/${storeId}/categories`);
  const toast = useToast();
  const codes = useCodeDownload();
  const canManage = can('qrs.manage');

  const [form, setForm] = useState<{ qr: Qr | null } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [poster, setPoster] = useState<Qr | null>(null);
  const [sheet, setSheet] = useState(false);
  const [deleting, setDeleting] = useState<Qr | null>(null);
  const [rev, setRev] = useState(0);
  const del = useSubmit();

  const qrs = list.data?.qrs;
  const main = qrs?.find((q) => q.isPrimary);
  const others = qrs?.filter((q) => !q.isPrimary) ?? [];
  const categories = cats.data?.categories;
  const viewed = qrs?.find((q) => q.id === viewing) ?? null;

  function changed() {
    list.reload();
    setRev((r) => r + 1);
  }

  async function onDelete() {
    if (!deleting) return;
    const ok = await del.run(() => api(`/stores/${storeId}/qrs/${deleting.id}`, { method: 'DELETE' }));
    if (!ok) return;
    toast({ tone: 'success', message: `${deleting.name} deleted` });
    setDeleting(null);
    setViewing(null);
    list.reload();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">QR codes</h2>
          <p className="mt-0.5 max-w-xl text-ink-2">
            One main code for the whole store, plus codes for tables, counters or a single category. Orders from a table code arrive labelled with the
            table.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(qrs?.length ?? 0) > 0 && (
            <Button variant="secondary" icon={<Printer size={17} strokeWidth={1.75} aria-hidden />} onClick={() => setSheet(true)}>
              Print many
            </Button>
          )}
          {canManage && (
            <Button icon={<Plus size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setForm({ qr: null })}>
              Create QR code
            </Button>
          )}
        </div>
      </div>

      {!canManage && <FormAlert tone="info">Your admin role can view and download these codes but not change them.</FormAlert>}

      {list.error ? (
        <LoadError onRetry={list.reload} />
      ) : !qrs ? (
        <div className="space-y-4">
          <Skeleton className="h-52 w-full rounded-[var(--radius-card)]" />
          <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
        </div>
      ) : (
        <>
          {main && (
            <section className="grid gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:p-5">
              <button
                type="button"
                onClick={() => setViewing(main.id)}
                className="block w-full max-w-40 rounded-[var(--radius-photo)]"
                aria-label="Open the main store code"
              >
                <QrImage storeId={storeId} qr={main} alt="Main store QR code" className="w-full" />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[17px] font-semibold [overflow-wrap:anywhere]">{main.name}</h3>
                  <StatusPill tone="brand">Main code</StatusPill>
                </div>
                <p className="mt-1 max-w-lg text-[15px] text-ink-2">
                  Every store gets this code automatically. It always opens the full {preset.catalogueLabel.toLowerCase()} and can’t be switched off
                  or deleted.
                </p>
                <p className="num mt-2 text-sm text-ink-2 [overflow-wrap:anywhere]">
                  {shortLink(main)} · {scans(main.scanCount)} · {lastScan(main)}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPoster(main)}>
                    Make a poster
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={codes.busy === `${main.id}:png`}
                    icon={<Download size={15} strokeWidth={1.75} aria-hidden />}
                    onClick={() => codes.download(main, 'png')}
                  >
                    PNG
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setViewing(main.id)}>
                    Details
                  </Button>
                  {canManage && (
                    <Button variant="secondary" size="sm" onClick={() => setForm({ qr: main })}>
                      Change colours
                    </Button>
                  )}
                </div>
              </div>
            </section>
          )}

          <section>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">Table and counter codes</h2>
              <span className="text-sm text-ink-2">
                {others.length} code{others.length === 1 ? '' : 's'}
              </span>
            </div>
            {others.length === 0 ? (
              <EmptyState title="No table or counter codes yet">
                {canManage
                  ? 'Create one per table so each order arrives labelled, like “Table 4”, or point a code at one category or a few items.'
                  : 'This store only has its main code.'}
              </EmptyState>
            ) : (
              <RowList>
                {others.map((qr) => (
                  <li key={qr.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <QrImage storeId={storeId} qr={qr} className="size-16 shrink-0" />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setViewing(qr.id)}
                          className="block max-w-full truncate text-left font-semibold hover:underline"
                        >
                          {qr.name}
                        </button>
                        <p className="truncate text-sm text-ink-2">
                          {spot(qr) ? `${spot(qr)} · ` : ''}
                          {destination(qr, categories)}
                        </p>
                        <p className="num truncate text-sm text-ink-3">{shortLink(qr)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:justify-end">
                      <StatusPill tone={qr.isActive ? 'success' : 'neutral'}>{qr.isActive ? 'Active' : 'Off'}</StatusPill>
                      <span className="text-ink-2">
                        <span className="num font-semibold text-ink">{qr.scanCount.toLocaleString('en-IN')}</span> scan{qr.scanCount === 1 ? '' : 's'}
                        <span className="block text-[13px]">{qr.lastScannedAt ? timeAgo(qr.lastScannedAt) : 'Never scanned'}</span>
                      </span>
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setPoster(qr)}>
                          Poster
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setViewing(qr.id)}>
                          Manage
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </RowList>
            )}
          </section>
        </>
      )}

      {viewed && (
        <QrDetailDialog
          qr={viewed}
          categories={categories}
          rev={rev}
          onClose={() => setViewing(null)}
          onEdit={() => setForm({ qr: viewed })}
          onPoster={() => setPoster(viewed)}
          onDelete={() => setDeleting(viewed)}
          onChanged={changed}
        />
      )}

      {form && (
        <QrFormDialog
          qr={form.qr}
          categories={categories}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null);
            changed();
            if (!form.qr) setViewing(saved.id);
          }}
        />
      )}

      {poster && <PosterDialog qr={poster} onClose={() => setPoster(null)} />}
      {sheet && qrs && <SheetDialog qrs={qrs} onClose={() => setSheet(false)} />}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => {
          setDeleting(null);
          del.setFormError('');
        }}
        onConfirm={onDelete}
        loading={del.pending}
        title={`Delete ${deleting?.name ?? 'this QR code'}?`}
        confirmLabel="Delete QR code"
      >
        <p>
          Printed copies will stop working and show a “not in use” page. Its scan history is deleted too. To keep printed copies working but change
          where they lead, edit the code instead.
        </p>
        {del.formError && (
          <div className="mt-3">
            <FormAlert>{del.formError}</FormAlert>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

type Daily = { date: string; scans: number };

function QrDetailDialog({
  qr: listed,
  categories,
  rev,
  onClose,
  onEdit,
  onPoster,
  onDelete,
  onChanged,
}: {
  qr: Qr;
  categories: Category[] | undefined;
  rev: number;
  onClose: () => void;
  onEdit: () => void;
  onPoster: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const { storeId, can } = useStoreWorkspace();
  const toast = useToast();
  const copy = useCopyLink();
  const codes = useCodeDownload();
  const detail = useResource<{ qr: Qr; daily: Daily[] }>(`/stores/${storeId}/qrs/${listed.id}`);
  const toggle = useSubmit();
  const canManage = can('qrs.manage');
  const qr = detail.data?.qr ?? listed;
  const link = publicLink(qr);
  const { reload } = detail;

  useEffect(() => {
    if (rev) reload();
  }, [rev, reload]);

  async function setActive(isActive: boolean) {
    const res = await toggle.run(() => api<{ qr: Qr }>(`/stores/${storeId}/qrs/${qr.id}`, { method: 'PATCH', body: { isActive } }));
    if (!res) return;
    toast({ tone: 'success', message: isActive ? `${qr.name} is on` : `${qr.name} is off. Scans open the store without the spot label.` });
    onChanged();
  }

  const daily = detail.data?.daily ?? [];
  const recent = daily.reduce((sum, d) => sum + d.scans, 0);

  return (
    <Dialog open onClose={onClose} title={qr.isPrimary ? 'Main store code' : qr.name} className="w-[min(100%-2rem,42rem)]!">
      <div className="grid gap-5 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="mx-auto w-full max-w-44 rounded-[var(--radius-photo)] border border-line bg-surface p-2">
            <QrImage storeId={storeId} qr={qr} alt={`QR code for ${qr.name}`} className="w-full" />
          </div>
          <div className="mx-auto grid max-w-44 grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={codes.busy === `${qr.id}:png`}
              icon={<Download size={15} strokeWidth={1.75} aria-hidden />}
              onClick={() => codes.download(qr, 'png')}
            >
              PNG
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={codes.busy === `${qr.id}:svg`}
              icon={<Download size={15} strokeWidth={1.75} aria-hidden />}
              onClick={() => codes.download(qr, 'svg')}
            >
              SVG
            </Button>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-2">
            {qr.isPrimary && <StatusPill tone="brand">Main code</StatusPill>}
            <StatusPill tone={qr.isActive ? 'success' : 'neutral'}>{qr.isActive ? 'Active' : 'Off'}</StatusPill>
          </div>

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[15px]">
            <dt className="text-ink-2">Opens</dt>
            <dd>{destination(qr, categories)}</dd>
            <dt className="text-ink-2">Spot</dt>
            <dd>{spot(qr) || 'Anywhere'}</dd>
            {qr.style.frameText && (
              <>
                <dt className="text-ink-2">Label</dt>
                <dd className="[overflow-wrap:anywhere]">{qr.style.frameText}</dd>
              </>
            )}
            <dt className="text-ink-2">Scans</dt>
            <dd className="num">{qr.scanCount.toLocaleString('en-IN')}</dd>
            <dt className="text-ink-2">Last scan</dt>
            <dd>{qr.lastScannedAt ? formatDateTime(qr.lastScannedAt) : 'Not scanned yet'}</dd>
            <dt className="text-ink-2">Created</dt>
            <dd>{formatDate(qr.createdAt)}</dd>
          </dl>

          <div>
            <p className="text-sm font-semibold text-ink-2">Public link</p>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="num mt-0.5 block text-[15px] underline decoration-line-strong underline-offset-4 [overflow-wrap:anywhere] hover:decoration-ink"
            >
              {link.replace(/^https?:\/\//, '')}
            </a>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon={<Copy size={15} strokeWidth={1.75} aria-hidden />} onClick={() => copy(qr)}>
                Copy link
              </Button>
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 px-1 text-sm font-semibold underline decoration-line-strong decoration-2 underline-offset-4 hover:decoration-ink"
              >
                <ExternalLink size={15} strokeWidth={1.75} aria-hidden /> Open
              </a>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink-2">Recent scans</p>
            {detail.error ? (
              <p className="mt-1 text-sm text-danger">Scan history didn’t load.</p>
            ) : !detail.data ? (
              <Skeleton className="mt-1 h-16 w-full" />
            ) : daily.length === 0 ? (
              <p className="mt-1 text-sm text-ink-2">No scans recorded yet.</p>
            ) : (
              <>
                <p className="mt-0.5 text-sm text-ink-2">
                  <span className="num font-semibold text-ink">{recent.toLocaleString('en-IN')}</span> across the last {daily.length} day
                  {daily.length === 1 ? '' : 's'} with scans
                </p>
                <ul className="mt-2 divide-y divide-line rounded-[8px] border border-line text-sm">
                  {daily.slice(0, 7).map((d) => (
                    <li key={d.date} className="flex justify-between px-3 py-1.5">
                      <span>{formatDate(`${d.date}T12:00:00`)}</span>
                      <span className="num font-semibold">{d.scans}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {qr.isPrimary && (
            <p className="text-sm text-ink-2">This code always opens the whole store, so it can’t be pointed elsewhere, switched off or deleted.</p>
          )}
          <FormAlert>{toggle.formError}</FormAlert>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button variant="secondary" size="sm" icon={<Printer size={15} strokeWidth={1.75} aria-hidden />} onClick={onPoster}>
          Make a poster
        </Button>
        {canManage && (
          <>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Edit
            </Button>
            {!qr.isPrimary && (
              <Button variant="secondary" size="sm" loading={toggle.pending} onClick={() => setActive(!qr.isActive)}>
                {qr.isActive ? 'Turn off' : 'Turn on'}
              </Button>
            )}
            {!qr.isPrimary && (
              <Button variant="danger" size="sm" className="sm:ml-auto" onClick={onDelete}>
                Delete
              </Button>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
