import assert from 'node:assert/strict';
import test from 'node:test';
import { validateShipmentPayload, normalizeManualAwb } from '../src/shipmentValidation.js';

test('manual AWB normalization and carrier mismatch rejection', () => {
  assert.equal(normalizeManualAwb(' 8781 5855 1138 '), '878158551138');
  assert.equal(validateShipmentPayload({ courier: 'fedex', awb_number: '8781 5855 1138' }, { manualAwb: true }).length, 0);
  assert.ok(validateShipmentPayload({ courier: 'fedex', awb_number: 'DL346819205XB' }, { manualAwb: true }).length);
  assert.equal(validateShipmentPayload({ courier: 'delhivery', awb_number: 'DL346819205XB' }, { manualAwb: true }).length, 0);
  assert.ok(validateShipmentPayload({ courier: 'delhivery', awb_number: 'https://example.com/track' }, { manualAwb: true }).length);
});

test('manual AWB saving only requires an AWB, not courier-booking address fields', () => {
  assert.deepEqual(
    validateShipmentPayload({ awb_number: 'MANUAL-AWB-123', country: 'IN' }, { manualAwb: true }),
    []
  );
});

test('manual AWB saving gives an actionable error when the AWB is absent', () => {
  assert.deepEqual(
    validateShipmentPayload({}, { manualAwb: true }),
    ['AWB is required to save a manual shipment']
  );
});

test('courier booking still validates delivery details', () => {
  assert.ok(validateShipmentPayload({ country: 'IN' }).includes('Invalid pincode'));
});

test('unsupported manual courier requires a safe direct tracking link', () => {
  assert.deepEqual(
    validateShipmentPayload({ courier: 'shree_maruti', awb_number: 'SMC-123' }, { manualAwb: true }),
    ['A valid HTTPS tracking link is required for couriers without automatic tracking']
  );
  assert.deepEqual(
    validateShipmentPayload({ courier: 'shree_maruti', awb_number: 'SMC-123', tracking_url: 'https://carrier.example/SMC-123' }, { manualAwb: true }),
    []
  );
});
