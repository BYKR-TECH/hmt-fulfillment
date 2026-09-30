// Carrier cancellation changes the shipment lifecycle, not the source order.
export function orderStatusAfterShipmentCancellation(order = {}, shipment = {}) {
  if (['cancelled', 'canceled'].includes(String(order.status || '').toLowerCase())) return 'cancelled';
  if (shipment.direction === 'reverse') return order.internal_status;
  if (!['paid', 'approved'].includes(String(order.payment_status || '').toLowerCase())) return 'not_paid';
  return 'awaiting_packing';
}
