import { useState, type FormEvent } from 'react';
import { useAdmin } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { StatusPill, storeStatus } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatDateTime, temporaryPassword, useResource, userStatus, type AdminRole, type AdminUser } from '@/lib/admin';
import { api } from '@/lib/api';
import { Link } from '@/lib/router';
import { useSubmit } from '@/lib/use-submit';
import { TemporaryPasswordInput } from './admin-ui';

/** The admin roles this admin may hand out, for a role picker. */
function useAssignableRoles(enabled: boolean) {
  const roles = useResource<{ roles: AdminRole[] }>(enabled ? '/admin/roles' : null);
  return roles.data?.roles ?? [];
}

function RoleSelect({
  id,
  value,
  onChange,
  roles,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  roles: AdminRole[];
  invalid?: boolean;
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid}>
      <option value="">No admin access (store user)</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </Select>
  );
}

/** Creates an account that can sign in straight away, with no approval step. */
export function AddUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (u: AdminUser) => void }) {
  const toast = useToast();
  const { can } = useAdmin();
  const roles = useAssignableRoles(open);
  const { pending, fieldErrors, formError, run } = useSubmit();
  const [password, setPassword] = useState(() => temporaryPassword());
  const [roleId, setRoleId] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const res = await run(() =>
      api<{ user: AdminUser }>('/admin/users', {
        body: { name: data.name, email: data.email, phone: data.phone, password, adminRoleId: roleId || null },
      }),
    );
    if (res) {
      toast({ tone: 'success', message: `Account made for ${res.user.email}. Share the password with them.` });
      form.reset();
      setPassword(temporaryPassword());
      setRoleId('');
      onCreated(res.user);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add an account">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <p className="text-[15px] text-ink-2">
          The account is active straight away. Send them the email and password; they can change the password after signing in.
        </p>
        <Field label="Name" error={fieldErrors.name}>
          {(f) => <Input id={f.id} name="name" autoComplete="off" required aria-invalid={f.invalid} aria-describedby={f.describedBy} />}
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          {(f) => <Input id={f.id} name="email" type="email" autoComplete="off" required aria-invalid={f.invalid} aria-describedby={f.describedBy} />}
        </Field>
        <Field label="Phone number" optional error={fieldErrors.phone}>
          {(f) => (
            <Input id={f.id} name="phone" type="tel" inputMode="tel" autoComplete="off" aria-invalid={f.invalid} aria-describedby={f.describedBy} />
          )}
        </Field>
        <Field label="Password" hint="At least 8 characters." error={fieldErrors.password}>
          {(f) => <TemporaryPasswordInput id={f.id} value={password} onChange={setPassword} invalid={f.invalid} describedBy={f.describedBy} />}
        </Field>
        {can('users.manage') && (
          <Field label="Admin role" hint="Leave as a store user unless they need this admin panel." error={fieldErrors.adminRoleId}>
            {(f) => <RoleSelect id={f.id} value={roleId} onChange={setRoleId} roles={roles} invalid={f.invalid} />}
          </Field>
        )}
        <FormAlert>{formError}</FormAlert>
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Add account
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type UserStore = { id: string; name: string; slug: string; status: string; role: string };

/** Everything an admin can do to one account, limited to what their role allows. */
export function ManageUserDialog({
  user,
  isSelf,
  onClose,
  onChanged,
}: {
  user: AdminUser | null;
  isSelf: boolean;
  onClose: () => void;
  onChanged: (u: AdminUser | null) => void;
}) {
  const toast = useToast();
  const { can } = useAdmin();
  const roles = useAssignableRoles(Boolean(user) && can('users.manage'));
  const detail = useResource<{ stores: UserStore[] }>(user ? `/admin/users/${user.id}` : null);
  const access = useSubmit();
  const profile = useSubmit();
  const pw = useSubmit();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [roleId, setRoleId] = useState(user?.adminRole?.id ?? '');
  const [password, setPassword] = useState('');

  if (!user) return null;
  const status = userStatus[user.status];
  const locked = user.configured || isSelf;
  const profileChanged = name !== user.name || phone !== user.phone || roleId !== (user.adminRole?.id ?? '');

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    const res = await profile.run(() =>
      api<{ user: AdminUser }>(`/admin/users/${user!.id}`, {
        method: 'PATCH',
        body: { name, phone, ...(roleId !== (user!.adminRole?.id ?? '') ? { adminRoleId: roleId || null } : {}) },
      }),
    );
    if (res) {
      toast({ tone: 'success', message: 'Account saved' });
      onChanged(res.user);
    }
  }

  async function setStatus(next: 'active' | 'rejected' | 'disabled', message: string) {
    const res = await access.run(() => api<{ user: AdminUser }>(`/admin/users/${user!.id}/status`, { body: { status: next } }));
    if (res) {
      toast({ tone: 'success', message });
      onChanged(res.user);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    const ok = await pw.run(() => api(`/admin/users/${user!.id}/password`, { body: { password } }));
    if (ok) {
      toast({ tone: 'success', message: 'Password set. They’ve been signed out everywhere.' });
      setPassword('');
    }
  }

  return (
    <Dialog open onClose={onClose} title={user.name} className="max-w-lg">
      <div className="space-y-7">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[15px]">
          <dt className="text-ink-2">Email</dt>
          <dd className="min-w-0 truncate font-medium">{user.email}</dd>
          <dt className="text-ink-2">Phone</dt>
          <dd className="num">
            {user.phone ? (
              <a href={`tel:${user.phone.replace(/[^\d+]/g, '')}`} className="underline underline-offset-4">
                {user.phone}
              </a>
            ) : (
              '—'
            )}
          </dd>
          <dt className="text-ink-2">Status</dt>
          <dd>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </dd>
          <dt className="text-ink-2">Admin role</dt>
          <dd>{user.adminRole?.name ?? 'None (store user)'}</dd>
          <dt className="text-ink-2">Asked on</dt>
          <dd>{formatDate(user.createdAt)}</dd>
          <dt className="text-ink-2">Last sign-in</dt>
          <dd>{formatDateTime(user.lastLoginAt)}</dd>
        </dl>

        {can('stores.view') && (
          <section className="border-t border-line pt-5">
            <h3 className="font-semibold">Stores ({user.storeCount})</h3>
            {detail.data && detail.data.stores.length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-[15px]">
                {detail.data.stores.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <Link href={`/stores/${s.id}`} onClick={onClose} className="min-w-0 truncate font-medium underline underline-offset-4">
                      {s.name}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2 text-sm text-ink-2">
                      <span className="capitalize">{s.role}</span>
                      <StatusPill tone={storeStatus[s.status]?.tone ?? 'neutral'}>{storeStatus[s.status]?.label ?? s.status}</StatusPill>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-2">{detail.data ? 'Not on any store’s team.' : 'Loading…'}</p>
            )}
          </section>
        )}

        {can('users.manage') && (
          <form onSubmit={saveProfile} noValidate className="space-y-4 border-t border-line pt-5">
            <h3 className="font-semibold">Details</h3>
            <Field label="Name" error={profile.fieldErrors.name}>
              {(f) => <Input id={f.id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-invalid={f.invalid} />}
            </Field>
            <Field label="Phone number" optional error={profile.fieldErrors.phone}>
              {(f) => (
                <Input id={f.id} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={f.invalid} />
              )}
            </Field>
            <Field
              label="Admin role"
              hint={user.configured ? 'Set as a super admin in the server settings.' : isSelf ? 'You can’t change your own role.' : undefined}
              error={profile.fieldErrors.adminRoleId}
            >
              {(f) => (
                <fieldset disabled={locked} className="contents">
                  <RoleSelect id={f.id} value={roleId} onChange={setRoleId} roles={roles} invalid={f.invalid} />
                </fieldset>
              )}
            </Field>
            {profile.formError && !Object.keys(profile.fieldErrors).length && <FormAlert>{profile.formError}</FormAlert>}
            <Button type="submit" variant="secondary" disabled={!profileChanged || !name.trim()} loading={profile.pending}>
              Save details
            </Button>
          </form>
        )}

        {can('users.approve') && (
          <section className="border-t border-line pt-5">
            <h3 className="font-semibold">Access</h3>
            {user.configured && (
              <p className="mt-1 text-sm text-ink-2">Set as a super admin in the server settings, so it can’t be turned off here.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {user.status === 'pending' && (
                <>
                  <Button size="sm" loading={access.pending} onClick={() => setStatus('active', `${user.name} can sign in now`)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="danger" disabled={access.pending} onClick={() => setStatus('rejected', 'Request rejected')}>
                    Reject
                  </Button>
                </>
              )}
              {user.status === 'active' && (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={locked || access.pending}
                  onClick={() => setStatus('disabled', `${user.name} can no longer sign in`)}
                >
                  Turn off account
                </Button>
              )}
              {(user.status === 'disabled' || user.status === 'rejected') && (
                <Button size="sm" variant="secondary" loading={access.pending} onClick={() => setStatus('active', `${user.name} can sign in again`)}>
                  {user.status === 'rejected' ? 'Approve after all' : 'Turn back on'}
                </Button>
              )}
            </div>
            <div className="mt-3">
              <FormAlert>{access.formError}</FormAlert>
            </div>
          </section>
        )}

        {can('users.password') && (
          <section className="border-t border-line pt-5">
            <h3 className="font-semibold">Set a new password</h3>
            <p className="mt-1 text-sm text-ink-2">
              For someone who’s locked out. They’re signed out everywhere and can change it later under Your account.
            </p>
            <form onSubmit={savePassword} noValidate className="mt-3 space-y-3">
              <Field label="New password" error={pw.fieldErrors.password}>
                {(f) => <TemporaryPasswordInput id={f.id} value={password} onChange={setPassword} invalid={f.invalid} describedBy={f.describedBy} />}
              </Field>
              <FormAlert>{pw.fieldErrors.password ? '' : pw.formError}</FormAlert>
              <Button type="submit" variant="secondary" disabled={!password} loading={pw.pending}>
                Set password
              </Button>
            </form>
          </section>
        )}
      </div>
    </Dialog>
  );
}
