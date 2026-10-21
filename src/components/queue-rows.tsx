import { useState, type FormEvent } from 'react';
import { FormAlert } from '@/components/ui/form-alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { formatDateTime, temporaryPassword, timeAgo, userStatus, type AdminTicket, type AdminUser } from '@/lib/admin';
import { api } from '@/lib/api';
import { useSubmit } from '@/lib/use-submit';
import { TemporaryPasswordInput } from './admin-ui';

/** One sign-up request with approve and reject (or, once rejected, approve and delete). */
export function RequestRow({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const toast = useToast();
  const { pending, formError, run } = useSubmit();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function setStatus(status: 'active' | 'rejected', message: string) {
    const ok = await run(() => api(`/admin/users/${user.id}/status`, { body: { status } }));
    if (ok) {
      toast({ tone: 'success', message });
      onDone();
    }
  }

  async function remove() {
    const ok = await run(() => api(`/admin/users/${user.id}`, { method: 'DELETE' }));
    setConfirmDelete(false);
    if (ok) {
      toast({ tone: 'success', message: 'Request deleted' });
      onDone();
    }
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{user.name}</p>
        <p className="truncate text-[15px] text-ink-2">{user.email}</p>
        <p className="mt-0.5 text-sm text-ink-3">
          Asked {timeAgo(user.createdAt)}
          {user.status === 'rejected' && (
            <>
              {' · '}
              <StatusPill tone={userStatus.rejected.tone} className="ml-1 align-middle">
                {userStatus.rejected.label}
              </StatusPill>
            </>
          )}
        </p>
        {formError && (
          <p role="alert" className="mt-1 text-sm font-medium text-danger">
            {formError}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" disabled={pending} onClick={() => setStatus('active', `${user.name} can sign in now`)}>
          Approve
        </Button>
        {user.status === 'pending' ? (
          <Button size="sm" variant="danger" disabled={pending} onClick={() => setStatus('rejected', 'Request rejected')}>
            Reject
          </Button>
        ) : (
          <Button size="sm" variant="danger" disabled={pending} onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={pending}
        title="Delete this request?"
        confirmLabel="Delete request"
      >
        {user.email} will be removed. They can ask again from the sign-up page.
      </ConfirmDialog>
    </li>
  );
}

/** One password-reset ticket: set a temporary password (which closes it) or dismiss it. */
export function TicketRow({ ticket, onDone }: { ticket: AdminTicket; onDone: () => void }) {
  const toast = useToast();
  const [resolving, setResolving] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [password, setPassword] = useState('');
  const close = useSubmit();

  async function resolve(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const note = String(new FormData(e.currentTarget).get('note') ?? '');
    const ok = await close.run(() =>
      api(`/admin/tickets/${ticket.id}/close`, { body: { outcome: 'resolved', password, ...(note ? { note } : {}) } }),
    );
    if (ok) {
      toast({ tone: 'success', message: `New password set for ${ticket.email}. Let them know.` });
      setResolving(false);
      onDone();
    }
  }

  async function dismiss() {
    const ok = await close.run(() => api(`/admin/tickets/${ticket.id}/close`, { body: { outcome: 'dismissed' } }));
    setDismissing(false);
    if (ok) {
      toast({ tone: 'success', message: 'Request dismissed' });
      onDone();
    }
  }

  const closed = ticket.status !== 'open';
  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{ticket.user?.name ?? ticket.email}</p>
          <p className="truncate text-[15px] text-ink-2">{ticket.email}</p>
          {ticket.contact && (
            <p className="mt-2 text-[15px]">
              <span className="text-ink-2">Reach them on: </span>
              <span className="font-medium">{ticket.contact}</span>
            </p>
          )}
          {ticket.message && <p className="mt-2 whitespace-pre-line border-l-2 border-line-strong pl-3 text-[15px] text-ink-2">{ticket.message}</p>}
          <p className="mt-2 text-sm text-ink-3">
            {closed
              ? `${ticket.status === 'resolved' ? 'Resolved' : 'Dismissed'}${ticket.resolvedBy ? ` by ${ticket.resolvedBy}` : ''} · ${formatDateTime(ticket.resolvedAt)}`
              : `Asked ${timeAgo(ticket.updatedAt)}`}
            {ticket.user && ticket.user.status !== 'active' && ` · account is ${userStatus[ticket.user.status].label.toLowerCase()}`}
          </p>
          {closed && ticket.note && <p className="mt-1 text-sm text-ink-2">Note: {ticket.note}</p>}
        </div>
        {!closed && (
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              onClick={() => {
                setPassword(temporaryPassword());
                setResolving(true);
              }}
            >
              Set new password
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDismissing(true)}>
              Dismiss
            </Button>
          </div>
        )}
      </div>

      <Dialog open={resolving} onClose={() => setResolving(false)} title="Set a new password">
        <form onSubmit={resolve} noValidate className="space-y-5">
          <p className="text-[15px] text-ink-2">
            For <span className="font-semibold text-ink">{ticket.email}</span>. They’ll be signed out everywhere. Copy the password and send it to
            them{ticket.contact ? ` on ${ticket.contact}` : ''}.
          </p>
          <Field label="Temporary password" error={close.fieldErrors.password}>
            {(f) => <TemporaryPasswordInput id={f.id} value={password} onChange={setPassword} invalid={f.invalid} describedBy={f.describedBy} />}
          </Field>
          <Field label="Note for other admins" optional error={close.fieldErrors.note}>
            {(f) => <Input id={f.id} name="note" maxLength={500} placeholder="e.g. Sent on WhatsApp" aria-invalid={f.invalid} />}
          </Field>
          <FormAlert>{close.fieldErrors.password ? '' : close.formError}</FormAlert>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setResolving(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={close.pending} disabled={!password}>
              Set password and close
            </Button>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={dismissing}
        onClose={() => setDismissing(false)}
        onConfirm={dismiss}
        loading={close.pending}
        title="Dismiss this request?"
        confirmLabel="Dismiss"
      >
        The password stays as it is. Use this for requests you didn’t make or that are already sorted out.
      </ConfirmDialog>
    </li>
  );
}
