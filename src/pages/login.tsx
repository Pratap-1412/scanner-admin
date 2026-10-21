import { useEffect, type FormEvent } from 'react';
import chaiStall from '@/assets/chai-stall.jpg';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/ui/brand';
import { Field, Input, PasswordInput } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { api } from '@/lib/api';
import { useRouter, useSearchParams } from '@/lib/router';
import { WEB_URL } from '@/lib/site';
import type { User } from '@/lib/types';
import { useSubmit } from '@/lib/use-submit';

/** Only panel pages are allowed as a post-login destination. */
const safeNext = (next: string | null) => (next && /^\/(requests|tickets|users|stores)?$/.test(next) ? next : '/');

export function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { pending, fieldErrors, formError, setFormError, run } = useSubmit();
  const next = safeNext(params.get('next'));

  // Already signed in as a super admin: go straight in.
  useEffect(() => {
    api<{ user: User }>('/auth/me', { retry: false })
      .then(({ user }) => {
        if (user.role === 'superadmin') router.replace(next);
      })
      .catch(() => undefined);
  }, [next, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const res = await run(() => api<{ user: User }>('/auth/login', { body }));
    if (!res) return;
    if (res.user.role !== 'superadmin') {
      // A store owner's password is right, but this panel isn't theirs. Don't leave them signed in here.
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
      setFormError('This account isn’t a super admin. Store owners sign in on the main site.');
      return;
    }
    router.replace(next);
  }

  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center gap-2">
          <Wordmark href="/" />
          <span className="rounded-full border border-ink/20 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-ink-2">Admin</span>
        </div>
        <main className="flex flex-1 items-start justify-center pt-10 sm:pt-16">
          <div className="w-full max-w-[400px]">
            <h1 className="display text-[36px]">Admin sign in</h1>
            <p className="mt-2 text-ink-2">Approve new accounts, answer password reset requests and manage stores.</p>
            <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
              <Field label="Email" error={fieldErrors.email}>
                {(f) => (
                  <Input
                    id={f.id}
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    aria-invalid={f.invalid}
                    aria-describedby={f.describedBy}
                  />
                )}
              </Field>
              <Field label="Password" error={fieldErrors.password}>
                {(f) => (
                  <PasswordInput
                    id={f.id}
                    name="password"
                    autoComplete="current-password"
                    required
                    aria-invalid={f.invalid}
                    aria-describedby={f.describedBy}
                  />
                )}
              </Field>
              <FormAlert>{formError}</FormAlert>
              <Button type="submit" size="lg" block loading={pending}>
                Sign in
              </Button>
            </form>
            <p className="mt-8 border-t border-line pt-6 text-[15px] text-ink-2">
              Not an admin?{' '}
              <a href={`${WEB_URL}/sign-in`} className="font-semibold text-ink underline underline-offset-4">
                Store owner sign in
              </a>
            </p>
          </div>
        </main>
      </div>
      <div className="relative hidden lg:block">
        <img src={chaiStall} alt="" className="absolute inset-0 size-full object-cover" />
      </div>
    </div>
  );
}
