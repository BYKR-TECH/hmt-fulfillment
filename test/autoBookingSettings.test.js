import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AUTO_BOOKING_SETTINGS, validateAutoBookingSettings, autoBookingSkipReason, autoBookingConfig, autoBookingSettingsFromForm } from '../lib/crm/auto-booking-settings.js';
import { selectAutomationLane, processOrder } from '../lib/crm/automation.js';
import { mergeCrmSettings } from '../lib/crm/settings.js';
const order = { id: 'order-1', source: 'wix', payment_status: 'PAID', internal_status: 'new', total_amount: 500, shipping_address: { country: 'US' } };
const settings = value => validateAutoBookingSettings(value);

test('missing row preserves legacy routing; first-save defaults select Premium and SID vars', () => {
  assert.equal(selectAutomationLane(order).serviceCode, 'dlv_saver');
  assert.equal(selectAutomationLane({ ...order, selected_shipping_title: 'Express' }).lane, 'fedex_csv');
  assert.equal(selectAutomationLane({ ...order, shipping_address: { country: 'IN' } }).serviceCode, 'express');
  assert.deepEqual(mergeCrmSettings([]).auto_booking, DEFAULT_AUTO_BOOKING_SETTINGS);
  assert.equal(selectAutomationLane(order, settings()).internationalService, 'DLV Premium');
  assert.equal(settings().pickupLocation, 'SID vars');
});
test('rejects Saver, mismatched services, implicit HSR and invalid values', () => {
  for (const serviceMode of ['dlv_saver', 'DLV Saver', 'express']) assert.throws(() => settings({ international: { serviceMode } }), /Premium/);
  for (const pickupLocation of ['HSR GDP', 'HSR BYKR']) {
    assert.throws(() => settings({ pickupLocation }), /explicit/);
    assert.equal(settings({ pickupLocation, pickupExplicitlyChosen: true }).pickupLocation, pickupLocation);
  }
  for (const value of [{ package: { weightGrams: 0 } }, { allowedSources: ['amazon'] }, { allowedCountries: ['USA'] }, { cutoffTime: '25:01' }, { maxOrderValue: -1 }, { enabled: 'false' }, { runTime: '17:00', cutoffTime: '09:00' }]) assert.throws(() => settings(value));
});
test('qualifying rules and IST window are enforced; configured rules can relax paid and hold', () => {
  const now = new Date('2026-10-11T06:30:00Z'); // 12:00 IST
  for (const [value, expected] of [[{ enabled: false }, 'booking-disabled'], [{ allowedSources: [] }, 'source-not-allowed'], [{ requirePacked: true }, 'not-packed'], [{ allowedCountries: ['IN'] }, 'country-not-allowed'], [{ maxOrderValue: 499 }, 'order-value-limit'], [{ runTime: '12:01' }, 'before-run-time'], [{ cutoffTime: '11:59' }, 'after-cutoff']]) assert.equal(autoBookingSkipReason(order, settings(value), now), expected);
  assert.equal(autoBookingSkipReason({ ...order, payment_status: 'PENDING' }, settings(), now), 'unpaid');
  assert.equal(autoBookingSkipReason({ ...order, automation_hold: true }, settings(), now), 'automation-hold');
  assert.equal(autoBookingSkipReason({ ...order, pick_pack_tasks: [{ status: 'packed' }] }, settings({ requirePacked: true }), now), '');
  assert.equal(selectAutomationLane({ ...order, payment_status: 'PENDING', automation_hold: true }, settings({ requirePaid: false, skipAutomationHold: false })).lane, 'book_configured');
  assert.equal(selectAutomationLane({ ...order, internal_status: 'cancelled' }, settings()).lane, 'skip');
  assert.equal(autoBookingSkipReason(order, settings({ runTime: '12:00', cutoffTime: '12:00', maxOrderValue: 500 }), now), '');
});
function fakeDb() {
  const writes = [];
  return { writes, from(table) {
    const query = { select() { return query; }, eq() { return query; },
      upsert(row) { writes.push({ table, row }); return query; },
      update(row) { writes.push({ table, row }); return query; },
      maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }),
      then(resolve) { return Promise.resolve({ data: null }).then(resolve); } };
    return query;
  } };
}
test('dry run records proposal and never calls booking or writes shipments/FedEx batches', async () => {
  for (const courier of ['delhivery', 'fedex']) {
    const db = fakeDb(); const counters = { processed: 0, skipped: 0 };
    const booking = new Proxy({}, { get() { throw new Error('Booking accessed in dry run'); } });
    await processOrder(db, order, {}, counters, settings({ dryRun: true, international: { courier, serviceMode: courier === 'fedex' ? 'international_express' : 'dlv_premium' } }), { booking });
    assert.equal(counters.dryRun, 1);
    assert.equal(db.writes.length, 1);
    assert.equal(db.writes[0].table, 'automation_action_attempts');
    assert.equal(db.writes[0].row.payload.wouldBook, true);
    assert.equal(db.writes[0].row.payload.pickupLocation, 'SID vars');
    assert.equal(db.writes[0].row.attempts, 0);
  }
});
test('configured booking passes courier, package and pickup to source-specific booker', async () => {
  const db = fakeDb(); let captured;
  const configured = settings({ pickupLocation: 'HSR GDP', pickupExplicitlyChosen: true, package: { weightGrams: 900 }, international: { courier: 'fedex', serviceMode: 'international_express' } });
  await processOrder(db, { ...order, source: 'woocommerce', raw_order: { id: 123 } }, { delhivery: { token: 'secret' }, defaults: {} }, { processed: 0, booked: 0, queued: 0 }, configured, { booking: { bookWooCommerceOrder: async (...args) => { captured = args; return { shipment: { status: 'pending', waybill: '' } }; } } });
  assert.equal(captured[1].defaults.internationalWeightGrams, 900);
  assert.equal(captured[1].delhivery.pickupLocation, 'HSR GDP');
  assert.equal(captured[1].delhivery.token, 'secret');
  assert.equal(captured[2].courierCode, 'fedex');
  assert.equal(captured[2].dbOrderId, order.id);
  assert.equal(autoBookingConfig({}, null).defaults, undefined);
});

import { bookManualAutomationOrder, manualOrderForCarrier } from '../lib/crm/manual-auto-booking.js';
import { mapWixOrderToDelhivery } from '../src/delhivery.js';
test('manual booking uses CRM identity and address without Wix import or fulfillment', async () => {
  const manual = { ...order, source: 'manual', shipping_address: { name: 'Buyer', phone: '9999999999', address_line1: '123 Main Road', city: 'Delhi', state: 'Delhi', postal_code: '110001', country: 'IN' }, order_items: [{ product_name: 'Throttle', quantity: 1 }] };
  const writes = []; let carrierCalls = 0;
  const config = autoBookingConfig({ createAwbOnBook: true, defaults: { paymentMode: 'Prepaid' } }, settings());
  const result = await bookManualAutomationOrder(manual, config, { courierCode: 'delhivery', shippingMode: 'E' }, {
    couriers: { getCourierAdapter: () => ({ code: 'delhivery', mapOrder: mapWixOrderToDelhivery,
      createShipment: async payload => { carrierCalls++; assert.equal(payload.shipments[0].add, '123 Main Road'); return { waybill: 'MOCK-AWB' }; } }) },
    store: { upsertShipment: async row => { writes.push(row); return { ...row, id: 'shipment-1' }; } }
  });
  assert.equal(result.shipment.waybill, 'MOCK-AWB');
  assert.equal(writes[0].dbOrderId, order.id);
  assert.equal(carrierCalls, 1);
  assert.equal(manualOrderForCarrier(manual).shippingInfo.logistics.shippingDestination.address.country, 'IN');
});
test('form produces validated typed auto-booking settings', () => {
  const result = autoBookingSettingsFromForm({ auto_booking_enabled: 'on', auto_booking_pickup_location: 'SID vars', auto_booking_domestic_mode: 'surface', auto_booking_international_courier: 'fedex', auto_booking_international_mode: 'international_express', auto_booking_weightGrams: '500', auto_booking_lengthCm: '24', auto_booking_widthCm: '15', auto_booking_heightCm: '6', auto_booking_sources: 'wix, woocommerce', auto_booking_countries: 'in, us', auto_booking_require_paid: 'on', auto_booking_skip_hold: 'on', auto_booking_max_value: '', auto_booking_run_time: '09:00' });
  assert.equal(result.package.weightGrams, 500);
  assert.equal(result.dryRun, false);
  assert.deepEqual(result.allowedCountries, ['IN', 'US']);
  assert.equal(result.maxOrderValue, null);
});
test('disabled and unqualified orders do not enter booking', async () => {
  for (const rules of [{ enabled: false }, { requirePacked: true }, { allowedSources: [] }]) {
    const db = fakeDb(); const counters = { skipped: 0, processed: 0 };
    await processOrder(db, order, {}, counters, settings(rules), { booking: new Proxy({}, { get() { throw new Error('Booking must not run'); } }) });
    assert.equal(counters.skipped, 1);
    assert.equal(counters.processed, 0);
    assert.equal(db.writes[0].table, 'orders');
    assert.equal(db.writes.length, 1);
  }
});
