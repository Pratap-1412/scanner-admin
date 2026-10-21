export type UserStatus = 'pending' | 'active' | 'disabled' | 'rejected';
export type User = { id: string; name: string; email: string; phone: string; status: UserStatus; isAdmin: boolean };

export type AdminPermission =
  | 'users.view'
  | 'users.manage'
  | 'users.approve'
  | 'users.password'
  | 'users.delete'
  | 'tickets.manage'
  | 'roles.view'
  | 'roles.manage'
  | 'stores.view'
  | 'stores.create'
  | 'stores.owner'
  | `store:${StorePermission}`;

/** What someone can do inside a store (api/src/modules/stores/permissions.ts). */
export type StorePermission =
  | 'store.settings'
  | 'store.publish'
  | 'store.archive'
  | 'catalogue.edit'
  | 'catalogue.availability'
  | 'orders.manage'
  | 'qrs.manage'
  | 'customers.view'
  | 'customers.manage'
  | 'promos.manage'
  | 'reviews.manage'
  | 'reports.view'
  | 'members.manage'
  | 'audit.view';

export type AdminMe = {
  user: { id: string; name: string; email: string; phone: string };
  role: { id: string; name: string; system: boolean };
  permissions: AdminPermission[];
};
