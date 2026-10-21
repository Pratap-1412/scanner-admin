import type { ComponentType } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { PageBody, PageHeader } from '@/components/page';
import { Link, RouterProvider, usePathname } from '@/lib/router';
import { ToastProvider } from '@/components/ui/toast';
import { LoginPage } from '@/pages/login';
import OverviewPage from '@/pages/overview';
import RolesPage from '@/pages/roles';
import StoreWorkspace from '@/pages/store/workspace';
import RequestsPage from '@/pages/requests';
import StoresPage from '@/pages/stores';
import TicketsPage from '@/pages/tickets';
import UsersPage from '@/pages/users';

const pages: Record<string, { title: string; Page: ComponentType }> = {
  '/': { title: 'Overview', Page: OverviewPage },
  '/requests': { title: 'Sign-up requests', Page: RequestsPage },
  '/tickets': { title: 'Password resets', Page: TicketsPage },
  '/users': { title: 'Accounts', Page: UsersPage },
  '/stores': { title: 'Stores', Page: StoresPage },
  '/roles': { title: 'Roles', Page: RolesPage },
};

function Routes() {
  const pathname = usePathname().replace(/(.)\/$/, '$1');
  if (pathname === '/login') return <LoginPage />;
  const store = /^\/stores\/([a-f\d]{24})(?:\/([a-z]+))?$/.exec(pathname);
  if (store) {
    return (
      <AdminShell>
        <StoreWorkspace key={store[1]} storeId={store[1]!} tab={store[2] ?? 'settings'} />
      </AdminShell>
    );
  }
  const page = pages[pathname];
  return <AdminShell>{page ? <page.Page key={pathname} /> : <NotFound />}</AdminShell>;
}

function NotFound() {
  return (
    <PageBody>
      <PageHeader title="Page not found" description="This page doesn’t exist in the admin panel." />
      <Link href="/" className="font-semibold underline underline-offset-4">
        Back to the overview
      </Link>
    </PageBody>
  );
}

export function App() {
  return (
    <RouterProvider>
      <ToastProvider>
        <Routes />
      </ToastProvider>
    </RouterProvider>
  );
}
