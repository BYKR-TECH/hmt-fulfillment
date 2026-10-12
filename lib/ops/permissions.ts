// Deny-by-default access for the new Ops screens (rebuild spec §5, §8).
// A permission not granted to a role here is refused, and a route not listed
// in ROUTE_PERMISSIONS is refused too.

export const PERMISSIONS = [
  'orders.view',
  'orders.edit',
  'shipping.book',
  'shipping.pickup',
  'shipping.cancel',
  'shipping.print',
  'exceptions.view',
  'exceptions.act',
  'carts.view',
  'carts.edit',
  'messages.send',
  'gst.view',
  'invoices.manage',
  'automation.view',
  'automation.run',
  'settings.view',
  'settings.manage',
  'users.manage'
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type Role = 'admin' | 'ops_manager' | 'shipping' | 'support' | 'accounts' | 'viewer';

const VIEW_ALL: Permission[] = ['orders.view', 'exceptions.view', 'carts.view', 'gst.view', 'automation.view', 'settings.view'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  ops_manager: [
    'orders.view', 'orders.edit', 'shipping.book', 'shipping.pickup', 'shipping.cancel', 'shipping.print',
    'exceptions.view', 'exceptions.act', 'carts.view', 'carts.edit', 'messages.send', 'gst.view',
    'automation.view', 'automation.run', 'settings.view'
  ],
  shipping: ['orders.view', 'shipping.book', 'shipping.pickup', 'shipping.print', 'exceptions.view'],
  support: ['orders.view', 'orders.edit', 'exceptions.view', 'exceptions.act', 'carts.view', 'carts.edit', 'messages.send'],
  accounts: ['orders.view', 'gst.view', 'invoices.manage'],
  viewer: VIEW_ALL
};

// Roles stored in public.users today → rebuild roles. Unknown roles get nothing.
const LEGACY_ROLE_MAP: Record<string, Role> = {
  admin: 'admin',
  finance_admin: 'admin',
  operations_manager: 'ops_manager',
  ops_manager: 'ops_manager',
  packing_operator: 'shipping',
  shipping: 'shipping',
  support_operator: 'support',
  support: 'support',
  accountant: 'accounts',
  accounts: 'accounts',
  viewer: 'viewer'
};

export type Profile = { active?: boolean | null; role?: string | null } | null | undefined;

export function roleOf(profile: Profile): Role | null {
  if (!profile?.active) return null;
  return LEGACY_ROLE_MAP[String(profile.role || '')] ?? null;
}

export function can(profile: Profile, permission: Permission): boolean {
  const role = roleOf(profile);
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
}

type RouteRule = { pattern: RegExp; permission: Permission | 'public' };

// Page routes under /ops. Order matters: the first match wins.
export const ROUTE_PERMISSIONS: RouteRule[] = [
  { pattern: /^\/ops$/, permission: 'orders.view' },
  { pattern: /^\/ops\/orders(\/[^/]+)?$/, permission: 'orders.view' },
  { pattern: /^\/ops\/shipments$/, permission: 'orders.view' },
  { pattern: /^\/ops\/booking$/, permission: 'shipping.book' },
  { pattern: /^\/ops\/pickup$/, permission: 'shipping.pickup' },
  { pattern: /^\/ops\/exceptions$/, permission: 'exceptions.view' },
  { pattern: /^\/ops\/carts$/, permission: 'carts.view' },
  { pattern: /^\/ops\/gst$/, permission: 'gst.view' },
  { pattern: /^\/ops\/automation$/, permission: 'automation.view' },
  { pattern: /^\/ops\/settings$/, permission: 'settings.view' }
];

export function permissionForOpsPath(pathname: string): Permission | 'public' | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return ROUTE_PERMISSIONS.find(rule => rule.pattern.test(clean))?.permission ?? null;
}

export function canAccessOpsPath(profile: Profile, pathname: string): boolean {
  const needed = permissionForOpsPath(pathname);
  if (needed === null) return false;
  if (needed === 'public') return true;
  return can(profile, needed);
}
