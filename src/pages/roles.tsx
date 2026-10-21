import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RequirePermission, useAdmin } from '@/components/admin-shell';
import { LoadError, RowList } from '@/components/admin-ui';
import { PageBody, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { useResource, type AdminRole, type PermissionGroup } from '@/lib/admin';
import { api } from '@/lib/api';
import { Link } from '@/lib/router';
import type { AdminPermission } from '@/lib/types';
import { useSubmit } from '@/lib/use-submit';

export default function RolesPage() {
  return (
    <RequirePermission perm="roles.view">
      <Roles />
    </RequirePermission>
  );
}

function Roles() {
  const { can, role: myRole } = useAdmin();
  const roles = useResource<{ roles: AdminRole[] }>('/admin/roles');
  const catalogue = useResource<{ groups: PermissionGroup[] }>('/admin/permissions');
  const [editing, setEditing] = useState<AdminRole | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminRole | null>(null);
  const remove = useSubmit();
  const toast = useToast();

  async function confirmDelete() {
    if (!deleting) return;
    const ok = await remove.run(() => api(`/admin/roles/${deleting.id}`, { method: 'DELETE' }));
    if (ok) {
      toast({ tone: 'success', message: `${deleting.name} deleted` });
      setDeleting(null);
      roles.reload();
    }
  }

  return (
    <PageBody>
      <PageHeader
        title="Roles"
        description="What each admin can do. Every admin account has one role; store owners and staff have none."
        action={
          can('roles.manage') && (
            <Button icon={<Plus size={18} strokeWidth={1.75} aria-hidden />} onClick={() => setEditing('new')}>
              New role
            </Button>
          )
        }
      />
      {roles.error ? (
        <LoadError onRetry={roles.reload} />
      ) : !roles.data ? (
        <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />
      ) : (
        <RowList>
          {roles.data.roles.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {r.name}
                  {r.system && <StatusPill tone="brand">Protected</StatusPill>}
                  {r.id === myRole.id && <span className="text-sm font-normal text-ink-3">(your role)</span>}
                </p>
                {r.description && <p className="mt-0.5 text-[15px] text-ink-2">{r.description}</p>}
                <p className="mt-1 text-sm text-ink-3">
                  {r.system ? 'Every permission' : `${r.permissions.length} permission${r.permissions.length === 1 ? '' : 's'}`} ·{' '}
                  {can('users.view') ? (
                    <Link href={`/users?role=${r.id}`} className="underline underline-offset-4">
                      {r.userCount} account{r.userCount === 1 ? '' : 's'}
                    </Link>
                  ) : (
                    `${r.userCount} account${r.userCount === 1 ? '' : 's'}`
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                  {can('roles.manage') && !r.system ? 'Edit' : 'View'}
                </Button>
                {can('roles.manage') && !r.system && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setDeleting(r)}
                    disabled={r.userCount > 0}
                    title={r.userCount > 0 ? 'Give its accounts another role first' : undefined}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </RowList>
      )}

      {editing && catalogue.data && (
        <RoleEditor
          key={editing === 'new' ? 'new' : editing.id}
          role={editing === 'new' ? null : editing}
          groups={catalogue.data.groups}
          readOnly={!can('roles.manage') || (editing !== 'new' && editing.system)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            roles.reload();
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={remove.pending}
        title={`Delete ${deleting?.name ?? 'role'}?`}
        confirmLabel="Delete role"
      >
        {remove.formError || 'Nobody has this role, so nothing else changes.'}
      </ConfirmDialog>
    </PageBody>
  );
}

function RoleEditor({
  role,
  groups,
  readOnly,
  onClose,
  onSaved,
}: {
  role: AdminRole | null;
  groups: PermissionGroup[];
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can, role: myRole } = useAdmin();
  const toast = useToast();
  const { pending, fieldErrors, formError, run } = useSubmit();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<Set<AdminPermission>>(() => new Set(role?.permissions ?? []));

  // Non-super admins can only hand out permissions they hold themselves; the API checks this too.
  const grantable = (p: AdminPermission) => myRole.system || can(p);
  const toggle = (p: AdminPermission, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(p);
      else next.delete(p);
      return next;
    });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = { name, description, permissions: [...selected] };
    const res = await run(() => (role ? api(`/admin/roles/${role.id}`, { method: 'PATCH', body }) : api('/admin/roles', { body })));
    if (res) {
      toast({ tone: 'success', message: role ? 'Role saved' : `${name} created` });
      onSaved();
    }
  }

  return (
    <Dialog open onClose={onClose} title={readOnly ? (role?.name ?? 'Role') : role ? `Edit ${role.name}` : 'New role'} className="max-w-2xl">
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {!readOnly && (
          <>
            <Field label="Name" error={fieldErrors.name}>
              {(f) => <Input id={f.id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required aria-invalid={f.invalid} />}
            </Field>
            <Field label="Description" optional error={fieldErrors.description}>
              {(f) => (
                <Textarea
                  id={f.id}
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={300}
                  aria-invalid={f.invalid}
                />
              )}
            </Field>
          </>
        )}
        {role?.system && <p className="text-[15px] text-ink-2">The super admin role always has every permission, including ones added later.</p>}
        <div className="space-y-5">
          {groups.map((g) => {
            const keys = g.permissions.map((p) => p.key);
            const allOn = keys.every((k) => selected.has(k));
            return (
              <fieldset key={g.group} className="rounded-[var(--radius-card)] border border-line px-4 py-3">
                <legend className="px-1 text-[15px] font-semibold">{g.group}</legend>
                {!readOnly && (
                  <button
                    type="button"
                    className="mb-2 text-sm font-semibold underline decoration-line-strong decoration-2 underline-offset-4"
                    onClick={() => keys.filter(grantable).forEach((k) => toggle(k, !allOn))}
                  >
                    {allOn ? 'Clear all' : 'Select all'}
                  </button>
                )}
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {g.permissions.map((p) => (
                    <Checkbox
                      key={p.key}
                      label={p.label}
                      checked={role?.system || selected.has(p.key)}
                      disabled={readOnly || !grantable(p.key)}
                      onChange={(e) => toggle(p.key, e.target.checked)}
                    />
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
        {fieldErrors.permissions && <FormAlert>{fieldErrors.permissions}</FormAlert>}
        <FormAlert>{fieldErrors.permissions ? '' : formError}</FormAlert>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button type="submit" loading={pending} disabled={!name.trim()}>
              {role ? 'Save role' : 'Create role'}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
