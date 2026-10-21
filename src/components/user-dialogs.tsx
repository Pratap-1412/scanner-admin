import { useState, type FormEvent } from 'react';
import { FormAlert } from '@/components/ui/form-alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input } from '@/components/ui/field';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatDateTime, temporaryPassword, userStatus, type AdminUser } from '@/lib/admin';
import { api } from '@/lib/api';
import { useSubmit } from '@/lib/use-submit';
import { TemporaryPasswordInput } from './admin-ui';

/** Creates an account that can sign in straight away, with no approval step. */
export function AddUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (u: AdminUser) => void }) {
  const toast = useToast();
  const { pending, fieldErrors, formError, run } = useSubmit();
  const [password, setPassword] = useState(() => temporaryPassword());
  const [superadmin, setSuperadmin] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const res = await run(() =>
      api<{ user: AdminUser }>('/admin/users', {
        body: { name: data.name, email: data.email, password, role: superadmin ? 'superadmin' : 'user' },
      }),
    );
    if (res) {
      toast({ tone: 'success', message: `Account made for ${res.user.email}. Share the password with them.` });
      form.reset();
      setPassword(temporaryPassword());
      setSuperadmin(false);
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
        <Field label="Password" hint="At least 8 characters." error={fieldErrors.password}>
          {(f) => <TemporaryPasswordInput id={f.id} value={password} onChange={setPassword} invalid={f.invalid} describedBy={f.describedBy} />}
        </Field>
        <Checkbox label="Super admin (can use this admin panel)" checked={superadmin} onChange={(e) => setSuperadmin(e.target.checked)} />
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

/** Everything an admin can do to one account: approve, turn off, change role, set a password. */
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
  const access = useSubmit();
  const rename = useSubmit();
  const [name, setName] = useState(user?.name ?? '');
  const pw = useSubmit();
  const [password, setPassword] = useState('');

  if (!user) return null;
  const status = userStatus[user.status];
  const locked = user.configured || isSelf;

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const res = await rename.run(() => api<{ user: AdminUser }>(`/admin/users/${user!.id}`, { method: 'PATCH', body: { name } }));
    if (res) {
      toast({ tone: 'success', message: 'Name saved' });
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

  async function setRole(role: 'user' | 'superadmin') {
    const res = await access.run(() => api<{ user: AdminUser }>(`/admin/users/${user!.id}`, { method: 'PATCH', body: { role } }));
    if (res) {
      toast({
        tone: 'success',
        message: role === 'superadmin' ? `${res.user.name} is now a super admin` : `${res.user.name} is no longer a super admin`,
      });
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
          <dt className="text-ink-2">Status</dt>
          <dd>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </dd>
          <dt className="text-ink-2">Role</dt>
          <dd>{user.role === 'superadmin' ? 'Super admin' : 'Store user'}</dd>
          <dt className="text-ink-2">Stores</dt>
          <dd className="num">{user.storeCount}</dd>
          <dt className="text-ink-2">Asked on</dt>
          <dd>{formatDate(user.createdAt)}</dd>
          <dt className="text-ink-2">Last sign-in</dt>
          <dd>{formatDateTime(user.lastLoginAt)}</dd>
        </dl>

        <form onSubmit={saveName} noValidate className="flex flex-wrap items-end gap-2 border-t border-line pt-5">
          <Field label="Name" error={rename.fieldErrors.name} className="min-w-0 flex-1 basis-56">
            {(f) => <Input id={f.id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-invalid={f.invalid} />}
          </Field>
          <Button type="submit" variant="secondary" className="h-12" disabled={!name.trim() || name === user.name} loading={rename.pending}>
            Save name
          </Button>
          {rename.formError && !rename.fieldErrors.name && (
            <p role="alert" className="w-full text-sm font-medium text-danger">
              {rename.formError}
            </p>
          )}
        </form>

        <section className="border-t border-line pt-5">
          <h3 className="font-semibold">Access</h3>
          {user.configured && <p className="mt-1 text-sm text-ink-2">Set as a super admin in the server settings, so it can’t be changed here.</p>}
          {isSelf && !user.configured && <p className="mt-1 text-sm text-ink-2">This is you. Ask another super admin to change your access.</p>}
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
            {user.status === 'active' &&
              (user.role === 'superadmin' ? (
                <Button size="sm" variant="secondary" disabled={locked || access.pending} onClick={() => setRole('user')}>
                  Remove super admin
                </Button>
              ) : (
                <Button size="sm" variant="secondary" disabled={access.pending} onClick={() => setRole('superadmin')}>
                  Make super admin
                </Button>
              ))}
          </div>
          <div className="mt-3">
            <FormAlert>{access.formError}</FormAlert>
          </div>
        </section>

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
      </div>
    </Dialog>
  );
}
