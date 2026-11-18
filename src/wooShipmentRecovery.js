const META_KEYS = Object.freeze({
  awb: '_hmt_awb',
  carrier: '_hmt_carrier',
  status: '_hmt_shipment_status',
  trackingUrl: '_hmt_tracking_url',
  shipmentId: '_hmt_ops_shipment_id',
  syncedAt: '_hmt_ops_synced_at'
});

const TERMINAL_ORDER_STATUSES = new Set(['cancelled', 'fulfilled', 'fulfilled_no_tracking', 'completed', 'merged']);
const RECOVERABLE_ORDER_STATUSES = new Set([
  'new',
  'details_verified',
  'awaiting_packing',
  'packed',
  'awaiting_fedex_awb',
  'pending_international'
]);
const MESSAGE_ACTIVE_STATUSES = new Set(['picked_up', 'dispatched', 'in_transit', 'out_for_delivery']);

export function extractWooShipmentMetadata(rawOrder = {}) {
  const metadata = new Map((rawOrder.meta_data || []).map(item => [String(item?.key || ''), item?.value]));
  const waybill = normalizeWaybill(metadata.get(META_KEYS.awb));
  if (!waybill) return null;
  const courier = inferCourier(waybill, metadata.get(META_KEYS.carrier));
  const status = normalizeRecoveredShipmentStatus(metadata.get(META_KEYS.status));
  const sourceShipmentId = validUuid(metadata.get(META_KEYS.shipmentId)) ? String(metadata.get(META_KEYS.shipmentId)) : '';
  return {
    waybill,
    courier,
    status,
    trackingUrl: trackingUrlFor(courier, waybill),
    sourceShipmentId,
    sourceSyncedAt: validTimestamp(metadata.get(META_KEYS.syncedAt)) || '',
    sourceTrackingUrl: String(metadata.get(META_KEYS.trackingUrl) || '').trim(),
    flow: destinationCountry(rawOrder) === 'IN' ? 'domestic' : 'international'
  };
}

export function planWooShipmentRecoveries(orders = [], shipments = []) {
  const shipmentsByOrder = new Map();
  const shipmentIds = new Map();
  for (const shipment of shipments) {
    const rows = shipmentsByOrder.get(shipment.order_id) || [];
    rows.push(shipment);
    shipmentsByOrder.set(shipment.order_id, rows);
    shipmentIds.set(shipment.id, shipment);
  }

  const plan = [];
  for (const order of orders) {
    if (order.source !== 'woocommerce') continue;
    const recovered = extractWooShipmentMetadata(order.raw_order);
    if (!recovered) continue;
    const orderShipments = shipmentsByOrder.get(order.id) || [];
    const matchingShipment = orderShipments.find(shipment => normalizeWaybill(shipment.waybill) === recovered.waybill) || null;
    if (!matchingShipment && recovered.sourceShipmentId && shipmentIds.has(recovered.sourceShipmentId)) {
      const collision = shipmentIds.get(recovered.sourceShipmentId);
      throw new Error(`Shipment ID ${recovered.sourceShipmentId} belongs to another local record (${collision.order_id}).`);
    }
    const shipmentId = matchingShipment?.id || recovered.sourceShipmentId || '';
    const desiredLabelUrl = recovered.courier === 'delhivery' && shipmentId
      ? `/api/crm/shipments/${shipmentId}/label-file`
      : '';
    const orderPatch = buildRecoveredOrderPatch(order, recovered, desiredLabelUrl);
    const shipmentNeedsLabel = Boolean(matchingShipment && desiredLabelUrl && !matchingShipment.label_url);
    if (matchingShipment && !shipmentNeedsLabel && !Object.keys(orderPatch).length) continue;
    plan.push({ order, recovered, matchingShipment, desiredLabelUrl, orderPatch });
  }
  return plan;
}

export function buildRecoveredShipmentRow(order, recovered, recoveredAt = new Date().toISOString()) {
  const shipmentId = recovered.sourceShipmentId || undefined;
  return stripUndefined({
    id: shipmentId,
    order_id: order.id,
    order_number: order.order_number,
    direction: 'forward',
    flow: recovered.flow,
    shipment_type: 'original',
    courier_code: recovered.courier,
    status: recovered.status,
    waybill: recovered.waybill,
    tracking_url: recovered.trackingUrl,
    label_url: recovered.courier === 'delhivery' && shipmentId ? `/api/crm/shipments/${shipmentId}/label-file` : null,
    label_format: recovered.courier === 'delhivery' ? 'pdf' : null,
    request_payload: {},
    carrier_response: {
      recovered_from: 'woocommerce_meta_data',
      recovered_at: recoveredAt,
      source_shipment_id: recovered.sourceShipmentId || null,
      source_synced_at: recovered.sourceSyncedAt || null,
      source_tracking_url: recovered.sourceTrackingUrl || null
    }
  });
}

export function recoveredMessageMarker(recovered) {
  if (!MESSAGE_ACTIVE_STATUSES.has(recovered.status)) return '';
  return `automation:whatsapp:shipment-confirmation:${recovered.waybill}`;
}

export function normalizeRecoveredShipmentStatus(value) {
  const status = String(value || 'booked').trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (['booked', 'shipment_booked', 'awb_assigned'].includes(status)) return 'shipment_booked';
  if (['pickedup', 'picked_up', 'dispatched'].includes(status)) return status === 'dispatched' ? 'dispatched' : 'picked_up';
  if (['intransit', 'in_transit'].includes(status)) return 'in_transit';
  if (['outfordelivery', 'out_for_delivery'].includes(status)) return 'out_for_delivery';
  if (['canceled', 'cancelled'].includes(status)) return 'cancelled';
  if (['delivered', 'pickup_pending', 'failed', 'returned', 'rto'].includes(status)) return status;
  return 'shipment_booked';
}

export function inferCourier(waybill, value = '') {
  const compact = normalizeWaybill(waybill).toUpperCase();
  if (/^DL[A-Z0-9]+XB$/.test(compact) || /^5227\d{10}$/.test(compact)) return 'delhivery';
  const supplied = String(value || '').trim().toLowerCase().replaceAll(' ', '_');
  if (supplied) return supplied === 'ship_rocket' ? 'shiprocket' : supplied;
  if (/^\d{12}$/.test(compact)) return 'fedex';
  return 'delhivery';
}

export function trackingUrlFor(courier, waybill) {
  const encoded = encodeURIComponent(normalizeWaybill(waybill));
  if (courier === 'fedex') return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
  if (courier === 'shiprocket') return `https://shiprocket.co/tracking/${encoded}`;
  return `https://www.delhivery.com/track/package/${encoded}`;
}

function buildRecoveredOrderPatch(order, recovered, labelUrl) {
  const desired = {
    shipment_waybill: recovered.waybill,
    shipment_courier_code: recovered.courier,
    shipment_status: recovered.status,
    awb_number: recovered.waybill,
    courier: recovered.courier,
    tracking_url: recovered.trackingUrl,
    shipment_booked_at: recovered.sourceSyncedAt || order.source_updated_at || order.source_created_at || null,
    ...(labelUrl ? { shipment_label_url: labelUrl, shipment_label_format: 'pdf', shipment_label_error: null } : {}),
    ...(!TERMINAL_ORDER_STATUSES.has(normalizeStatus(order.internal_status))
      ? { last_automation_status: 'post-awb-complete', last_automation_error: null }
      : {}),
    ...(RECOVERABLE_ORDER_STATUSES.has(normalizeStatus(order.internal_status))
      ? { internal_status: internalStatusForShipment(recovered.status) }
      : {})
  };
  return Object.fromEntries(Object.entries(desired).filter(([key, value]) => !sameValue(order[key], value)));
}

function internalStatusForShipment(status) {
  if (status === 'delivered') return 'delivered';
  if (['cancelled', 'failed'].includes(status)) return 'awaiting_packing';
  if (['picked_up', 'dispatched', 'in_transit', 'out_for_delivery'].includes(status)) return 'in_transit';
  if (status === 'pickup_pending') return 'pickup_pending';
  return 'shipment_booked';
}

function destinationCountry(rawOrder) {
  return String(rawOrder?.shipping?.country || rawOrder?.billing?.country || 'IN').trim().toUpperCase() || 'IN';
}

function normalizeWaybill(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function validTimestamp(value) {
  const text = String(value || '').trim();
  return text && Number.isFinite(Date.parse(text)) ? text : '';
}

function sameValue(left, right) {
  if (isoTimestamp(left) && isoTimestamp(right)) return Date.parse(left) === Date.parse(right);
  return (left ?? null) === (right ?? null);
}

function isoTimestamp(value) {
  return /^\d{4}-\d{2}-\d{2}T/.test(String(value || '')) && Number.isFinite(Date.parse(value));
}

function stripUndefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}
