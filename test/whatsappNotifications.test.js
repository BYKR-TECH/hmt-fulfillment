import assert from 'node:assert/strict';
import test from 'node:test';
import { sendPickupConfirmationOnce, shipmentConfirmationEligibility } from '../lib/crm/whatsapp-notifications.js';

test('pickup confirmation sends once and saves a shipment-specific duplicate guard', async () => {
  const writes = [];
  const db = fakeDb(null, writes);
  const result = await sendPickupConfirmationOnce(
    { id: 'order-1', order_number: '123', customers: { name: 'John', phone: '9876543210' } },
    { waybill: 'AWB123' },
    {
      db,
      config: config(true),
      sendImpl: async () => ({ status: 'sent', providerMessageId: 'message-1', conversationId: '10', contactId: '20' })
    }
  );
  assert.equal(result.status, 'sent');
  assert.equal(writes[0].table, 'notes');
  assert.equal(writes[0].payload.body, 'automation:whatsapp:shipment-confirmation:AWB123');
});

test('pickup confirmation skips a shipment that already has a duplicate guard', async () => {
  let sends = 0;
  const result = await sendPickupConfirmationOnce(
    { id: 'order-1' }, { waybill: 'AWB123' },
    { db: fakeDb({ id: 'note-1' }, []), config: config(true), sendImpl: async () => { sends += 1; } }
  );
  assert.equal(result.reason, 'already-sent');
  assert.equal(sends, 0);
});

test('pickup confirmation remains disabled until production enablement', async () => {
  const result = await sendPickupConfirmationOnce({ id: 'order-1' }, { waybill: 'AWB123' }, { config: config(false) });
  assert.equal(result.reason, 'shipment-confirmations-disabled');
});

test('manual shipment confirmation is available for an active booked outbound shipment', () => {
  assert.equal(shipmentConfirmationEligibility({ waybill: 'AWB123', status: 'booked' }).allowed, true);
  assert.equal(shipmentConfirmationEligibility({ waybill: 'AWB123', status: 'pickup_pending' }).allowed, true);
});

test('manual shipment confirmation rejects unbooked, reverse, and inactive shipments', () => {
  assert.equal(shipmentConfirmationEligibility({ status: 'booked' }).allowed, false);
  assert.equal(shipmentConfirmationEligibility({ waybill: 'AWB123', status: 'booked', direction: 'reverse' }).allowed, false);
  assert.equal(shipmentConfirmationEligibility({ waybill: 'AWB123', status: 'cancelled' }).allowed, false);
});

function config(enabled) {
  return { chatwoot: { shipmentConfirmationEnabled: enabled, inboxId: '1', shipmentTemplateName: 'shipment_confirmation_3', shipmentTemplateLanguage: 'en_US', shipmentTemplateCategory: 'UTILITY', shipmentTrackingButtonUrl: 'https://track.holdmythrottle.com/{{1}}' } };
}

function fakeDb(existing, writes) {
  return {
    from(table) {
      return {
        select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: existing, error: null }),
        insert: async payload => { writes.push({ table, payload }); return { error: null }; },
        update(payload) { writes.push({ table, payload }); return { eq: async () => ({ error: null }) }; }
      };
    }
  };
}
