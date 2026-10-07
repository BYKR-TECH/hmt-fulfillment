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
    <form className="filters" action={action}>
      {Object.entries(hiddenFields).map(([name, value]) => <input type="hidden" name={name} value={value} key={name} />)}
      <label>
        <span>Search</span>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ left: 10, position: 'absolute', top: 11, color: '#667085' }} />
          <input name="q" defaultValue={query} placeholder="Name, phone, order, AWB" style={{ paddingLeft: 32 }} />
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
      <label>
        <span>&nbsp;</span>
        <button type="submit">Apply</button>
      </label>
    </form>
  );
}

export function OrderTable({ orders, showQuickBook = false, showDetails = false }) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Product</th>
            <th>Delivery option</th>
            <th>Value</th>
            <th>Fulfillment</th>
            <th>Status</th>
            <th>Tracking</th>
            <th>Operator</th>
            {showQuickBook ? <th>Quick book</th> : null}
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <Fragment key={order.id}>
            <tr>
              <td>
                <Link href={`/orders/${order.id}`}><strong>{order.order_number || order.external_order_id}</strong></Link>
                <span className="subtle">{order.source.toUpperCase()} · {order.external_order_id}</span>
                <span className="subtle">{order.order_date ? new Date(order.order_date).toLocaleDateString('en-IN') : ''}</span>
              </td>
              <td>
                <strong>{order.customer_name || 'Customer name not provided'}</strong>
                <span className="subtle">{order.phone}</span>
                <span className="subtle">{order.email}</span>
                <span className="subtle">{[order.city, order.state, order.pincode].filter(Boolean).join(', ')}</span>
              </td>
              <td>
                <OrderContents order={order} compact />
                {order.bike_model ? <span className="subtle">{order.bike_model}</span> : null}
              </td>
              <td>
                <strong>{order.selected_shipping_title || 'Not provided'}</strong>
                {order.shipping_amount ? <span className="subtle">Shipping: {formatCurrency(order.shipping_amount, order.currency)}</span> : null}
              </td>
              <td>
                {formatCurrency(order.order_value, order.currency)}
                <span className="subtle"><StatusPill value={order.payment_status} /></span>
              </td>
              <td>
                <div className="statusStack">
                  <StatusPill value={order.fulfillment_status || 'not_fulfilled'} />
                  {order.wix_fulfillment_status ? <StatusPill value={order.wix_fulfillment_status} /> : null}
                </div>
                {order.wix_fulfillment_error ? <span className="subtle dangerText">{order.wix_fulfillment_error}</span> : null}
              </td>
              <td>
                <div className="statusStack">
                  <StatusPill value={order.internal_status} />
                  <StatusPill value={order.installation_status} />
                  <StatusPill value={order.feedback_status} />
                </div>
              </td>
              <td>
                <div className="statusStack">
                  <StatusPill value={order.shipment_status || 'not_booked'} />
                  <span className="subtle">{order.courier ? `Courier: ${order.courier}` : 'No courier'}</span>
                  <span className="subtle">{order.awb_number ? `AWB: ${order.awb_number}` : 'No AWB'}</span>
                  {order.tracking_url
                    ? <a className="subtle" href={order.tracking_url} target="_blank" rel="noreferrer">Open live tracking</a>
                    : <span className="subtle">Tracking link unavailable</span>}
                  <Link className="subtle" href={`/orders/${order.id}`}>Manage shipment</Link>
                </div>
              </td>
              <td>
                {order.assigned_operator || '-'}
                <span className="subtle">{(order.tags || []).join(', ')}</span>
              </td>
              {showQuickBook ? <td><QuickBookButton order={order} /></td> : null}
            </tr>
            {showDetails ? <OrderDetailsRow order={order} colSpan={showQuickBook ? 10 : 9} /> : null}
            </Fragment>
          ))}
          {!orders.length && (
            <tr>
              <td colSpan={showQuickBook ? 10 : 9} className="empty">No matching orders.</td>
            </tr>
          )}
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
        <details className="orderDetailsDropdown">
          <summary>Shipping, billing &amp; tax details</summary>
          <div className="orderDetailsGrid">
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
          </div>
        </details>
      </td>
    </tr>
  );
}
