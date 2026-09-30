import Link from 'next/link';
import {
  AlertTriangle,
  ShoppingCart,
  Boxes,
  ClipboardList,
  Cog,
  Gauge,
  History,
  Landmark,
  LogOut,
  MessageCircle,
  PackageCheck,
  Printer,
  Settings,
  Truck,
  Users,
  Wrench
} from 'lucide-react';
import { currentUserProfile } from '@/lib/current-user';
import { hasPermission, permissionForPath } from '@/lib/access-control';
import { WixAutoSync } from './wix-auto-sync';
import { SignOutButton } from './sign-out-button';

const nav = [
  ['/', 'Dashboard', Gauge],
  ['/abandoned-carts', 'Abandoned carts', ShoppingCart],
  ['/print', 'Print labels', Printer],
  ['/orders', 'Orders', ClipboardList],
  ['/packing', 'Packing Queue', Boxes],
  ['/shipments', 'Shipment Booking', Truck],
  ['/pickup', 'Awaiting Pickup', PackageCheck],
  ['/installation', 'Installation', Wrench],
  ['/feedback', 'Feedback', MessageCircle],
  ['/finance', 'Finance', Landmark],
  ['/automation', 'Automation', Cog],
  ['/integration-errors', 'Integration Errors', AlertTriangle],
  ['/changelog', 'Changelog', History],
  ['/settings', 'Settings', Settings]
  ,['/admin/users', 'User management', Users]
];

export async function AppShell({ children }) {
  const profile = await currentUserProfile();
  return (
    <div className="appShell">
      <WixAutoSync />
      <aside className="sidebar">
        <div className="brandBlock">
          <strong>Hold My Throttle</strong>
          <span>Operations CRM</span>
        </div>
        <nav className="navList" aria-label="CRM sections">
          {nav.filter(([href]) => { const needed = permissionForPath(href); return needed === 'admin' ? profile?.active && profile?.role === 'admin' : hasPermission(profile, needed); }).map(([href, label, Icon]) => (
            <Link href={href} className="navItem" key={href}>
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <SignOutButton />
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
