import { buildOrderShipmentSummary } from './fulfillment.js';

export function isReturnToSender(status) {
  return /^(rto|returned|return_to_sender)/.test(String(status || '').toLowerCase().replaceAll('-', '_'));
}

// Creation time identifies the shipment leg; tracking update time does not.
export function buildRecoverySummary(order, shipments) {
  const outbound = shipments.filter(s => s.direction !== 'reverse')
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const latestReturn = outbound.find(isReturned);
  const selected = outbound.find(s => s.waybill && !['cancelled', 'canceled', 'failed'].includes(s.status)) || outbound[0];
  if (!selected) return {};
  const summary = buildOrderShipmentSummary(selected);
  summary.courier = selected.courier_code;
  summary.awb_number = selected.waybill || null;
  summary.shipment_label_url = selected.label_url || null;
  summary.shipment_label_format = selected.label_format || null;
  summary.tracking_url = selected.tracking_url || (selected.waybill ? selected.courier_code === 'shiprocket' ? `https://shiprocket.co/tracking/${encodeURIComponent(selected.waybill)}` : `https://www.delhivery.com/track/package/${encodeURIComponent(selected.waybill)}` : null);
  const cancelledOrder = ['cancelled', 'canceled'].includes(String(order.status || '').toLowerCase());
  const paid = ['paid', 'approved', 'partially_refunded'].includes(String(order.payment_status || '').toLowerCase());
  if (latestReturn && isReturned(selected) && paid && !cancelledOrder) {
    summary.internal_status = 'replacement_required';
    summary.fulfillment_status = 'NOT_FULFILLED';
  } else if (latestReturn && !isReturned(selected) && String(selected.created_at) > String(latestReturn.created_at)) {
    summary.internal_status = selected.status === 'delivered' ? 'delivered' : 'shipment_booked';
    if (['booked', 'shipment_booked', 'pickup_pending'].includes(selected.status)) summary.fulfillment_status = 'NOT_FULFILLED';
  }
  return summary;
}

function isReturned(shipment) { return isReturnToSender(shipment.status); }
