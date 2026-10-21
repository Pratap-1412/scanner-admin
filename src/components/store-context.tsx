import { createContext, useContext } from 'react';
import type { StorePermission } from '@/lib/types';

/** The store fields the workspace uses directly. Tabs fetch anything else they need. */
export type StoreData = {
  id: string;
  name: string;
  slug: string;
  status: 'draft' | 'published' | 'paused' | 'archived';
  businessType: string;
  ownerUserId: string;
  description: string;
  shopCategory: string;
  phone: string;
  email: string;
  currency: string;
  timezone: string;
  logo: { url: string } | null;
  orderingSettings: { enabled: boolean; fulfilmentTypes: string[] } & Record<string, unknown>;
  createdAt: string;
} & Record<string, unknown>;

export type StorePreset = {
  label: string;
  catalogueLabel: string;
  itemLabel: string;
  suggestedCategories: string[];
  fulfilmentTypes: string[];
  dietaryMarks: boolean;
};

export type StoreCtx = {
  storeId: string;
  store: StoreData;
  preset: StorePreset;
  /** The admin's permissions in this store, from their admin role's `store:*` permissions. */
  permissions: StorePermission[];
  can: (perm: StorePermission) => boolean;
  /** Refetches the store, e.g. after settings or status change. */
  reload: () => void;
};

export const StoreContext = createContext<StoreCtx | null>(null);

/** The store open in the admin's workspace (`/stores/:id/...`). */
export function useStoreWorkspace() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStoreWorkspace must be used inside the store workspace');
  return ctx;
}
