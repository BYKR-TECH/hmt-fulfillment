import './ops.css';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ArrowLeftRight } from 'lucide-react';
import { getOpsProfile } from '@/lib/ops/session.ts';
import { can, roleOf } from '@/lib/ops/permissions.ts';
import { NAV_SECTIONS } from '@/components/ops/nav';
import { GlobalSearch, MobileNav, SidebarNav, SignOut, Toaster } from '@/components/ops/client';
import { initials } from '@/components/ops/ui';

export const metadata = { title: 'Hold My Throttle Ops' };
export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', ops_manager: 'Ops manager', shipping: 'Shipping', support: 'Support', accounts: 'Accounts', viewer: 'Viewer'
};

export default async function OpsLayout({ children }: { children: ReactNode }) {
  const profile = await getOpsProfile();
  const role = roleOf(profile);
  if (!role) notFound();
  const sections = NAV_SECTIONS
    .map(section => ({ ...section, items: section.items.filter(item => can(profile, item.permission)) }))
    .filter(section => section.items.length);
  const mobile = sections.flatMap(section => section.items).filter(item => item.mobile);
  const name = String(profile?.full_name || profile?.name || profile?.email || 'Signed in');

  return (
    <div className="ops">
      <div className="ops-shell">
        <aside className="ops-sidebar">
          <Link href="/ops" className="ops-brand" prefetch={false}>
            <span className="ops-brand-mark">HMT</span>
            <span>
              <strong>Hold My Throttle</strong>
              <span>Operations</span>
            </span>
          </Link>
          <SidebarNav sections={sections} />
          <div className="ops-sidebar-foot">
            <Link href="/" prefetch={false}><ArrowLeftRight size={16} aria-hidden="true" /> Old screens</Link>
            <SignOut />
            <div className="ops-user">
              <span className="ops-avatar">{initials(name)}</span>
              <div>
                <strong>{name}</strong>
                <span>{ROLE_LABEL[role] ?? role}{profile?.local ? ' · local' : ''}</span>
              </div>
            </div>
          </div>
        </aside>
        <div className="ops-main">
          <div className="ops-topbar">
            <Suspense fallback={<div className="ops-search" />}>
              <GlobalSearch />
            </Suspense>
          </div>
          <main className="ops-content">{children}</main>
        </div>
      </div>
      <MobileNav items={mobile} />
      <Toaster />
    </div>
  );
}
