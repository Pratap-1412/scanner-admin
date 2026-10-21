import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useAdmin } from '@/components/admin-shell';
import { LoadError, Pager, SearchBox } from '@/components/admin-ui';
import { AddUserDialog, ManageUserDialog } from '@/components/user-dialogs';
import { PageBody, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { formatDate, qs, useResource, userStatus, type AdminRole, type AdminUser, type Paged } from '@/lib/admin';
import { useSearchParams } from '@/lib/router';
import { useDebouncedValue } from '@/lib/use-debounced';

export default function UsersPage() {
  const { me, can, refreshSummary } = useAdmin();
  const roles = useResource<{ roles: AdminRole[] }>(can('users.manage') || can('roles.view') ? '/admin/roles' : null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const params = useSearchParams();
  const [role, setRole] = useState(() => params.get('role') ?? '');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim(), 300);
  const roleQuery = role === 'admins' ? { admins: 'true' } : role === 'users' ? { admins: 'false' } : { roleId: role };
  const list = useResource<Paged<'users', AdminUser>>(`/admin/users${qs({ q, status, ...roleQuery, page })}`);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<AdminUser | null>(null);

  function changed() {
    list.reload();
    refreshSummary();
  }

  return (
    <PageBody className="max-w-6xl">
      <PageHeader
        title="Accounts"
        description="Everyone who can sign in, or has asked to."
        action={
          can('users.manage') && (
            <Button icon={<UserPlus size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setAdding(true)}>
              Add account
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBox
          label="Search name, email or phone"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <Select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-11 sm:w-44"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="pending">Waiting</option>
          <option value="disabled">Turned off</option>
          <option value="rejected">Rejected</option>
        </Select>
        <Select
          aria-label="Role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="h-11 sm:w-44"
        >
          <option value="">Anyone</option>
          <option value="users">Store users</option>
          <option value="admins">Any admin role</option>
          {roles.data?.roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-6">
        {list.error ? (
          <LoadError onRetry={list.reload} />
        ) : !list.data ? (
          <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
        ) : list.data.users.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-5 py-6 text-ink-2">No accounts match.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
              <table className="w-full min-w-[720px] text-left text-[15px]">
                <thead className="border-b border-line text-sm text-ink-2">
                  <tr>
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Role</th>
                    <th className="px-3 py-3 text-right font-medium">Stores</th>
                    <th className="px-3 py-3 font-medium">Last sign-in</th>
                    <th className="px-5 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.data.users.map((u) => (
                    <tr key={u.id} className="hover:bg-paper/60">
                      <td className="max-w-[280px] px-5 py-3">
                        <span className="block truncate font-semibold">
                          {u.name}
                          {u.id === me.id && <span className="ml-1.5 font-normal text-ink-3">(you)</span>}
                        </span>
                        <span className="block truncate text-ink-2">{u.email}</span>
                        {u.phone && <span className="num block truncate text-sm text-ink-3">{u.phone}</span>}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill tone={userStatus[u.status].tone}>{userStatus[u.status].label}</StatusPill>
                      </td>
                      <td className="px-3 py-3">{u.adminRole ? <span className="font-medium text-brand">{u.adminRole.name}</span> : 'Store user'}</td>
                      <td className="num px-3 py-3 text-right">{u.storeCount}</td>
                      <td className="px-3 py-3 text-ink-2">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => setManaging(u)}>
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
          </>
        )}
      </div>

      <AddUserDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={() => {
          setAdding(false);
          changed();
        }}
      />
      <ManageUserDialog
        key={managing?.id}
        user={managing}
        isSelf={managing?.id === me.id}
        onClose={() => setManaging(null)}
        onChanged={(u) => {
          setManaging(u);
          changed();
        }}
      />
    </PageBody>
  );
}
