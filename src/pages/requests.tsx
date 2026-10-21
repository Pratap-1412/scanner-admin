import { useState } from 'react';
import { useAdmin } from '@/components/admin-shell';
import { LoadError, Pager, RowList } from '@/components/admin-ui';
import { RequestRow } from '@/components/queue-rows';
import { PageBody, PageHeader } from '@/components/page';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { qs, useResource, type AdminUser, type Paged } from '@/lib/admin';

export default function RequestsPage() {
  const { refreshSummary } = useAdmin();
  const [status, setStatus] = useState<'pending' | 'rejected'>('pending');
  const [page, setPage] = useState(1);
  const list = useResource<Paged<'users', AdminUser>>(`/admin/users${qs({ status, page })}`);

  return (
    <PageBody>
      <PageHeader title="Sign-up requests" description="New accounts can’t sign in until you approve them." />
      <Segmented
        label="Show"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        options={[
          { value: 'pending', label: 'Waiting' },
          { value: 'rejected', label: 'Rejected' },
        ]}
      />
      <div className="mt-6">
        {list.error ? (
          <LoadError onRetry={list.reload} />
        ) : !list.data ? (
          <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
        ) : list.data.users.length === 0 ? (
          <EmptyState title={status === 'pending' ? 'No one is waiting' : 'No rejected requests'}>
            {status === 'pending'
              ? 'When someone signs up, their request shows up here for you to approve.'
              : 'Requests you reject stay here until you delete them.'}
          </EmptyState>
        ) : (
          <>
            <RowList>
              {list.data.users.map((u) => (
                <RequestRow
                  key={u.id}
                  user={u}
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
