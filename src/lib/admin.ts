import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { UserRole, UserStatus } from './types';

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  approvedAt: string | null;
  lastLoginAt: string | null;
  storeCount: number;
  /** Set in SUPERADMIN_EMAILS on the server; can't be demoted or turned off from the panel. */
  configured: boolean;
};

export type AdminTicket = {
  id: string;
  type: 'password_reset';
  status: 'open' | 'resolved' | 'dismissed';
  email: string;
  contact: string;
  message: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  user: { id: string; name: string; status: UserStatus } | null;
};

export type AdminStore = {
  id: string;
  name: string;
  slug: string;
  status: string;
  businessType: string;
  createdAt: string;
  owner: { name: string; email: string } | null;
};

export type AdminSummary = { pending: number; active: number; openTickets: number; stores: number; liveStores: number };

export type Paged<K extends string, T> = { [key in K]: T[] } & { total: number; page: number; pageSize: number };

/**
 * Loads one API resource and reloads it on demand. A path of null waits. Keeps the previous
 * data on screen while a reload or a new page is fetched, so lists don't flash empty.
 */
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if ((err as Error).name !== 'AbortError') setError(err);
      });
    return () => controller.abort();
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload };
}

/** A query string from the set values only. */
export function qs(params: Record<string, string | number | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const formatDate = (iso: string | null | undefined) => (iso ? dateFormat.format(new Date(iso)) : '—');
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTimeFormat.format(new Date(iso)) : '—');

/** "3 hours ago", for how long a request has been waiting. */
export function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} day${days === 1 ? '' : 's'} ago` : formatDate(iso);
}

/**
 * A temporary password that is easy to read out over the phone: no 0/O or 1/l/I,
 * grouped in fours (14 characters, about 70 bits).
 */
export function temporaryPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export const userStatus: Record<UserStatus, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  pending: { label: 'Waiting', tone: 'warning' },
  active: { label: 'Active', tone: 'success' },
  disabled: { label: 'Turned off', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'danger' },
};
