import type { ComponentType } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { PageBody, PageHeader } from '@/components/page';
import { Link, RouterProvider, usePathname } from '@/lib/router';
import { ToastProvider } from '@/components/ui/toast';
import { LoginPage } from '@/pages/login';
import OverviewPage from '@/pages/overview';
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
};

function Routes() {
  const pathname = usePathname().replace(/(.)\/$/, '$1');
  if (pathname === '/login') return <LoginPage />;
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
