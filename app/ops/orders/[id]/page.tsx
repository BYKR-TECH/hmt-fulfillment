import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ChevronLeft, ExternalLink, FileDown, FileText, Mail, MessageCircle, Phone } from 'lucide-react';
import { allowed } from '@/lib/ops/guard.ts';
import { can } from '@/lib/ops/permissions.ts';
import { getOrderDetail, type OpsShipment, type ShipmentEvent } from '@/lib/ops/data.ts';
import { bookingDefaults } from '@/lib/ops/booking-defaults.ts';
import {
  formatDate, formatMoney, HAPPY_PATH, LANE_LABEL, normalizeKey, pickupWindow, relativeAge, STAGE_META, trackingLink
} from '@/lib/ops/model.ts';
import { Badge, Card, Empty, NoAccess, PageHead, ShipmentBadge, StageBadge } from '@/components/ops/ui';
import { ActionButton, BookButton } from '@/components/ops/client';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await allowed('orders.view');
  if (!profile) return <NoAccess />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [detail, defaults] = await Promise.all([getOrderDetail(id), bookingDefaults()]);
  if (!detail) notFound();
  const { order, raw, events, notes, messages, attempts, errors } = detail;
  const stageIndex = HAPPY_PATH.indexOf(order.stage);
  const offPath = stageIndex === -1;
  const canBook = can(profile, 'shipping.book') && (order.stage === 'paid' || order.stage === 'on_hold');
  const wooBase = (process.env.WOO_BASE_URL || '').replace(/\/$/, '');
  const wooId = (raw as { woo_order_id?: string | null }).woo_order_id;
  const money = raw as { subtotal?: number | null; shipping_amount?: number | null; tax_amount?: number | null; discount_amount?: number | null };
  const fullShipping = (raw as { full_shipping?: Address | null }).full_shipping ?? null;
  const items = ((raw as { line_items?: Item[] }).line_items ?? []);
  const eventsByShipment = new Map<string, ShipmentEvent[]>();
  for (const event of events) eventsByShipment.set(event.shipment_id, [...(eventsByShipment.get(event.shipment_id) ?? []), event]);
  const phoneDigits = order.phone.replace(/\D/g, '');
  const waNumber = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;

  return (
    <>
      <PageHead
        eyebrow={<><Link href="/ops/orders" prefetch={false}><ChevronLeft size={13} style={{ verticalAlign: '-2px' }} /> Orders</Link></>}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>#{order.number} <StageBadge stage={order.stage} /></span>}
        sub={`${order.customer} · placed ${formatDate(order.placedAt, true)} · ${order.source === 'woocommerce' ? 'WooCommerce' : order.source} · ${LANE_LABEL[order.lane]}`}
        actions={
          <>
            {wooBase && wooId ? <a className="btn" href={`${wooBase}/wp-admin/post.php?post=${encodeURIComponent(wooId)}&action=edit`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open in Woo</a> : null}
            <Link className="btn" href={`/orders/${order.id}`} prefetch={false} title="Edit, manual AWB and other actions still live on the old order screen">Edit (old screen)</Link>
            {canBook ? <BookButton order={{ id: order.id, number: order.number, customer: order.customer, phone: order.phone, address1: order.address1, postalCode: order.postalCode, country: order.country, total: order.total, lane: order.lane, review: order.review }} defaults={defaults} size="" /> : null}
          </>
        }
      />

      <div className="ops-card" style={{ padding: '16px 18px' }}>
        <div className="ops-progress" style={{ gridTemplateColumns: `repeat(${HAPPY_PATH.length}, minmax(0, 1fr))` }}>
          {HAPPY_PATH.map((stage, index) => (
            <div key={stage} className={`step${!offPath && index < stageIndex ? ' done' : ''}${!offPath && index === stageIndex ? (stage === 'delivered' ? ' done' : ' now') : ''}`}>
              <div className="bar" />
              <span>{STAGE_META[stage].label}</span>
            </div>
          ))}
        </div>
        {offPath ? <p style={{ marginTop: 10, fontSize: 13 }}><StageBadge stage={order.stage} /> <span className="muted">This order is off the normal path.</span></p> : null}
      </div>

      {order.review.length ? (
        <div className="ops-notice warn">
          <AlertTriangle size={16} />
          <div>{order.review.map(flag => <div key={flag.reason}>{flag.reason}</div>)}</div>
        </div>
      ) : null}
      {errors.length ? (
        <div className="ops-notice bad">
          <AlertTriangle size={16} />
          <div>{errors.slice(0, 3).map(error => <div key={error.id}><strong>{error.integration} · {error.operation}:</strong> {error.message}</div>)}</div>
        </div>
      ) : null}

      <div className="ops-grid two">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {order.shipments.length ? order.shipments
            .slice()
            .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
            .map(shipment => <ShipmentCard key={shipment.id} orderId={order.id} orderNumber={order.number} shipment={shipment} events={eventsByShipment.get(shipment.id) ?? []} canAct={can(profile, 'shipping.pickup')} canCancel={can(profile, 'shipping.cancel')} canMessage={can(profile, 'messages.send')} />)
            : (
              <Card title="Shipment">
                <Empty title="Not booked yet">{order.stage === 'paid' ? 'Book it from here or from the booking queue.' : 'Only paid orders can be booked.'}</Empty>
              </Card>
            )}

          <Card title="Items" flush>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead><tr><th>Item</th><th className="ops-hide-mobile">SKU</th><th className="right">Qty</th><th className="right">Total</th></tr></thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={`${item.sku}-${index}`}>
                      <td>{item.product_name || 'Item'}{item.hsn_code ? <span className="sub">HSN {item.hsn_code}</span> : null}</td>
                      <td className="ops-hide-mobile mono">{item.sku || '—'}</td>
                      <td className="right num">{Number(item.quantity) || 1}</td>
                      <td className="right num">{formatMoney(item.total_price ?? item.item_price, order.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
              <dl className="ops-dl" style={{ gridTemplateColumns: '1fr auto', maxWidth: 320, marginLeft: 'auto' }}>
                {money.subtotal != null ? <><dt>Subtotal</dt><dd className="num" style={{ textAlign: 'right' }}>{formatMoney(money.subtotal, order.currency)}</dd></> : null}
                {Number(money.discount_amount) ? <><dt>Discount</dt><dd className="num" style={{ textAlign: 'right' }}>−{formatMoney(money.discount_amount, order.currency)}</dd></> : null}
                {money.shipping_amount != null ? <><dt>Shipping</dt><dd className="num" style={{ textAlign: 'right' }}>{formatMoney(money.shipping_amount, order.currency)}</dd></> : null}
                {Number(money.tax_amount) ? <><dt>Tax (incl.)</dt><dd className="num" style={{ textAlign: 'right' }}>{formatMoney(money.tax_amount, order.currency)}</dd></> : null}
                <dt style={{ fontWeight: 650, color: 'var(--ink)' }}>Total</dt><dd className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(order.total, order.currency)}</dd>
              </dl>
            </div>
          </Card>

          <Card title="History" hint="Notes, automation and messages, newest first" flush>
            {notes.length || attempts.length ? (
              <ul className="ops-list">
                {[
                  ...notes.map(note => ({ key: `n${note.id}`, at: note.created_at, title: note.actor_name || (note.note_type === 'automation' ? 'Automation' : 'Note'), body: note.body, tone: note.note_type === 'automation' ? 'info' : 'neutral' })),
                  ...attempts.map(attempt => ({ key: `a${attempt.id}`, at: attempt.updated_at, title: attempt.action_type.replace(/[-_]+/g, ' '), body: `${attempt.status}${attempt.attempts > 1 ? ` after ${attempt.attempts} tries` : ''}${attempt.last_error ? ` — ${attempt.last_error}` : ''}`, tone: attempt.status === 'failed' ? 'bad' : attempt.status === 'success' ? 'ok' : 'neutral' }))
                ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 40).map(entry => (
                  <li key={entry.key} style={{ alignItems: 'flex-start' }}>
                    <div className="grow">
                      <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{entry.title}</div>
                      <div style={{ fontSize: 13, color: entry.tone === 'bad' ? 'var(--tone-bad-fg)' : 'var(--ink-2)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{entry.body}</div>
                    </div>
                    <span className="faint nowrap" style={{ fontSize: 12 }} title={formatDate(entry.at, true)}>{relativeAge(entry.at)}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty title="No history yet" />}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title="Customer">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontWeight: 650, fontSize: 15 }}>{order.customer}</div>
              <div className="ops-actions">
                {order.phone ? <a className="btn sm" href={`tel:${order.phone}`}><Phone size={13} /> {order.phone}</a> : <Badge tone="bad">No phone</Badge>}
                {waNumber ? <a className="btn sm" href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer"><MessageCircle size={13} /> WhatsApp</a> : null}
                {order.email ? <a className="btn sm ghost" href={`mailto:${order.email}`}><Mail size={13} /> Email</a> : null}
              </div>
              <address style={{ fontStyle: 'normal', color: 'var(--ink-2)', lineHeight: 1.55 }}>
                {fullShipping ? (
                  <>
                    {fullShipping.address_line1}{fullShipping.address_line2 ? <>, {fullShipping.address_line2}</> : null}<br />
                    {[fullShipping.city, fullShipping.state].filter(Boolean).join(', ')} {fullShipping.postal_code}<br />
                    {fullShipping.country}
                  </>
                ) : <span className="faint">No shipping address</span>}
              </address>
            </div>
          </Card>

          <Card title="Payment">
            <dl className="ops-dl">
              <dt>Status</dt><dd><Badge tone={['paid', 'approved'].includes(normalizeKey(order.paymentStatus)) ? 'ok' : 'warn'}>{order.paymentStatus || 'unknown'}</Badge></dd>
              <dt>Method</dt><dd>{(raw as { payment_method?: string }).payment_method || '—'}</dd>
              <dt>Shipping</dt><dd>{order.shippingMethod || '—'}</dd>
              <dt>Total</dt><dd className="num" style={{ fontWeight: 650 }}>{formatMoney(order.total, order.currency)}</dd>
            </dl>
            {order.shipment ? (
              <div className="ops-actions" style={{ marginTop: 14 }}>
                <a className="btn sm" href={`/api/crm/orders/${order.id}/invoice`} target="_blank" rel="noreferrer"><FileText size={13} /> Invoice</a>
              </div>
            ) : null}
          </Card>

          <Card title="Customer messages" hint="WhatsApp via Chatwoot" flush>
            {messages.length ? (
              <ul className="ops-list">
                {messages.map(message => (
                  <li key={message.id}>
                    <div className="grow">
                      <div className="title" style={{ whiteSpace: 'normal' }}>{message.label}</div>
                      {message.error ? <div className="sub" style={{ color: 'var(--tone-bad-fg)', whiteSpace: 'normal' }}>{message.error}</div> : null}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <Badge tone={message.status === 'sent' ? 'ok' : message.status === 'failed' ? 'bad' : message.status === 'skipped' ? 'neutral' : 'info'}>{message.status}</Badge>
                      <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{relativeAge(message.at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty title="No messages sent" />}
          </Card>
        </div>
      </div>
    </>
  );
}

type Address = { name?: string | null; phone?: string | null; address_line1?: string | null; address_line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null };
type Item = { product_name?: string | null; quantity?: number | string | null; sku?: string | null; item_price?: number | null; total_price?: number | null; hsn_code?: string | null };

const PRE_PICKUP = new Set(['booked', 'pickup_requested', 'not_picked']);

function ShipmentCard({ orderId, orderNumber, shipment, events, canAct, canCancel, canMessage }: {
  orderId: string; orderNumber: string; shipment: OpsShipment; events: ShipmentEvent[]; canAct: boolean; canCancel: boolean; canMessage: boolean;
}) {
  const link = shipment.waybill ? trackingLink(shipment.waybill) : null;
  const prePickup = PRE_PICKUP.has(shipment.state);
  const service = shipment.service_mode || shipment.courier_service_code || '';
  const base = `/api/crm/orders/${orderId}/shipments/${shipment.id}`;
  return (
    <Card
      title={<><span style={{ textTransform: 'capitalize' }}>{shipment.courier_code || 'Courier'}</span>{service ? <span className="tag">{service}</span> : null}{shipment.direction === 'reverse' ? <span className="tag">Return</span> : null} <ShipmentBadge state={shipment.state} /></>}
      hint={shipment.inferred ? 'Marked shipped in the store; no courier scans were recorded.' : `Booked ${formatDate(shipment.created_at, true)}${shipment.pickup_location ? ` · from ${shipment.pickup_location}` : ''}`}
      actions={shipment.waybill ? <span className="mono" style={{ fontWeight: 600 }}>{shipment.waybill}</span> : null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="ops-actions">
          {link ? <a className="btn sm" href={link} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Tracking page</a> : null}
          {shipment.waybill ? <a className="btn sm" href={`/api/crm/shipments/${shipment.id}/label-file`} target="_blank" rel="noreferrer"><FileDown size={13} /> Label</a> : null}
          {canAct && prePickup && shipment.courier_code === 'delhivery' && shipment.state === 'booked' && shipment.pickup_location
            ? <ActionButton url={`${base}/pickup`} size="sm" body={{ pickup_location: shipment.pickup_location, expected_package_count: 1, pickup_date: pickupWindow().date, pickup_time: pickupWindow().time }} done="Pickup requested">Request pickup</ActionButton> : null}
          {canAct && prePickup
            ? <ActionButton url={`${base}/mark-picked-up`} size="sm" confirm={`Mark #${orderNumber} picked up? The store order becomes Shipped and the customer gets the tracking message.`} done="Marked picked up">Mark picked up</ActionButton> : null}
          {canMessage && !prePickup && ['picked_up', 'in_transit', 'out_for_delivery'].includes(shipment.state)
            ? <ActionButton url={`${base}/send-shipment-confirmation`} size="sm" variant="ghost" confirm="Send the shipment confirmation WhatsApp again? It is skipped if it was already sent." done="Shipment message requested">Resend tracking message</ActionButton> : null}
          {canCancel && prePickup
            ? <ActionButton url={`${base}/cancel`} size="sm" variant="danger" confirm={`Cancel AWB ${shipment.waybill} with the courier? The order goes back to the booking queue.`} done="Shipment cancelled">Cancel shipment</ActionButton> : null}
        </div>
        {events.length ? (
          <ol className="ops-timeline">
            {events.slice(0, 12).map((event, index) => (
              <li key={event.id} className={index === 0 ? (shipment.state === 'delivered' ? 'done' : 'now') : 'done'}>
                <span className="pin" />
                <div className="what">{event.event_status || event.normalized_status || 'Scan'}</div>
                <div className="when">{formatDate(event.occurred_at, true)}{event.carrier_location ? ` · ${event.carrier_location}` : ''}</div>
                {event.message && event.message !== event.event_status ? <div className="detail">{event.message}</div> : null}
              </li>
            ))}
          </ol>
        ) : <p className="muted" style={{ fontSize: 13 }}>{shipment.waybill ? 'No courier scans yet. Tracking is checked every 15 minutes.' : 'No AWB on this shipment.'}</p>}
      </div>
    </Card>
  );
}
