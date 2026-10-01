import { AppShell } from '@/components/app-shell';
import Link from 'next/link';
import { ManualOrderForm } from '@/components/manual-order-form';
import { OrderFilters, OrderTable } from '@/components/order-table';
import { listOrdersPage } from '@/lib/crm/data';

export default async function OrdersPage({ searchParams }) {
  const params = await searchParams;
  const query = params?.q || '';
  const status = params?.status || '';
  const source = params?.source || '';
  const result = await listOrdersPage({ query, status, source, page: params?.page || 1, pageSize: 50 });
  const { orders, total, page, pageSize, pageCount } = result;
  const pageHref = target => {
    const search = new URLSearchParams();
    if (query) search.set('q', query);
    if (status) search.set('status', status);
    if (source) search.set('source', source);
    search.set('page', String(target));
    return `/orders?${search.toString()}`;
  };

  return (
    <AppShell>
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Orders</p>
          <h1>Order workbench</h1>
          <p className="muted">Browse every order with customer details, shipping and billing addresses, products, and GST / tax details.</p>
          <Link className="subtle" href="/gst-invoices">View monthly GST invoice export</Link>
        </div>
      </header>

      <section className="panel">
        <OrderFilters query={query} status={status} source={source} />
        <OrderPagination total={total} page={page} pageSize={pageSize} pageCount={pageCount} pageHref={pageHref} position="top" />
        <OrderTable orders={orders} showDetails />
        <OrderPagination total={total} page={page} pageSize={pageSize} pageCount={pageCount} pageHref={pageHref} position="bottom" />
      </section>

      <section className="panel">
        <div className="panelHeader">
          <h2>Create manual order</h2>
        </div>
        <div className="panelBody">
          <ManualOrderForm />
        </div>
      </section>
    </AppShell>
  );
}

function OrderPagination({ total, page, pageSize, pageCount, pageHref, position }) {
  return (
    <nav className="orderPagination" aria-label={`Order pages ${position}`}>
      <span>{total ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} orders` : '0 orders'}</span>
      <div>
        {page > 1 ? <Link className="button secondary" href={pageHref(page - 1)}>Previous</Link> : null}
        <span>Page {page} of {pageCount}</span>
        {page < pageCount ? <Link className="button secondary" href={pageHref(page + 1)}>Next</Link> : null}
      </div>
    </nav>
  );
}
