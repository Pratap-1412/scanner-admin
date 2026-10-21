export type UserRole = 'user' | 'superadmin';
export type UserStatus = 'pending' | 'active' | 'disabled' | 'rejected';
export type User = { id: string; name: string; email: string; role: UserRole; status: UserStatus };
