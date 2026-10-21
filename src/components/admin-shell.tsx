import { ArrowLeft, ClipboardCheck, KeyRound, LayoutList, LogOut, Store, UsersRound } from 'lucide-react';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Wordmark } from '@/components/ui/brand';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useResource, type AdminSummary } from '@/lib/admin';
import { api, isApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Link, usePathname, useRouter } from '@/lib/router';
import { WEB_URL } from '@/lib/site';
import type { User } from '@/lib/types';

type AdminCtx = { me: User; summary: AdminSummary | undefined; refreshSummary: () => void };
const AdminContext = createContext<AdminCtx | null>(null);

/** The signed-in super admin and the panel's live counts. */
export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside AdminShell');
  return ctx;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useResource<{ user: User }>('/auth/me');
  const isAdmin = me.data?.user.role === 'superadmin';
  const summary = useResource<AdminSummary>(isAdmin ? '/admin/summary' : null);
  const reloadSummary = summary.reload;

  // Counts in the menu stay current as the admin moves between pages.
  useEffect(() => {
    reloadSummary();
  }, [pathname, reloadSummary]);

  useEffect(() => {
    if (isApiError(me.error) && me.error.status === 401) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [me.error, pathname, router]);

  async function signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  }

  if (!me.data) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-8" aria-busy>
        {me.error && !(isApiError(me.error) && me.error.status === 401) ? (
          <p role="alert" className="text-danger">
            We couldn’t reach the server. Check your connection and reload the page.
          </p>
        ) : (
          <>
            <Skeleton className="h-10 w-64" />
            <Skeleton className="mt-6 h-40 w-full" />
          </>
        )}
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-8">
        <Wordmark href="/" />
        <h1 className="display mt-10 text-[34px]">This area is for admins</h1>
        <p className="mt-3 text-ink-2">
          You’re signed in as <span className="font-semibold text-ink">{me.data.user.email}</span>, which isn’t a super admin account.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={`${WEB_URL}/dashboard`} className={buttonClass({})}>
            Go to your stores
          </a>
          <button onClick={signOut} className="h-11 px-2 font-semibold underline decoration-line-strong decoration-2 underline-offset-4">
            Sign in as someone else
          </button>
        </div>
      </div>
    );
  }

  const counts = summary.data;
  const nav = [
    { href: '/', label: 'Overview', icon: LayoutList, exact: true },
    { href: '/requests', label: 'Sign-up requests', short: 'Requests', icon: ClipboardCheck, badge: counts?.pending },
    { href: '/tickets', label: 'Password resets', short: 'Resets', icon: KeyRound, badge: counts?.openTickets },
    { href: '/users', label: 'Accounts', icon: UsersRound },
    { href: '/stores', label: 'Stores', icon: Store },
  ];
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  return (
    <AdminContext.Provider value={{ me: me.data.user, summary: counts, refreshSummary: summary.reload }}>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-paper-deep px-3 py-4 md:flex">
          <div className="flex items-center gap-2 px-2">
            <Wordmark href="/" />
            <span className="rounded-full border border-ink/20 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-ink-2">Admin</span>
          </div>
          <nav aria-label="Admin" className="mt-8 flex-1">
            <ul className="space-y-0.5">
              {nav.map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={isActive(n.href, n.exact) ? 'page' : undefined}
                    className={cn(
                      'flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-ink-2 hover:bg-paper hover:text-ink',
                      isActive(n.href, n.exact) && 'bg-surface font-semibold text-ink ring-1 ring-line',
                    )}
                  >
                    <n.icon size={19} strokeWidth={1.75} aria-hidden />
                    <span className="flex-1">{n.label}</span>
                    {n.badge ? (
                      <span className="num rounded-full bg-accent px-2 py-0.5 text-[12px] font-bold text-ink" aria-label={`${n.badge} waiting`}>
                        {n.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="border-t border-line-strong pt-3">
            <div className="px-3 py-2">
              <span className="block truncate text-[15px] font-semibold">{me.data.user.name}</span>
              <span className="block truncate text-[13px] text-ink-2">{me.data.user.email}</span>
            </div>
            <a
              href={`${WEB_URL}/dashboard`}
              className="flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] text-ink-2 hover:bg-paper hover:text-ink"
            >
              <ArrowLeft size={18} strokeWidth={1.75} aria-hidden /> Store dashboard
            </a>
            <button
              onClick={signOut}
              className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[15px] text-ink-2 hover:bg-paper hover:text-ink"
            >
              <LogOut size={18} strokeWidth={1.75} aria-hidden /> Sign out
            </button>
          </div>
        </aside>

        {/* Phones: a top bar and a scrolling row of sections. */}
        <header className="sticky top-0 z-30 border-b border-line bg-paper md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Wordmark href="/" />
              <span className="rounded-full border border-ink/20 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-ink-2">Admin</span>
            </div>
            <button onClick={signOut} className="h-10 px-2 text-[15px] font-medium text-ink-2">
              Sign out
            </button>
          </div>
          <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(n.href, n.exact) ? 'page' : undefined}
                className={cn(
                  'flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-transparent px-3 text-[14px] font-medium text-ink-2',
                  isActive(n.href, n.exact) && 'border-line-strong bg-surface font-semibold text-ink',
                )}
              >
                {n.short ?? n.label}
                {n.badge ? <span className="num rounded-full bg-accent px-1.5 text-[12px] font-bold text-ink">{n.badge}</span> : null}
              </Link>
            ))}
          </nav>
        </header>

        <main id="main" className="min-w-0 flex-1 pb-16">
          {children}
        </main>
      </div>
    </AdminContext.Provider>
  );
}
