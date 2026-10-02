import { currentUserProfile } from '@/lib/current-user';
import { hasPermission, permissionForPath } from '@/lib/access-control';
import { WixAutoSync } from './wix-auto-sync';
import { AppNavigation } from './app-navigation';

const nav = [
  ['/', 'Dashboard', 'Gauge'],
  ['/abandoned-carts', 'Abandoned carts', 'ShoppingCart'],
  ['/print', 'Print labels', 'Printer'],
  ['/orders', 'Orders', 'ClipboardList'],
  ['/packing', 'Packing Queue', 'Boxes'],
  ['/shipments', 'Shipment Booking', 'Truck'],
  ['/pickup', 'Awaiting Pickup', 'PackageCheck'],
  ['/installation', 'Installation', 'Wrench'],
  ['/feedback', 'Feedback', 'MessageCircle'],
  ['/finance', 'Finance', 'Landmark'],
  ['/automation', 'Automation', 'Cog'],
  ['/integration-errors', 'Integration Errors', 'AlertTriangle'],
  ['/changelog', 'Changelog', 'History'],
  ['/settings', 'Settings', 'Settings'],
  ['/admin/users', 'User management', 'Users']
];

export async function AppShell({ children }) {
  const profile = await currentUserProfile();
  return (
    <div className="appShell">
      <WixAutoSync />
      <aside className="sidebar">
        <AppNavigation items={nav.filter(([href]) => {
          const needed = permissionForPath(href);
          return needed === 'admin' ? profile?.active && profile?.role === 'admin' : hasPermission(profile, needed);
        })} />
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
