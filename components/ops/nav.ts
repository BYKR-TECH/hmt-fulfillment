import type { Permission } from '@/lib/ops/permissions.ts';

export type NavItem = { href: string; label: string; icon: string; permission: Permission; mobile?: boolean };

// One list drives the sidebar, the mobile bar and the permission filter.
export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Work',
    items: [
      { href: '/ops', label: 'Today', icon: 'home', permission: 'orders.view', mobile: true },
      { href: '/ops/booking', label: 'Booking queue', icon: 'package-plus', permission: 'shipping.book', mobile: true },
      { href: '/ops/pickup', label: 'Pickup', icon: 'truck', permission: 'shipping.pickup', mobile: true },
      { href: '/ops/exceptions', label: 'Exceptions', icon: 'alert', permission: 'exceptions.view', mobile: true }
    ]
  },
  {
    label: 'Records',
    items: [
      { href: '/ops/orders', label: 'Orders', icon: 'list', permission: 'orders.view', mobile: true },
      { href: '/ops/shipments', label: 'Shipments', icon: 'route', permission: 'orders.view' },
      { href: '/ops/carts', label: 'Abandoned carts', icon: 'cart', permission: 'carts.view' },
      { href: '/ops/gst', label: 'GST report', icon: 'receipt', permission: 'gst.view' }
    ]
  },
  {
    label: 'System',
    items: [
      { href: '/ops/automation', label: 'Automation', icon: 'bolt', permission: 'automation.view' },
      { href: '/ops/settings', label: 'Settings', icon: 'settings', permission: 'settings.view' }
    ]
  }
];

export function isActive(pathname: string, href: string): boolean {
  if (href === '/ops') return pathname === '/ops';
  return pathname === href || pathname.startsWith(`${href}/`);
}
