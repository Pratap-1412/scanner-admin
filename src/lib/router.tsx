import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ComponentProps, type MouseEvent, type ReactNode } from 'react';

/**
 * A minimal history-API router: the current location, navigate(), and a <Link>. The panel has
 * a handful of fixed pages, so this is all it needs.
 */
type Location = { pathname: string; search: string };
type Router = { location: Location; navigate: (to: string, opts?: { replace?: boolean }) => void };

const RouterContext = createContext<Router | null>(null);

const current = (): Location => ({ pathname: window.location.pathname, search: window.location.search });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(current);

  useEffect(() => {
    const onPop = () => setLocation(current());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (opts?.replace) window.history.replaceState(null, '', to);
    else window.history.pushState(null, '', to);
    setLocation(current());
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

function useRouterContext() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('Router hooks must be used inside RouterProvider');
  return ctx;
}

export function useRouter() {
  const { navigate } = useRouterContext();
  return useMemo(() => ({ push: (to: string) => navigate(to), replace: (to: string) => navigate(to, { replace: true }) }), [navigate]);
}

export const usePathname = () => useRouterContext().location.pathname;

export function useSearchParams() {
  const { search } = useRouterContext().location;
  return useMemo(() => new URLSearchParams(search), [search]);
}

/** An <a> that navigates without a page load. Modified clicks and new tabs behave normally. */
export function Link({ href, onClick, target, ...props }: ComponentProps<'a'> & { href: string }) {
  const { navigate } = useRouterContext();
  function handle(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || target === '_blank') return;
    if (!href.startsWith('/')) return;
    e.preventDefault();
    navigate(href);
  }
  return <a href={href} target={target} onClick={handle} {...props} />;
}
