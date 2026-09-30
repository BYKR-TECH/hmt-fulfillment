import assert from 'node:assert/strict';
import test from 'node:test';
import { validateShipmentPayload } from '../src/shipmentValidation.js';

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

test('CSB V booking enforces references and rejects unsupported carrier, domestic, return and COD flows', () => {
  const base = {
    courier: 'fedex', export_clearance: 'csb5', country: 'US', phone: '12025550123',
    address_line1: '10 Main Street', product_value: 2500, weight_grams: 400,
    length_cm: 23, width_cm: 14, height_cm: 6, invoice_number: 'INV-100', department_number: 'utility-output'
  };
  assert.deepEqual(validateShipmentPayload(base), []);
  for (const override of [
    { courier: 'delhivery' }, { country: 'IN', pincode: '560102' },
    { shipment_type: 'reverse' }, { payment_mode: 'COD' }, { invoice_number: ' ' }, { department_number: '' }
  ]) assert.ok(validateShipmentPayload({ ...base, ...override }).length);
  assert.deepEqual(validateShipmentPayload({ ...base, department_number: '', awb_number: '123' }, { manualAwb: true }), []);
});
