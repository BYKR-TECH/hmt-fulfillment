import { Fragment } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { formatCurrency } from '@/lib/crm/data';
import { STATUS_FILTERS } from '@/lib/crm/constants';
import { OrderContents } from './order-contents';
import { QuickBookButton } from './quick-book-button';
import { StatusPill } from './status-pill';

export function OrderFilters({ query = '', status = '', source = '', action = '/orders', showStatus = true, showSource = true, hiddenFields = {} }) {
  return (
    <form className={`filters${!showStatus && !showSource ? ' searchOnly' : ''}`} action={action}>
      {Object.entries(hiddenFields).map(([name, value]) => <input type="hidden" name={name} value={value} key={name} />)}
      <label>
        <span>Search</span>
        <div className="searchField">
          <Search size={16} aria-hidden="true" />
          <input name="q" defaultValue={query} placeholder="Name, phone, order, AWB" />
        </div>
      </label>
      {showStatus ? (
      <label>
        <span>Status</span>
        <select name="status" defaultValue={status}>
          <option value="">All statuses</option>
          {STATUS_FILTERS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>
      ) : null}
      {showSource ? (
      <label>
        <span>Source</span>
        <select name="source" defaultValue={source}>
          <option value="">All sources</option>
          <option value="wix">Wix</option>
          <option value="woocommerce">WooCommerce</option>
          <option value="amazon">Amazon</option>
          <option value="manual">Manual</option>
        </select>
      </label>
      ) : null}
      <div className="filterSubmit">
        <button type="submit">Apply</button>
      </div>
    </form>
  );
}

export function OrderTable({ orders, showQuickBook = false, showDetails = false }) {
  return (
    <div className="tableWrap">
      <table className="opsTable orderTable">
        <thead><tr><th>Order</th><th>Customer</th><th>Products / delivery</th><th>Value</th><th>Status / tracking</th>{showQuickBook ? <th>Book</th> : null}</tr></thead>
        <tbody>
          {orders.map(order => <Fragment key={order.id}>
            <tr>
              <td data-label="Order">
                <Link className="tableLink" href={`/orders/${order.id}`}><strong>{order.order_number || order.external_order_id}</strong></Link>
                <span className="subtle">{order.source.toUpperCase()} · {order.order_date ? new Date(order.order_date).toLocaleDateString('en-IN') : 'Date unavailable'}</span>
                <span className="subtle">{order.assigned_operator || 'Unassigned'}{order.tags?.length ? ` · ${order.tags.join(', ')}` : ''}</span>
              </td>
              <td data-label="Customer">
                <strong>{order.customer_name || 'Customer name not provided'}</strong>
                <span className="subtle">{order.phone}</span>
                <span className="subtle">{[order.city, order.state, order.pincode].filter(Boolean).join(', ')}</span>
                <details className="rowDisclosure"><summary>Contact details</summary><span className="subtle">{order.email || 'Email not provided'}</span><span className="subtle">External ID: {order.external_order_id}</span></details>
              </td>
              <td data-label="Products / delivery">
                <OrderContents order={order} compact />
                {order.bike_model ? <span className="subtle">{order.bike_model}</span> : null}
                <span className="subtle">{order.selected_shipping_title || 'Delivery option not provided'}</span>
                {order.shipping_amount ? <span className="subtle">Shipping: {formatCurrency(order.shipping_amount, order.currency)}</span> : null}
              </td>
              <td data-label="Value" className="valueCell">
                <strong>{formatCurrency(order.order_value, order.currency)}</strong>
                <span className="subtle"><StatusPill value={order.payment_status} /></span>
              </td>
              <td data-label="Status / tracking">
                <div className="statusStack"><StatusPill value={order.internal_status} />{order.shipment_status !== order.internal_status ? <StatusPill value={order.shipment_status || 'not_booked'} /> : null}</div>
                <span className="subtle">{order.courier || 'No courier'}{order.awb_number ? ` · ${order.awb_number}` : ' · AWB pending'}</span>
                <div className="tableActions">
                  {order.tracking_url ? <a href={order.tracking_url} target="_blank" rel="noreferrer">Track shipment</a> : null}
                  <Link href={`/orders/${order.id}`}>Manage order</Link>
                </div>
                <details className="rowDisclosure"><summary>Fulfillment & follow-up</summary>
                  <div className="statusStack"><StatusPill value={order.fulfillment_status || 'not_fulfilled'} />{order.wix_fulfillment_status ? <StatusPill value={order.wix_fulfillment_status} /> : null}<StatusPill value={order.installation_status} /><StatusPill value={order.feedback_status} /></div>
                  {order.wix_fulfillment_error ? <span className="subtle dangerText">{order.wix_fulfillment_error}</span> : null}
                </details>
              </td>
              {showQuickBook ? <td data-label="Book"><QuickBookButton order={order} /></td> : null}
            </tr>
            {showDetails ? <OrderDetailsRow order={order} colSpan={showQuickBook ? 6 : 5} /> : null}
          </Fragment>)}
          {!orders.length && <tr><td colSpan={showQuickBook ? 6 : 5} className="empty">
            <strong>No orders to show</strong><p>Try a broader search or clear your filters. New orders will appear here once synced or created.</p>
            <Link className="button secondary" href="/orders">View all orders</Link>
          </td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function OrderAddress({ order, type, title }) {
  const prefix = `${type}_`;
  const line1 = order[`${prefix}address_line1`];
  const line2 = order[`${prefix}address_line2`];
  const locality = [order[`${prefix}city`], order[`${prefix}state`], order[`${prefix}pincode`]].filter(Boolean).join(', ');
  const provided = Boolean(line1 || line2 || locality);
  return (
    <section className="orderAddress">
      <h3>{title}</h3>
      {provided ? <address>
        <strong>{order[`${prefix}name`] || order.customer_name}</strong>
        {order[`${prefix}company`] ? <span>{order[`${prefix}company`]}</span> : null}
        {line1 ? <span>{line1}</span> : null}
        {line2 ? <span>{line2}</span> : null}
        {locality ? <span>{locality}</span> : null}
        {order[`${prefix}country`] ? <span>{order[`${prefix}country`]}</span> : null}
        {order[`${prefix}phone`] ? <span>Phone: {order[`${prefix}phone`]}</span> : null}
      </address> : <p className="muted">{title} address not provided</p>}
    </section>
  );
}

function OrderDetailsRow({ order, colSpan }) {
  const country = order.billing_country || order.shipping_country || order.country;
  const domestic = !country || ['IN', 'IND', 'INDIA'].includes(String(country).toUpperCase());
  const hsnCodes = [...new Set((order.items || []).map(item => item.hsn_code).filter(Boolean))];
  const gstin = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/i.test(order.buyer_gst || '');
  return (
    <tr className="orderDetailsRow">
      <td colSpan={colSpan}>
        <details className="orderFullDetails"><summary>Addresses, amounts & tax details</summary><div className="orderDetailsGrid">
          <OrderAddress order={order} type="shipping" title="Shipping" />
          <OrderAddress order={order} type="billing" title="Billing" />
          <section className="orderTaxDetails">
            <h3>GST / tax details</h3>
            <p>{order.buyer_gst ? <><strong>{gstin ? 'GSTIN' : order.buyer_gst_type || 'Tax ID'}:</strong> {order.buyer_gst}</> : domestic ? 'GSTIN not provided' : 'Tax ID not provided'}</p>
            <p>Tax recorded: <strong>{order.tax_recorded ? formatCurrency(order.tax_amount, order.currency) : 'Not provided'}</strong></p>
            <p>HSN: {hsnCodes.length ? hsnCodes.join(', ') : 'Not provided'}</p>
          </section>
          <section className="orderAmounts">
            <h3>Order amounts</h3>
            <p>Subtotal: {formatCurrency(order.subtotal_amount, order.currency)}</p>
            <p>Discount: {formatCurrency(order.discount_amount, order.currency)}</p>
            <p>Shipping: {formatCurrency(order.shipping_amount, order.currency)}</p>
            <Link href={`/api/crm/orders/${order.id}/invoice`} target="_blank">Open invoice</Link>
            <Link href={`/orders/${order.id}`}>Edit order details</Link>
          </section>
        </div></details>
      </td>
    </tr>
  );
}
