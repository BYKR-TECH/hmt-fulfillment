'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2, LogOut, Search, X } from 'lucide-react';
import { NAV_ICONS } from './icons';
import { isActive, type NavItem } from './nav';
import { pickupWindow } from '@/lib/ops/model.ts';

export function SidebarNav({ sections }: { sections: { label: string; items: NavItem[] }[] }) {
  const pathname = usePathname() || '/ops';
  return (
    <nav className="ops-nav" aria-label="Ops sections">
      {sections.map(section => (
        <div key={section.label}>
          <div className="ops-nav-label">{section.label}</div>
          {section.items.map(item => {
            const Icon = NAV_ICONS[item.icon];
            return (
              <Link key={item.href} href={item.href} prefetch={false} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>
                {Icon ? <Icon size={16} strokeWidth={2} aria-hidden="true" /> : null}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() || '/ops';
  return (
    <nav className="ops-mobile-nav" aria-label="Ops sections">
      {items.slice(0, 5).map(item => {
        const Icon = NAV_ICONS[item.icon];
        return (
          <Link key={item.href} href={item.href} prefetch={false} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>
            {Icon ? <Icon size={19} aria-hidden="true" /> : null}
            <span>{item.label.split(' ')[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const input = useRef<HTMLInputElement>(null);
  const initial = pathname === '/ops/orders' ? params.get('q') ?? '' : '';

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((event.key === '/' && !typing) || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get('q') || '').trim();
    router.push(q ? `/ops/orders?q=${encodeURIComponent(q)}` : '/ops/orders');
  }

  return (
    <form className="ops-search" role="search" onSubmit={submit}>
      <Search size={15} aria-hidden="true" />
      <input ref={input} name="q" defaultValue={initial} key={initial} placeholder="Search order no, name, phone or AWB   ( / )" aria-label="Search orders" autoComplete="off" />
    </form>
  );
}

export function SignOut() {
  async function signOut() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) await createBrowserClient(url, key).auth.signOut();
    window.location.href = '/login';
  }
  return (
    <button type="button" className="ops-linkish btn ghost" onClick={signOut} style={{ justifyContent: 'flex-start', height: 'auto' }}>
      <LogOut size={16} aria-hidden="true" />
      <span>Sign out</span>
    </button>
  );
}

// ---------- Toast ----------

type ToastState = { text: string; bad?: boolean } | null;
let pushToast: ((toast: ToastState) => void) | null = null;

export function Toaster() {
  const [toast, setToast] = useState<ToastState>(null);
  useEffect(() => {
    pushToast = value => setToast(value);
    return () => { pushToast = null; };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.bad ? 9000 : 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  if (!toast) return null;
  return <div className={`ops-toast${toast.bad ? ' bad' : ''}`} role="status">{toast.text}</div>;
}

export function toast(text: string, bad = false) {
  pushToast?.({ text, bad });
}

// ---------- Actions ----------

type ActionResult = { ok?: boolean; error?: string; message?: string; validation?: string[]; awb_number?: string };

export async function callAction(url: string, body?: unknown): Promise<{ ok: boolean; message: string; result: ActionResult }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = (await response.json().catch(() => ({}))) as ActionResult;
  const ok = response.ok && result.ok !== false;
  const message = ok
    ? result.message || (result.awb_number ? `Booked · AWB ${result.awb_number}` : 'Done')
    : (result.validation?.length ? result.validation.join(' · ') : result.error || result.message || `Request failed (${response.status})`);
  return { ok, message, result };
}

/** A button that POSTs once, stays disabled until the server answers, then refreshes the page. */
export function ActionButton({ url, body, children, confirm, variant = '', size = '', done }: {
  url: string; body?: unknown; children: ReactNode; confirm?: string; variant?: '' | 'primary' | 'danger' | 'ghost'; size?: '' | 'sm'; done?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    if (busy) return;
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    try {
      const { ok, message } = await callAction(url, body);
      toast(ok ? done || message : message, !ok);
      if (ok) router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not reach the server.', true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className={`btn ${variant} ${size}`} onClick={run} disabled={busy} aria-busy={busy}>
      {busy ? <Loader2 size={14} className="spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

// ---------- Book dialog ----------

export type BookableOrder = {
  id: string; number: string; customer: string; phone: string; address1: string; postalCode: string; country: string;
  total: number | null; lane: string; review: { reason: string }[];
};

export type BookingDefaults = {
  pickupLocations: string[]; pickupLocation: string; weightGrams: number; lengthCm: number; widthCm: number; heightCm: number;
};

export function BookButton({ order, defaults, size = 'sm', variant = 'primary' }: { order: BookableOrder; defaults: BookingDefaults; size?: '' | 'sm'; variant?: '' | 'primary' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn ${variant} ${size}`} onClick={() => setOpen(true)}>Book</button>
      {open ? <BookDialog order={order} defaults={defaults} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const SERVICES: Record<string, { courier: string; service: string; label: string }[]> = {
  domestic: [
    { courier: 'delhivery', service: 'express', label: 'Delhivery Express' },
    { courier: 'delhivery', service: 'surface', label: 'Delhivery Surface' }
  ],
  intl_standard: [
    { courier: 'delhivery', service: 'dlv_premium', label: 'Delhivery International Premium' },
    { courier: 'fedex', service: 'international_express', label: 'FedEx International' }
  ],
  intl_express: [
    { courier: 'fedex', service: 'international_express', label: 'FedEx International' },
    { courier: 'delhivery', service: 'dlv_premium', label: 'Delhivery International Premium' }
  ]
};

function BookDialog({ order, defaults, onClose }: { order: BookableOrder; defaults: BookingDefaults; onClose: () => void }) {
  const router = useRouter();
  const options = SERVICES[order.lane] ?? SERVICES.domestic!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    const choice = options[Number(form.service_index)] ?? options[0]!;
    setBusy(true);
    setError('');
    try {
      const { ok, message } = await callAction(`/api/crm/orders/${order.id}/shipment`, {
        booking_action: 'book_courier',
        courier: choice.courier,
        service_code: choice.service,
        shipment_type: 'original',
        pickup_location: form.pickup_location,
        phone: order.phone,
        pincode: order.postalCode,
        country: order.country || 'IN',
        address_line1: order.address1,
        product_value: order.total ?? '',
        weight_grams: Number(form.weight_grams),
        length_cm: Number(form.length_cm),
        width_cm: Number(form.width_cm),
        height_cm: Number(form.height_cm),
        payment_mode: 'Prepaid'
      });
      if (!ok) {
        setError(message);
        return;
      }
      toast(`#${order.number} — ${message}`);
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="ops-dialog" onClose={onClose} onCancel={event => { if (busy) event.preventDefault(); }}>
      <form onSubmit={submit}>
        <header>
          <div>
            <h2>Book #{order.number}</h2>
            <p className="muted">{order.customer} · {order.postalCode || 'no PIN'} {order.country && order.country !== 'IN' ? `· ${order.country}` : ''}</p>
          </div>
          <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy} aria-label="Close"><X size={16} /></button>
        </header>
        {order.review.length ? (
          <div className="ops-notice warn" style={{ margin: '0 20px' }}>
            <div>{order.review.map(r => <div key={r.reason}>{r.reason}</div>)}</div>
          </div>
        ) : null}
        <div className="ops-dialog-body">
          <label className="stack">Courier and service
            <select name="service_index" className="field" defaultValue="0">
              {options.map((option, index) => <option key={option.label} value={index}>{option.label}</option>)}
            </select>
          </label>
          <label className="stack">Pickup location
            <select name="pickup_location" className="field" defaultValue={defaults.pickupLocation}>
              {defaults.pickupLocations.map(location => <option key={location}>{location}</option>)}
            </select>
          </label>
          <div className="ops-dialog-row">
            <label className="stack">Weight (g)<input className="field" name="weight_grams" type="number" min="1" defaultValue={defaults.weightGrams} required /></label>
            <label className="stack">L (cm)<input className="field" name="length_cm" type="number" min="1" defaultValue={defaults.lengthCm} required /></label>
            <label className="stack">W (cm)<input className="field" name="width_cm" type="number" min="1" defaultValue={defaults.widthCm} required /></label>
            <label className="stack">H (cm)<input className="field" name="height_cm" type="number" min="1" defaultValue={defaults.heightCm} required /></label>
          </div>
          {error ? <div className="ops-notice bad"><div>{error}</div></div> : null}
        </div>
        <footer>
          <span className="muted" style={{ fontSize: 12.5 }}>Booking creates the AWB only. The order is marked Shipped in Woo at pickup.</span>
          <div className="ops-actions">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy} aria-busy={busy}>
              {busy ? <Loader2 size={14} className="spin" aria-hidden="true" /> : null}
              {busy ? 'Booking…' : 'Book shipment'}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

/** Pickup request for one location (Delhivery). Date/time default to today before 16:00 IST, else tomorrow 11:00. */
export function RequestPickupButton({ location, count }: { location: string; count: number }) {
  const { date, time } = pickupWindow();
  return (
    <ActionButton url="/api/crm/pickups" body={{ pickup_location: location, pickup_date: date, pickup_time: time, expected_package_count: count }} variant="primary" size="sm" done={`Pickup requested for ${location} on ${date}`}>
      Request pickup · {count}
    </ActionButton>
  );
}
