import { useState } from 'react';
import { LoadError, Pager, SearchBox } from '@/components/admin-ui';
import { PageBody, PageHeader } from '@/components/page';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill, storeStatus } from '@/components/ui/status-pill';
import { formatDate, qs, useResource, type AdminStore, type Paged } from '@/lib/admin';
import { WEB_URL } from '@/lib/site';
import { useDebouncedValue } from '@/lib/use-debounced';

export default function StoresPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim(), 300);
  const list = useResource<Paged<'stores', AdminStore>>(`/admin/stores${qs({ q, page })}`);

  return (
    <PageBody className="max-w-6xl">
      <PageHeader title="Stores" description="Every store on the platform and who owns it." />
      <SearchBox
        label="Search store name or link"
        value={search}
        onChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
      />
      <div className="mt-6">
        {list.error ? (
          <LoadError onRetry={list.reload} />
        ) : !list.data ? (
          <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
        ) : list.data.stores.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-5 py-6 text-ink-2">No stores match.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
              <table className="w-full min-w-[640px] text-left text-[15px]">
                <thead className="border-b border-line text-sm text-ink-2">
                  <tr>
                    <th className="px-5 py-3 font-medium">Store</th>
                    <th className="px-3 py-3 font-medium">Owner</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.data.stores.map((s) => {
                    const st = storeStatus[s.status] ?? { label: s.status, tone: 'neutral' as const };
                    return (
                      <tr key={s.id}>
                        <td className="max-w-[260px] px-5 py-3">
                          <span className="block truncate font-semibold">{s.name}</span>
                          {s.status === 'published' || s.status === 'paused' ? (
                            <a
                              href={`${WEB_URL}/s/${s.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate text-ink-2 underline underline-offset-4"
                            >
                              /s/{s.slug}
                            </a>
                          ) : (
                            <span className="block truncate text-ink-2">/s/{s.slug}</span>
                          )}
                        </td>
                        <td className="max-w-[260px] px-3 py-3">
                          {s.owner ? (
                            <>
                              <span className="block truncate">{s.owner.name}</span>
                              <span className="block truncate text-ink-2">{s.owner.email}</span>
                            </>
                          ) : (
                            <span className="text-ink-3">No owner</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill tone={st.tone}>{st.label}</StatusPill>
                        </td>
                        <td className="px-5 py-3 text-ink-2">{formatDate(s.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
          </>
        )}
      </div>
    </PageBody>
  );
}
