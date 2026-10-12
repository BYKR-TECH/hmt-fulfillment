import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../lib/crm/data.js', import.meta.url), 'utf8');
const functions = ['withLatestShipment', 'mostRecentShipmentRecord', 'trackingUrlFromShipment'].map(name => {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\n}\n', start) + 2);
}).join('\n');
const helpers = runInNewContext(`${functions}; ({withLatestShipment,mostRecentShipmentRecord})`);
const original = { id: '1', direction: 'forward', created_at: '2026-06-01', updated_at: '2026-10-13', status: 'delivered', waybill: 'OLD123', courier_code: 'delhivery' };
const replacement = { id: '2', direction: 'forward', created_at: '2026-10-12', updated_at: '2026-10-12', status: 'booked', waybill: 'NEW123', courier_code: 'fedex' };
test('latest outbound uses booking date, ignoring old tracking updates and newer reverse legs', () => {
  const reverse = { ...replacement, id: '3', direction: 'reverse', created_at: '2026-10-14' };
  assert.equal(helpers.mostRecentShipmentRecord([reverse, original, replacement]), replacement);
});
test('replacement status, carrier, AWB and link replace stale original order tracking together', () => {
  const order = helpers.withLatestShipment({ shipment_status: 'delivered', awb_number: 'OLD123', shipment_waybill: 'OLD123', courier: 'delhivery', tracking_url: 'https://old.example' }, replacement);
  assert.equal(order.shipment_status, 'booked');
  assert.equal(order.awb_number, 'NEW123');
  assert.equal(order.courier, 'fedex');
  assert.equal(order.tracking_url, 'https://www.fedex.com/fedextrack/?trknbr=NEW123');
});
test('stored shipment tracking link is preserved and a new unbooked leg cannot inherit an old AWB', () => {
  assert.equal(helpers.withLatestShipment({}, { ...replacement, tracking_url: 'https://custom.example/NEW123' }).tracking_url, 'https://custom.example/NEW123');
  const pending = helpers.withLatestShipment({ awb_number: 'OLD123', shipment_waybill: 'OLD123', tracking_url: 'https://old.example' }, { ...replacement, waybill: null, status: 'pending' });
  assert.equal(pending.awb_number, '');
  assert.equal(pending.tracking_url, '');
  assert.equal(pending.shipment_status, 'pending');
});
test('orders without shipment records retain their existing tracking summary', () => {
  const order = { awb_number: 'OLD123' };
  assert.equal(helpers.withLatestShipment(order, null), order);
  assert.equal(helpers.mostRecentShipmentRecord([{ ...replacement, direction: 'reverse' }]), null);
});
