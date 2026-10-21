import { useState } from 'react';
import { useAdmin } from '@/components/admin-shell';
import { LoadError, Pager, RowList } from '@/components/admin-ui';
import { TicketRow } from '@/components/queue-rows';
import { PageBody, PageHeader } from '@/components/page';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { qs, useResource, type AdminTicket, type Paged } from '@/lib/admin';

export default function TicketsPage() {
  const { refreshSummary } = useAdmin();
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [page, setPage] = useState(1);
  const list = useResource<Paged<'tickets', AdminTicket>>(`/admin/tickets${qs({ status, page })}`);

  return (
    <PageBody>
      <PageHeader
        title="Password resets"
        description="People who used “Forgot password”. Set a temporary password, send it to them, and they can change it after signing in."
      />
      <Segmented
        label="Show"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' },
        ]}
      />
      <div className="mt-6">
        {list.error ? (
          <LoadError onRetry={list.reload} />
        ) : !list.data ? (
          <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
        ) : list.data.tickets.length === 0 ? (
          <EmptyState title={status === 'open' ? 'Nothing to reset' : 'No closed requests yet'}>
            {status === 'open' ? 'All caught up. New requests show up here.' : 'Requests you close are kept here for a year.'}
          </EmptyState>
        ) : (
          <>
            <RowList>
              {list.data.tickets.map((t) => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  onDone={() => {
                    list.reload();
                    refreshSummary();
                  }}
                />
              ))}
            </RowList>
            <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
          </>
        )}
      </div>
    </PageBody>
  );
}
