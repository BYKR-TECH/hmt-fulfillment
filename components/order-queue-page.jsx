import { AppShell } from './app-shell';
import { OrderTable } from './order-table';

export function OrderQueuePage({ eyebrow, title, description, orders }) {
  return <AppShell>
    <header className="pageHeader"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div></header>
    <section className="panel"><OrderTable orders={orders} /></section>
  </AppShell>;
}
