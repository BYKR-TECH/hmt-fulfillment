import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileWhatsAppMessageFailures, correctedRecipientAllowsRetry } from '../lib/crm/whatsapp-message-status.js';

test('undeliverable messages retry only with a changed valid recipient and bounded attempts', async () => {
  const event = { status: 'failed', error: '131026: Message undeliverable', recipient_ref: '1', attempts: 1 };
  const options = { env: { CHATWOOT_BASE_URL: 'https://example.com', CHATWOOT_ACCOUNT_ID: '1', CHATWOOT_API_TOKEN: 'test' }, fetchImpl: async () => ({ ok: true, json: async () => ({ meta: { sender: { phone_number: '+910456075743' } } }) }) };
  assert.equal(await correctedRecipientAllowsRetry(event, '+61456075743', options), true);
  assert.equal(await correctedRecipientAllowsRetry(event, '+910456075743', options), false);
  assert.equal(await correctedRecipientAllowsRetry({ ...event, attempts: 3 }, '+61456075743', options), false);
  assert.equal(await correctedRecipientAllowsRetry({ ...event, error: '131049: Engagement restriction' }, '+61456075743', options), false);
});

test('provider failure is persisted and noted once without sending or clearing duplicate guards', async () => {
  const event = { id: 'e', order_id: 'o', event_type: 'shipment-confirmation', provider_message_id: '1', recipient_ref: '2', status: 'sent' };
  const notes = [];
  const db = { from: table => ({ select() { return this; }, eq() { return this; }, not() { return this; }, order() { return this; }, range: async () => ({ data: table === 'customer_messages' ? [] : [event] }), update(row) { return { eq: async () => { Object.assign(event, row); return {}; } }; }, insert: async row => { notes.push(row); return {}; } }) };
  const options = { env: { CHATWOOT_BASE_URL: 'https://example.com', CHATWOOT_ACCOUNT_ID: '1', CHATWOOT_API_TOKEN: 'test' }, fetchImpl: async () => ({ ok: true, json: async () => ({ payload: [{ id: 1, status: 'failed', content_attributes: { external_error: '131026: Message undeliverable' } }] }) }) };
  assert.equal((await reconcileWhatsAppMessageFailures(db, options)).failed, 1);
  assert.equal(event.status, 'failed');
  assert.match(event.error, /131026/);
  assert.equal((await reconcileWhatsAppMessageFailures(db, options)).failed, 0);
  assert.equal(notes.length, 1);
});
