import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRecoveredShipmentRow,
  extractWooShipmentMetadata,
  inferCourier,
  planWooShipmentRecoveries,
  recoveredMessageMarker
} from '../src/wooShipmentRecovery.js';

const rawOrder = (values = {}) => ({
  shipping: { country: 'US' },
  meta_data: Object.entries({
    _hmt_awb: '384 889 383 399',
    _hmt_carrier: 'fedex',
    _hmt_shipment_status: 'booked',
    _hmt_ops_shipment_id: '98bd763d-3f94-431d-8ac1-58b99f73e095',
    _hmt_tracking_url: 'https://old.example/incorrect',
    _hmt_ops_synced_at: '2026-11-16T06:22:40.000Z',
    ...values
  }).map(([key, value]) => ({ key, value }))
});

test('extracts the Woo shipment write-back as a safe local recovery record', () => {
  const recovered = extractWooShipmentMetadata(rawOrder());
  assert.deepEqual(recovered, {
    waybill: '384889383399',
    courier: 'fedex',
    status: 'shipment_booked',
    trackingUrl: 'https://www.fedex.com/fedextrack/?trknbr=384889383399',
    sourceShipmentId: '98bd763d-3f94-431d-8ac1-58b99f73e095',
    sourceSyncedAt: '2026-11-16T06:22:40.000Z',
    sourceTrackingUrl: 'https://old.example/incorrect',
    flow: 'international'
  });
  const row = buildRecoveredShipmentRow({ id: 'order-1', order_number: '11237' }, recovered, '2026-11-18T00:00:00.000Z');
  assert.equal(row.id, recovered.sourceShipmentId);
  assert.equal(row.order_id, 'order-1');
  assert.equal(row.waybill, '384889383399');
  assert.equal(row.label_url, null);
});

test('corrects legacy carrier mistakes using the AWB format', () => {
  assert.equal(inferCourier('DL346816095XB', 'fedex'), 'delhivery');
  assert.equal(inferCourier('52270010002063', 'fedex'), 'delhivery');
  assert.equal(inferCourier('384889383399', 'delhivery'), 'fedex');
  assert.equal(inferCourier('879399174173', 'shiprocket'), 'shiprocket');
  assert.equal(inferCourier('34932186984', 'shiprocket'), 'shiprocket');
});

test('plans missing shipments, preserves terminal order state, and is idempotent', () => {
  const order = {
    id: 'order-1', order_number: '11236', source: 'woocommerce', internal_status: 'fulfilled',
    source_updated_at: '2026-11-16T06:22:40.000Z', raw_order: rawOrder()
  };
  const [planned] = planWooShipmentRecoveries([order], []);
  assert.equal(planned.matchingShipment, null);
  assert.equal(planned.orderPatch.internal_status, undefined);
  assert.equal(planned.orderPatch.last_automation_status, undefined);
  const matching = buildRecoveredShipmentRow(order, planned.recovered);
  const alreadyRepaired = {
    ...order,
    ...planned.orderPatch,
    shipment_waybill: planned.recovered.waybill,
    shipment_booked_at: '2026-11-16T06:22:40.000+00:00'
  };
  assert.equal(planWooShipmentRecoveries([alreadyRepaired], [matching]).length, 0);
});

test('repairs placeholder order state and suppresses retroactive pickup messages', () => {
  const order = { id: 'order-2', order_number: '11242', source: 'woocommerce', internal_status: 'awaiting_fedex_awb', raw_order: rawOrder({ _hmt_shipment_status: 'picked_up' }) };
  const [planned] = planWooShipmentRecoveries([order], []);
  assert.equal(planned.orderPatch.internal_status, 'in_transit');
  assert.equal(planned.orderPatch.last_automation_status, 'post-awb-complete');
  assert.equal(recoveredMessageMarker(planned.recovered), 'automation:whatsapp:shipment-confirmation:384889383399');
});

test('moves pre-shipment imports out of the booking queue without cancelling rebookable orders', () => {
  const booked = { id: 'order-4', order_number: '11180', source: 'woocommerce', internal_status: 'awaiting_packing', raw_order: rawOrder() };
  const cancelled = { ...booked, id: 'order-5', order_number: '11007', raw_order: rawOrder({ _hmt_shipment_status: 'cancelled' }) };
  assert.equal(planWooShipmentRecoveries([booked], [])[0].orderPatch.internal_status, 'shipment_booked');
  assert.equal(planWooShipmentRecoveries([cancelled], [])[0].orderPatch.internal_status, undefined);
});

test('restores a dynamic Delhivery label link without inventing a carrier PDF', () => {
  const order = { id: 'order-3', order_number: '11244', source: 'woocommerce', internal_status: 'shipment_booked', raw_order: rawOrder({
    _hmt_awb: '52270010003220', _hmt_carrier: 'delhivery', _hmt_ops_shipment_id: '37286000-3f92-4160-803b-445c1d8aaead'
  }) };
  const [planned] = planWooShipmentRecoveries([order], []);
  const row = buildRecoveredShipmentRow(order, planned.recovered);
  assert.equal(row.courier_code, 'delhivery');
  assert.equal(row.label_url, `/api/crm/shipments/${row.id}/label-file`);
});

test('replaces a broken placeholder label with an actionable recovery message', () => {
  const order = {
    id: 'order-6',
    order_number: '11237',
    source: 'woocommerce',
    internal_status: 'shipment_booked',
    shipment_label_url: '/api/crm/shipments/placeholder/label-file',
    shipment_label_format: 'pdf',
    raw_order: rawOrder()
  };
  const [planned] = planWooShipmentRecoveries([order], []);
  assert.equal(planned.orderPatch.shipment_label_url, null);
  assert.equal(planned.orderPatch.shipment_label_format, null);
  assert.match(planned.orderPatch.shipment_label_error, /Reprint it with the carrier or upload/);
});

test('repairs stale carrier and generated label fields on a matching shipment', () => {
  const order = { id: 'order-7', order_number: '11237', source: 'woocommerce', internal_status: 'shipment_booked', raw_order: rawOrder({ _hmt_carrier: 'delhivery' }) };
  const shipment = {
    id: 'shipment-7',
    order_id: order.id,
    waybill: '384889383399',
    courier_code: 'fedex',
    tracking_url: 'https://www.delhivery.com/track/package/384889383399',
    label_url: '/api/crm/shipments/shipment-7/label-file',
    label_format: 'pdf',
    carrier_response: {}
  };
  const [planned] = planWooShipmentRecoveries([order], [shipment]);
  assert.equal(planned.recovered.courier, 'fedex');
  assert.equal(planned.shipmentPatch.courier_code, undefined);
  assert.equal(planned.shipmentPatch.tracking_url, 'https://www.fedex.com/fedextrack/?trknbr=384889383399');
  assert.equal(planned.shipmentPatch.label_url, null);
  assert.equal(planned.shipmentPatch.label_format, null);
});
