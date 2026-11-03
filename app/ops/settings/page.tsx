import Link from 'next/link';
import { allowed } from '@/lib/ops/guard.ts';
import { ROLE_PERMISSIONS, type Role } from '@/lib/ops/permissions.ts';
import { Card, NoAccess, PageHead } from '@/components/ops/ui';

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', ops_manager: 'Ops manager', shipping: 'Shipping', support: 'Support', accounts: 'Accounts', viewer: 'Viewer' };

export default async function SettingsPage() {
  if (!(await allowed('settings.view'))) return <NoAccess />;
  return (
    <>
      <PageHead eyebrow="System" title="Settings" sub="Lane, pickup, catalog and message settings move here with the booking and messaging modules." />
      <div className="ops-grid halves">
        <Card title="Still on the old screens">
          <div className="ops-actions">
            <Link className="btn" href="/settings" prefetch={false}>CRM & auto-booking settings</Link>
            <Link className="btn" href="/admin/users" prefetch={false}>Users</Link>
            <Link className="btn" href="/integration-errors" prefetch={false}>Integration errors</Link>
          </div>
        </Card>
        <Card title="Roles in the new Ops" hint="Deny by default: anything not listed is refused." flush>
          <ul className="ops-list">
            {(Object.keys(ROLE_PERMISSIONS) as Role[]).map(role => (
              <li key={role} style={{ alignItems: 'flex-start' }}>
                <div style={{ width: 110, fontWeight: 650 }}>{ROLE_LABEL[role]}</div>
                <div className="grow" style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {role === 'admin' ? <span className="tag">Everything</span> : ROLE_PERMISSIONS[role].map(permission => <span key={permission} className="tag">{permission}</span>)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
