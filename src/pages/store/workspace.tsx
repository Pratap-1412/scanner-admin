import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { ComponentType } from 'react';
import { RequirePermission } from '@/components/admin-shell';
import { LoadError } from '@/components/admin-ui';
import { PageBody } from '@/components/page';
import { StoreContext, type StoreData, type StorePreset } from '@/components/store-context';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill, storeStatus } from '@/components/ui/status-pill';
import { useResource } from '@/lib/admin';
import { isApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Link } from '@/lib/router';
import { WEB_URL } from '@/lib/site';
import type { StorePermission } from '@/lib/types';
import CatalogueTab from './catalogue';
import CustomersTab from './customers';
import OrdersTab from './orders';
import PromosTab from './promos';
import QrsTab from './qrs';
import ReviewsTab from './reviews';
import SettingsTab from './settings';
import TeamTab from './team';

type Tab = { key: string; label: string; Component: ComponentType; visible: (can: (p: StorePermission) => boolean) => boolean };

/** Every tab is visible with stores.view (read-only where the role lacks the write permission), except where noted. */
const TABS: Tab[] = [
  { key: 'settings', label: 'Overview', Component: SettingsTab, visible: () => true },
  { key: 'orders', label: 'Orders', Component: OrdersTab, visible: () => true },
  { key: 'catalogue', label: 'Catalogue', Component: CatalogueTab, visible: () => true },
  { key: 'qrs', label: 'QR codes', Component: QrsTab, visible: () => true },
  { key: 'customers', label: 'Customers', Component: CustomersTab, visible: (can) => can('customers.view') },
  { key: 'promos', label: 'Promo codes', Component: PromosTab, visible: (can) => can('promos.manage') },
  { key: 'reviews', label: 'Reviews', Component: ReviewsTab, visible: () => true },
  { key: 'team', label: 'Team', Component: TeamTab, visible: (can) => can('members.manage') },
];

export default function StoreWorkspace({ storeId, tab }: { storeId: string; tab: string }) {
  return (
    <RequirePermission perm="stores.view">
      <Workspace storeId={storeId} tab={tab} />
    </RequirePermission>
  );
}

function Workspace({ storeId, tab }: { storeId: string; tab: string }) {
  const res = useResource<{ store: StoreData; permissions: StorePermission[]; preset: StorePreset }>(`/stores/${storeId}`);

  if (res.error) {
    return (
      <PageBody>
        <BackLink />
        {isApiError(res.error) && res.error.status === 404 ? (
          <p className="mt-6 text-ink-2">This store doesn’t exist any more.</p>
        ) : (
          <div className="mt-6">
            <LoadError onRetry={res.reload} />
          </div>
        )}
      </PageBody>
    );
  }
  if (!res.data) {
    return (
      <PageBody className="max-w-6xl">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-6 h-11 w-full" />
        <Skeleton className="mt-6 h-64 w-full" />
      </PageBody>
    );
  }

  const { store, permissions, preset } = res.data;
  const can = (p: StorePermission) => permissions.includes(p);
  const tabs = TABS.filter((t) => t.visible(can));
  const current = tabs.find((t) => t.key === tab) ?? tabs[0]!;
  const status = storeStatus[store.status] ?? { label: store.status, tone: 'neutral' as const };

  return (
    <StoreContext.Provider value={{ storeId, store, preset, permissions, can, reload: res.reload }}>
      <PageBody className="max-w-6xl">
        <BackLink />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="display text-[32px] [overflow-wrap:anywhere] sm:text-[38px]">{store.name}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-2">
              <StatusPill tone={status.tone}>{status.label}</StatusPill>
              <span>{preset.label}</span>
              <span className="num">/s/{store.slug}</span>
            </p>
          </div>
          {store.status !== 'draft' && store.status !== 'archived' && (
            <a
              href={`${WEB_URL}/s/${store.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[15px] font-semibold underline decoration-line-strong decoration-2 underline-offset-4 hover:decoration-ink"
            >
              <ExternalLink size={16} strokeWidth={1.75} aria-hidden /> Open live store
            </a>
          )}
        </div>
        <nav aria-label="Store sections" className="mt-6 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/stores/${storeId}/${t.key}`}
              aria-current={t.key === current.key ? 'page' : undefined}
              className={cn(
                '-mb-px shrink-0 border-b-2 border-transparent px-3 py-2.5 text-[15px] font-medium text-ink-2 hover:text-ink',
                t.key === current.key && 'border-ink font-semibold text-ink',
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="pt-6">
          <current.Component key={current.key} />
        </div>
      </PageBody>
    </StoreContext.Provider>
  );
}

function BackLink() {
  return (
    <Link href="/stores" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ink-2 hover:text-ink">
      <ArrowLeft size={16} strokeWidth={1.75} aria-hidden /> All stores
    </Link>
  );
}
