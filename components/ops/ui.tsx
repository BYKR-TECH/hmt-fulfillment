import Link from 'next/link';
import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { SHIPMENT_META, STAGE_META, type OrderStage, type ShipmentState, type Tone } from '@/lib/ops/model.ts';

export function Badge({ tone = 'neutral', children, plain = false }: { tone?: Tone; children: ReactNode; plain?: boolean }) {
  return <span className={`badge ${tone === 'neutral' ? '' : tone}${plain ? ' plain' : ''}`}>{children}</span>;
}

export function StageBadge({ stage }: { stage: OrderStage }) {
  const meta = STAGE_META[stage];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function ShipmentBadge({ state }: { state: ShipmentState }) {
  const meta = SHIPMENT_META[state];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ops-page-head">
      <div>
        {eyebrow ? <div className="ops-eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {actions ? <div className="ops-actions">{actions}</div> : null}
    </header>
  );
}

export function Card({ title, hint, actions, children, flush = false, id }: { title?: ReactNode; hint?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; id?: string }) {
  return (
    <section className="ops-card" id={id}>
      {title || actions ? (
        <div className="ops-card-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {hint ? <div className="hint">{hint}</div> : null}
          </div>
          {actions ? <div className="ops-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={`ops-card-body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, foot, href, tone, emphasis }: { label: ReactNode; value: ReactNode; foot?: ReactNode; href?: string; tone?: Tone; emphasis?: 'attention' | 'alarm' }) {
  const body = (
    <>
      <span className="label">
        {tone ? <span className="dot" style={{ color: `var(--tone-${tone}-fg)` }} /> : null}
        {label}
      </span>
      <span className="value">{value}</span>
      {foot ? <span className="foot">{foot}</span> : null}
    </>
  );
  const className = `ops-stat${emphasis ? ` ${emphasis}` : ''}`;
  return href ? <Link href={href} className={className}>{body}</Link> : <div className={className}>{body}</div>;
}

export function Empty({ title, children, icon }: { title: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="ops-empty">
      <div className="icon">{icon ?? <Inbox size={20} />}</div>
      <strong>{title}</strong>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export function Tabs({ items }: { items: { href: string; label: ReactNode; count?: number; active: boolean }[] }) {
  return (
    <nav className="ops-tabs" aria-label="Filter">
      {items.map(item => (
        <Link key={item.href} href={item.href} aria-current={item.active ? 'true' : undefined} prefetch={false}>
          {item.label}
          {item.count !== undefined ? <span className="count">{item.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function Notice({ tone = 'info', icon, children }: { tone?: 'info' | 'warn' | 'bad'; icon?: ReactNode; children: ReactNode }) {
  return <div className={`ops-notice ${tone}`}>{icon}{<div>{children}</div>}</div>;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';
}

export function NoAccess() {
  return (
    <section className="ops-card">
      <div className="ops-empty">
        <strong>You don’t have access to this page</strong>
        <div>Ask Sai to change your role if you need it.</div>
      </div>
    </section>
  );
}
