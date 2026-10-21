/**
 * Browser API client. Calls go to the same origin (/api/v1), which Next rewrites
 * to the Express API, so auth cookies are first-party and HttpOnly.
 */

export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldErrors = {},
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

type Envelope<T> =
  { success: true; data: T } | { success: false; error: { code: string; message: string; fields?: FieldErrors; details?: Record<string, unknown> } };

const SAFE = new Set(['GET', 'HEAD']);

function readCookie(name: string) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

let csrfPromise: Promise<string> | null = null;
async function csrfToken() {
  const existing = readCookie('csrf_token');
  if (existing) return existing;
  csrfPromise ??= fetch('/api/v1/auth/csrf', { credentials: 'same-origin' })
    .then((r) => r.json() as Promise<Envelope<{ csrfToken: string }>>)
    .then((b) => (b.success ? b.data.csrfToken : ''))
    .finally(() => {
      csrfPromise = null;
    });
  return csrfPromise;
}

// One refresh at a time per tab; parallel 401s wait for the same attempt.
let refreshPromise: Promise<boolean> | null = null;
function refreshSession() {
  refreshPromise ??= (async () => {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'x-csrf-token': await csrfToken() },
    });
    return res.ok;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/** Renews the access cookie, e.g. before reconnecting live updates. Resolves false when signed out. */
export const renewSession = () => refreshSession().catch(() => false);

type Options = { method?: string; body?: unknown; signal?: AbortSignal; form?: FormData; retry?: boolean; headers?: Record<string, string> };

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? (opts.body || opts.form ? 'POST' : 'GET');
  const headers: Record<string, string> = { accept: 'application/json', ...opts.headers };
  if (!SAFE.has(method)) headers['x-csrf-token'] = await csrfToken();
  if (opts.body !== undefined) headers['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal ?? AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'You seem to be offline. Check your connection and try again.');
  }

  const isAuthRoute = path.startsWith('/auth/refresh') || path.startsWith('/auth/login');
  if (res.status === 401 && opts.retry !== false && !isAuthRoute) {
    if (await refreshSession()) return api<T>(path, { ...opts, retry: false });
  }

  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!body) throw new ApiError(res.status, 'BAD_RESPONSE', 'Something went wrong. Please try again.');
  if (!body.success) {
    throw new ApiError(res.status, body.error.code, body.error.message, body.error.fields, body.error.details);
  }
  return body.data;
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
