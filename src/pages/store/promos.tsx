import { Plus } from 'lucide-react';
import { useState } from 'react';
import { LoadError, RowList } from '@/components/admin-ui';
import { useStoreWorkspace } from '@/components/store-context';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { formatDate, useResource } from '@/lib/admin';
import { api, isApiError } from '@/lib/api';
import { useSubmit } from '@/lib/use-submit';
import { PromoDialog, describePromo, promoState, type Promo } from './promos-parts';

export default function PromosTab() {
  const { storeId, store, can } = useStoreWorkspace();
  const toast = useToast();
  const list = useResource<{ promos: Promo[] }>(can('promos.manage') ? `/stores/${storeId}/promos` : null);
  const [editing, setEditing] = useState<Promo | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Promo | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const del = useSubmit();

  if (!can('promos.manage')) return <p className="text-ink-2">Your admin role can’t manage this store’s promo codes.</p>;

  async function toggle(p: Promo) {
    setToggling(p.id);
    try {
      await api(`/stores/${storeId}/promos/${p.id}`, { method: 'PATCH', body: { isActive: !p.isActive } });
      toast({ tone: 'success', message: p.isActive ? `${p.code} turned off` : `${p.code} turned on` });
      list.reload();
    } catch (err) {
      toast({ tone: 'error', message: isApiError(err) ? err.message : 'That didn’t save. Please try again.' });
    } finally {
      setToggling(null);
    }
  }

  async function remove() {
    if (!deleting) return;
    const ok = await del.run(() => api(`/stores/${storeId}/promos/${deleting.id}`, { method: 'DELETE' }));
    if (ok) {
      toast({ tone: 'success', message: `${deleting.code} deleted` });
      setDeleting(null);
      list.reload();
    }
  }

  const promos = list.data?.promos ?? [];
  const now = Date.now();
  const activeCount = promos.filter((p) => promoState(p, now).label === 'Active').length;
  const redemptions = promos.reduce((n, p) => n + p.usedCount, 0);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="text-lg font-semibold">Promo codes</h2>
          <p className="mt-1 text-[15px] text-ink-2">
            Codes customers type at checkout. The discount is worked out on the server when the order is placed.
          </p>
          {promos.length > 0 && (
            <p className="mt-2 text-sm text-ink-2">
              <span className="num font-semibold text-ink">{promos.length}</span> code{promos.length === 1 ? '' : 's'} ·{' '}
              <span className="num font-semibold text-ink">{activeCount}</span> usable now ·{' '}
              <span className="num font-semibold text-ink">{redemptions}</span> use{redemptions === 1 ? '' : 's'} in total
            </p>
          )}
        </div>
        <Button onClick={() => setEditing('new')} icon={<Plus size={18} strokeWidth={1.75} aria-hidden />}>
          New code
        </Button>
      </div>

      <div className="mt-5">
        {list.error ? (
          <LoadError onRetry={list.reload} />
        ) : !list.data ? (
          <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />
        ) : promos.length === 0 ? (
          <EmptyState title="No promo codes yet">Make one for a festival or a quiet weekday, like DIWALI10 for 10% off.</EmptyState>
        ) : (
          <RowList>
            {promos.map((p) => {
              const st = promoState(p, now);
              const dates = [p.startsAt && `starts ${formatDate(p.startsAt)}`, p.endsAt && `ends ${formatDate(p.endsAt)}`]
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={p.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="num shrink-0 rounded-sm border border-dashed border-line-strong px-2 py-0.5 font-bold tracking-wide">
                      {p.code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px]">{describePromo(p, store.currency)}</p>
                      {p.description && <p className="text-sm text-ink-2 [overflow-wrap:anywhere]">{p.description}</p>}
                      <p className="mt-0.5 text-sm text-ink-2">
                        Used <span className="num">{p.usedCount}</span>
                        {p.usageLimit ? (
                          <>
                            {' '}
                            of <span className="num">{p.usageLimit}</span>
                          </>
                        ) : null}{' '}
                        time{(p.usageLimit ?? p.usedCount) === 1 ? '' : 's'}
                        {dates && ` · ${dates}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    <Button variant="secondary" size="sm" loading={toggling === p.id} onClick={() => toggle(p)}>
                      {p.isActive ? 'Turn off' : 'Turn on'}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        del.setFormError('');
                        setDeleting(p);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </RowList>
        )}
      </div>

      {editing && (
        <PromoDialog
          key={editing === 'new' ? 'new' : editing.id}
          promo={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={del.pending}
        title={`Delete ${deleting?.code ?? 'this code'}?`}
        confirmLabel="Delete code"
      >
        <p>Customers won’t be able to use it any more. Orders that already used it keep their discount. To pause it instead, turn it off.</p>
        {del.formError && (
          <div className="mt-3">
            <FormAlert>{del.formError}</FormAlert>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
