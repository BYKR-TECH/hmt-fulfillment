import test from 'node:test';
import assert from 'node:assert/strict';
import { whatsappPhone } from '../lib/crm/chatwoot.js';

test('Australian national numbers use AU rather than the India default', () => {
  assert.equal(whatsappPhone({ shipping_address: { country: 'AU', phone: '0456075743' } }), '+61456075743');
  assert.equal(whatsappPhone({ shipping_address: { country: 'AU', phone: '+61456075743' } }), '+61456075743');
  assert.equal(whatsappPhone({ shipping_address: { country: 'AU', phone: '+910456075743' } }), '');
});
test('invalid phones fail closed and explicit international numbers are preserved', () => {
  assert.equal(whatsappPhone({ shipping_address: { country: 'AU', phone: '123' } }), '');
  assert.equal(whatsappPhone({ shipping_address: { country: 'AU', phone: '+919876543210' } }), '+919876543210');
});
