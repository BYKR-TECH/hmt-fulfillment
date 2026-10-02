'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, ShoppingCart, Boxes, ClipboardList, Cog, Gauge, History, Landmark, Menu, MessageCircle, PackageCheck, Printer, Settings, Truck, Users, Wrench, X } from 'lucide-react';
import { SignOutButton } from './sign-out-button';

const icons = { Gauge, ShoppingCart, Printer, ClipboardList, Boxes, Truck, PackageCheck, Wrench, MessageCircle, Landmark, Cog, AlertTriangle, History, Settings, Users };

export function AppNavigation({ items }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <>
    <div className="sidebarHeader">
      <Link href="/" className="brandBlock" onClick={() => setOpen(false)}>
        <strong>Hold My Throttle</strong><span>Operations CRM</span>
      </Link>
      <button type="button" className="navToggle" aria-expanded={open} aria-controls="crm-navigation" aria-label={open ? 'Close navigation' : 'Open navigation'} onClick={() => setOpen(!open)}>
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
    </div>
    <div id="crm-navigation" className={`sidebarNavigation${open ? ' isOpen' : ''}`}>
      <nav className="navList" aria-label="CRM sections">
        {items.map(([href, label, icon]) => {
          const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
          const Icon = icons[icon];
          return <Link href={href} className={`navItem${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} key={href} onClick={() => setOpen(false)}>
            <Icon size={17} aria-hidden="true" /><span>{label}</span>
          </Link>;
        })}
      </nav>
      <SignOutButton />
    </div>
  </>;
}
