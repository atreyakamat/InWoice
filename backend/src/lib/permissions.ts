/**
 * Staff roles. Each role gets none / read / write access to each area of the app.
 * GET requests need read access; anything that changes data needs write access.
 * Settings, team and backups stay admin-only (checked separately with requireAdmin).
 */

export const ROLES = ['ADMIN', 'STAFF', 'SALES', 'STORES', 'ACCOUNTANT'] as const;
export type Role = (typeof ROLES)[number];

export const AREAS = ['sales', 'catalog', 'inventory', 'procurement', 'payables', 'accounts', 'insights'] as const;
export type Area = (typeof AREAS)[number];

export type Access = 'none' | 'read' | 'write';

const all = (a: Access) => Object.fromEntries(AREAS.map((x) => [x, a])) as Record<Area, Access>;

export const ROLE_ACCESS: Record<Role, Record<Area, Access>> = {
  // Owner: everything, plus settings, team and backups.
  ADMIN: all('write'),
  // General staff: day-to-day work everywhere (the behaviour before roles existed).
  STAFF: all('write'),
  // Front office: customers, quotes, invoices and payments. Sees stock, not costs.
  SALES: { sales: 'write', catalog: 'read', inventory: 'read', procurement: 'none', payables: 'none', accounts: 'none', insights: 'read' },
  // Stores / production: stock, purchase orders, suppliers, production, dispatch.
  STORES: { sales: 'read', catalog: 'write', inventory: 'write', procurement: 'write', payables: 'none', accounts: 'none', insights: 'read' },
  // Accountant: sees everything, enters bills and expenses, can't change sales or stock.
  ACCOUNTANT: { sales: 'read', catalog: 'read', inventory: 'read', procurement: 'read', payables: 'write', accounts: 'read', insights: 'read' },
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  STAFF: 'Staff',
  SALES: 'Sales',
  STORES: 'Stores',
  ACCOUNTANT: 'Accountant',
};

export function accessFor(role: string): Record<Area, Access> {
  return ROLE_ACCESS[(ROLES as readonly string[]).includes(role) ? (role as Role) : 'SALES'] ?? all('none');
}

export function can(role: string, area: Area, need: 'read' | 'write') {
  const a = accessFor(role)[area];
  return need === 'read' ? a === 'read' || a === 'write' : a === 'write';
}
