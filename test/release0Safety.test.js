import test from 'node:test';
import assert from 'node:assert/strict';
import { isAutoBookEnabled, isWixSyncEnabled, processOrder } from '../lib/crm/automation.js';
import { validateAutoBookingSettings } from '../lib/crm/auto-booking-settings.js';
import { sendWhatsAppOrderUpdate } from '../lib/crm/wacli.js';
import { safeNextPath } from '../lib/safe-next-path.js';

function fakeDb() {
  const writes = [];
  return { writes, from(table) {
    const query = { select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
      insert(row) { writes.push({ table, row }); return query; },
      upsert(row) { writes.push({ table, row }); return query; },
      update(row) { writes.push({ table, row }); return query; },
      maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }),
      then(resolve) { return Promise.resolve({ data: null }).then(resolve); } };
    return query;
  } };
}

const paidOrder = { id: 'order-1', order_number: '10001', payment_status: 'PAID', internal_status: 'new', total_amount: 500, shipping_address: { country: 'IN' } };
const refuseBooking = new Proxy({}, { get() { throw new Error('booking must not be called'); } });

test('auto-booking and Wix sync are off unless explicitly enabled', () => {
  assert.equal(isAutoBookEnabled({}), false);
  assert.equal(isAutoBookEnabled({ AUTO_BOOK_ENABLED: 'false' }), false);
  assert.equal(isAutoBookEnabled({ AUTO_BOOK_ENABLED: 'true' }), true);
  assert.equal(isWixSyncEnabled({}), false);
  assert.equal(isWixSyncEnabled({ WIX_ORDER_SYNC_ENABLED: 'true' }), true);
});

test('automation never books or queues FedEx exports while auto-book is disabled', async () => {
  const cases = [
    [{ ...paidOrder, source: 'woocommerce' }, null],
    [{ ...paidOrder, source: 'woocommerce' }, validateAutoBookingSettings({})],
    [{ ...paidOrder, source: 'woocommerce', shipping_address: { country: 'US' }, selected_shipping_title: 'Express' }, null]
  ];
  for (const [order, settings] of cases) {
    const db = fakeDb();
    const counters = { processed: 0, skipped: 0 };
    await processOrder(db, order, {}, counters, settings, { booking: refuseBooking, autoBookEnabled: false });
    assert.equal(counters.autoBookDisabled, 1);
    assert.ok(db.writes.every(write => write.table === 'orders'), JSON.stringify(db.writes));
  }
});

test('Woo orders on legacy lanes book through the Woo path, never the Wix path', async () => {
  const calls = [];
  const booking = {
    bookWooCommerceOrder: async () => { calls.push('woo'); return { shipment: { waybill: '' } }; },
    bookWooCommerceOrderById: async () => { calls.push('woo-by-id'); return { shipment: { waybill: '' } }; },
    bookWixOrder: async () => { calls.push('wix'); return { shipment: {} }; },
    bookWixOrderById: async () => { calls.push('wix-by-id'); return { shipment: {} }; }
  };
  const counters = { processed: 0, skipped: 0, booked: 0, queued: 0 };
  await processOrder(fakeDb(), { ...paidOrder, source: 'woocommerce' }, {}, counters, null, { booking, autoBookEnabled: true });
  await processOrder(fakeDb(), { ...paidOrder, source: 'woocommerce', raw_order: { id: 1 } }, {}, counters, null, { booking, autoBookEnabled: true });
  assert.deepEqual(calls, ['woo-by-id', 'woo']);
});

test('wacli order updates stay off even when the env flag is on', async () => {
  const previous = process.env.WACLI_ORDER_UPDATES_ENABLED;
  process.env.WACLI_ORDER_UPDATES_ENABLED = 'true';
  try {
    const result = await sendWhatsAppOrderUpdate({ order_number: '1', phone: '9999999999' }, { waybill: 'AWB1' });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'whatsapp-updates-disabled');
  } finally {
    if (previous === undefined) delete process.env.WACLI_ORDER_UPDATES_ENABLED;
    else process.env.WACLI_ORDER_UPDATES_ENABLED = previous;
  }
});

test('login next only allows same-origin paths', () => {
  assert.equal(safeNextPath('/orders?stage=paid'), '/orders?stage=paid');
  for (const value of [null, '', 'orders', '//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '/\t/evil.example']) {
    assert.equal(safeNextPath(value), '/', String(value));
  }
});
