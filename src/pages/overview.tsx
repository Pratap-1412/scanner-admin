import { useAdmin } from '@/components/admin-shell';
import { LoadError, RowList } from '@/components/admin-ui';
import { RequestRow, TicketRow } from '@/components/queue-rows';
import { PageBody, PageHeader } from '@/components/page';
import { Skeleton } from '@/components/ui/skeleton';
import { useResource, type AdminTicket, type AdminUser, type Paged } from '@/lib/admin';
import { cn } from '@/lib/cn';
import { Link } from '@/lib/router';

export default function AdminOverviewPage() {
  const { me, summary, refreshSummary } = useAdmin();
  const requests = useResource<Paged<'users', AdminUser>>('/admin/users?status=pending');
  const tickets = useResource<Paged<'tickets', AdminTicket>>('/admin/tickets?status=open');

  const stats = [
    { label: 'Waiting for approval', value: summary?.pending, href: '/requests' },
    { label: 'Password resets', value: summary?.openTickets, href: '/tickets' },
    { label: 'Active accounts', value: summary?.active, href: '/users' },
    { label: 'Live stores', value: summary ? `${summary.liveStores} of ${summary.stores}` : undefined, href: '/stores' },
  ];

  return (
    <PageBody>
      <PageHeader title={`Hello, ${me.name.split(' ')[0]}`} description="Here’s what needs you today." />

      {/* One strip of figures, not a grid of cards. */}
      <ul className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface sm:grid-cols-4">
        {stats.map((s, i) => (
          <li key={s.label} className={cn(i % 2 && 'border-l border-line', i > 1 && 'border-t border-line sm:border-t-0', i === 2 && 'sm:border-l')}>
            <Link href={s.href} className="flex h-full flex-col gap-1.5 px-4 py-4 hover:bg-paper sm:px-5">
              <div className="num text-[28px] font-semibold leading-none">{s.value ?? <Skeleton className="h-7 w-12" />}</div>
              <div className="text-sm text-ink-2">{s.label}</div>
            </Link>
          </li>
        ))}
      </ul>

      <Queue
        title="Sign-up requests"
        href="/requests"
        total={requests.data?.total}
        empty="No one is waiting. New sign-ups show up here."
        loading={!requests.data && !requests.error}
        error={Boolean(requests.error)}
        onRetry={requests.reload}
      >
        {requests.data?.users.slice(0, 5).map((u) => (
          <RequestRow
            key={u.id}
            user={u}
            onDone={() => {
              requests.reload();
              refreshSummary();
            }}
          />
        ))}
      </Queue>

      <Queue
        title="Password reset requests"
        href="/tickets"
        total={tickets.data?.total}
        empty="No open requests. When someone uses “Forgot password”, it lands here."
        loading={!tickets.data && !tickets.error}
        error={Boolean(tickets.error)}
        onRetry={tickets.reload}
      >
        {tickets.data?.tickets.slice(0, 5).map((t) => (
          <TicketRow
            key={t.id}
            ticket={t}
            onDone={() => {
              tickets.reload();
              refreshSummary();
            }}
          />
        ))}
      </Queue>
    </PageBody>
  );
}

function Queue({
  title,
  href,
  total,
  empty,
  loading,
  error,
  onRetry,
  children,
}: {
  title: string;
  href: string;
  total: number | undefined;
  empty: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {total !== undefined && total > 5 && (
          <Link
            href={href}
            className="text-[15px] font-semibold underline decoration-line-strong decoration-2 underline-offset-4 hover:decoration-ink"
          >
            See all {total}
          </Link>
        )}
      </div>
      {error ? (
        <LoadError onRetry={onRetry} />
      ) : loading ? (
        <Skeleton className="h-24 w-full rounded-[var(--radius-card)]" />
      ) : total === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-5 py-6 text-ink-2">{empty}</p>
      ) : (
        <RowList>{children}</RowList>
      )}
    </section>
  );
}
