import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useAdmin } from '@/components/admin-shell';
import { AccountPicker } from '@/components/account-picker';
import { LoadError, RowList } from '@/components/admin-ui';
import { useStoreWorkspace } from '@/components/store-context';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Select } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { formatDate, useResource, type AdminUser } from '@/lib/admin';
import { api } from '@/lib/api';
import { useSubmit } from '@/lib/use-submit';

type Member = {
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'staff';
  permissions: string[];
  effective: string[];
  joinedAt: string;
};
type Invitation = { id: string; email: string; role: string; permissions: string[]; expiresAt: string };
type Team = { members: Member[]; invitations: Invitation[]; grantable: string[] };

const PERMISSION_LABELS: Record<string, string> = {
  'catalogue.edit': 'Edit catalogue',
  'qrs.manage': 'Manage QR codes',
  'customers.view': 'See customers',
  'customers.manage': 'Edit customers',
  'reviews.manage': 'Moderate reviews',
  'reports.view': 'See reports',
};

const ROLE_TONE = { owner: 'brand', manager: 'success', staff: 'neutral' } as const;

export default function TeamTab() {
  const { storeId } = useStoreWorkspace();
  const { can } = useAdmin();
  const team = useResource<Team>(`/stores/${storeId}/team`);
  const [editing, setEditing] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const remove = useSubmit();
  const revoke = useSubmit();

  async function confirmRemove() {
    if (!removing) return;
    const ok = await remove.run(() => api(`/stores/${storeId}/team/members/${removing.userId}`, { method: 'DELETE' }));
    if (ok) {
      toast({ tone: 'success', message: `${removing.name} was removed from the team` });
      setRemoving(null);
      team.reload();
    }
  }

  async function revokeInvite(inv: Invitation) {
    const ok = await revoke.run(() => api(`/stores/${storeId}/team/invitations/${inv.id}`, { method: 'DELETE' }));
    if (ok) {
      toast({ tone: 'success', message: `Invitation for ${inv.email} cancelled` });
      team.reload();
    }
  }

  if (team.error) return <LoadError onRetry={team.reload} />;
  if (!team.data) return <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Team ({team.data.members.length})</h2>
          {can('stores.owner') && can('users.view') && (
            <Button size="sm" icon={<UserPlus size={16} strokeWidth={1.75} aria-hidden />} onClick={() => setAdding(true)}>
              Add someone
            </Button>
          )}
        </div>
        <RowList>
          {team.data.members.map((m) => (
            <li key={m.userId} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {m.name || m.email}
                  <StatusPill tone={ROLE_TONE[m.role]}>{m.role[0]!.toUpperCase() + m.role.slice(1)}</StatusPill>
                </p>
                <p className="truncate text-[15px] text-ink-2">{m.email}</p>
                <p className="mt-0.5 text-sm text-ink-3">
                  Joined {formatDate(m.joinedAt)}
                  {m.role === 'staff' && m.permissions.length > 0 && ` · also: ${m.permissions.map((p) => PERMISSION_LABELS[p] ?? p).join(', ')}`}
                </p>
              </div>
              {m.role !== 'owner' && (
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>
                    Change role
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setRemoving(m)}>
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
        </RowList>
        <p className="mt-2 text-sm text-ink-3">To change the owner, use “Change owner” on the Overview tab.</p>
      </section>

      {team.data.invitations.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Open invitations</h2>
          <RowList>
            {team.data.invitations.map((inv) => (
              <li key={inv.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{inv.email}</p>
                  <p className="text-sm text-ink-3">
                    As {inv.role} · expires {formatDate(inv.expiresAt)}
                  </p>
                </div>
                <Button size="sm" variant="danger" disabled={revoke.pending} onClick={() => revokeInvite(inv)}>
                  Cancel invitation
                </Button>
              </li>
            ))}
          </RowList>
          <FormAlert>{revoke.formError}</FormAlert>
        </section>
      )}

      {editing && (
        <RoleDialog
          key={editing.userId}
          member={editing}
          grantable={team.data.grantable}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            team.reload();
          }}
        />
      )}
      {adding && (
        <AddMemberDialog
          exclude={team.data.members.map((m) => m.userId)}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            team.reload();
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        loading={remove.pending}
        title={`Remove ${removing?.name ?? 'this person'}?`}
        confirmLabel="Remove from team"
      >
        {remove.formError || 'They lose access to this store straight away. Their account stays.'}
      </ConfirmDialog>
    </div>
  );
}

function RoleDialog({ member, grantable, onClose, onSaved }: { member: Member; grantable: string[]; onClose: () => void; onSaved: () => void }) {
  const { storeId } = useStoreWorkspace();
  const toast = useToast();
  const { pending, formError, run } = useSubmit();
  const [role, setRole] = useState<'manager' | 'staff'>(member.role === 'manager' ? 'manager' : 'staff');
  const [perms, setPerms] = useState<string[]>(member.permissions);

  async function save() {
    const ok = await run(() =>
      api(`/stores/${storeId}/team/members/${member.userId}`, { method: 'PATCH', body: { role, permissions: role === 'staff' ? perms : [] } }),
    );
    if (ok) {
      toast({ tone: 'success', message: `${member.name}’s role saved` });
      onSaved();
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Role for ${member.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={pending}>
            Save role
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Role" hint="Managers run the store day to day. Staff handle orders and stock, plus anything you tick below.">
          {(f) => (
            <Select id={f.id} value={role} onChange={(e) => setRole(e.target.value as 'manager' | 'staff')}>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </Select>
          )}
        </Field>
        {role === 'staff' && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-[15px] font-semibold">Staff can also</legend>
            {grantable.map((p) => (
              <Checkbox
                key={p}
                label={PERMISSION_LABELS[p] ?? p}
                checked={perms.includes(p)}
                onChange={(e) => setPerms((cur) => (e.target.checked ? [...cur, p] : cur.filter((x) => x !== p)))}
              />
            ))}
          </fieldset>
        )}
        <FormAlert>{formError}</FormAlert>
      </div>
    </Dialog>
  );
}

function AddMemberDialog({ exclude, onClose, onAdded }: { exclude: string[]; onClose: () => void; onAdded: () => void }) {
  const { storeId } = useStoreWorkspace();
  const toast = useToast();
  const { pending, fieldErrors, formError, run } = useSubmit();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [role, setRole] = useState<'manager' | 'staff'>('staff');

  async function add() {
    if (!user) return;
    const ok = await run(() => api(`/admin/stores/${storeId}/members`, { body: { userId: user.id, role } }));
    if (ok) {
      toast({ tone: 'success', message: `${user.name} joined the team` });
      onAdded();
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add someone to the team"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={add} loading={pending} disabled={!user}>
            Add to team
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-[15px] text-ink-2">
          They need an active account. There’s no email step: they see the store in their dashboard straight away.
        </p>
        <Field label="Account" error={fieldErrors.userId}>
          {(f) => <AccountPicker id={f.id} value={user} onChange={setUser} exclude={exclude} invalid={f.invalid} />}
        </Field>
        <Field label="Role">
          {(f) => (
            <Select id={f.id} value={role} onChange={(e) => setRole(e.target.value as 'manager' | 'staff')}>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
            </Select>
          )}
        </Field>
        <FormAlert>{fieldErrors.userId ? '' : formError}</FormAlert>
      </div>
    </Dialog>
  );
}
