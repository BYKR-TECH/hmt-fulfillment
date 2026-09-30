import assert from 'node:assert/strict';
import test from 'node:test';
import { carrierTrackingUrl, normalizeTrackingId, resolveTrackingRedirect, trackingIdFromPath } from '../lib/tracking-redirect.js';

test('builds official carrier tracking URLs', () => {
  assert.equal(carrierTrackingUrl('delhivery', '52270010001982'), 'https://www.delhivery.com/track/package/52270010001982');
  assert.equal(carrierTrackingUrl('fedex', '771234567890'), 'https://www.fedex.com/fedextrack/?trknbr=771234567890');
  assert.equal(carrierTrackingUrl('shiprocket', 'SR-12345'), 'https://shiprocket.co/tracking/SR-12345');
});

test('rejects unsafe or malformed tracking IDs', () => {
  assert.equal(normalizeTrackingId('52270010001982'), '52270010001982');
  assert.equal(normalizeTrackingId('../login'), '');
  assert.equal(normalizeTrackingId('x'), '');
});

test('strips Meta literal placeholder prefixes from tracking links', () => {
  assert.equal(normalizeTrackingId('{{1}}52270010001982'), '52270010001982');
  assert.equal(normalizeTrackingId('%7B%7B1%7D%7D52270010001982'), '52270010001982');
  assert.equal(trackingIdFromPath('/%7B%7B1%7D%7D52270010001982'), '52270010001982');
});

test('looks up the courier before redirecting', async () => {
  const result = await resolveTrackingRedirect(fakeDb({ waybill: '771234567890', courier_code: 'fedex' }), '771234567890');
  assert.deepEqual(result, { ok: true, url: 'https://www.fedex.com/fedextrack/?trknbr=771234567890' });
});

test('prefers an operator supplied HTTPS tracking link for unsupported couriers', async () => {
  const result = await resolveTrackingRedirect(fakeDb({ waybill: 'SMC5530091', courier_code: 'shree_maruti', tracking_url: 'https://carrier.example/track/SMC5530091' }), 'SMC5530091');
  assert.equal(result.url, 'https://carrier.example/track/SMC5530091');
});

test('rejects unsafe stored redirect protocols', async () => {
  const result = await resolveTrackingRedirect(fakeDb({ waybill: '52270010001982', courier_code: 'delhivery', tracking_url: 'javascript:alert(1)' }), '52270010001982');
  assert.equal(result.url, 'https://www.delhivery.com/track/package/52270010001982');
});

test('returns not found instead of guessing an unknown shipment', async () => {
  const result = await resolveTrackingRedirect(fakeDb(null), 'UNKNOWN-123');
  assert.equal(result.status, 404);
});

function fakeDb(data, error = null) {
  return { from() { return { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, maybeSingle: async () => ({ data, error }) }; } };
}
