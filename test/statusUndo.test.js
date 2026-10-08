import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectOrderBackwardFields,
  getLastUndoableStatusChange,
  historyAction,
  isUndoableHistoryRow,
  parseHistorySnapshot,
  pickOrderSnapshot,
  pickShipmentSnapshot,
  recordStatusChange,
  undoLastStatusChange
} from '../lib/crm/status-undo.js';

function memoryDb(seedHistory = []) {
  const state = {
    orders: new Map([['order-1', {
      id: 'order-1',
      internal_status: 'in_transit',
      shipment_status: 'picked-up',
      fulfillment_status: 'FULFILLED',
      wix_fulfillment_status: 'fulfilled',
      wix_fulfillment_id: 'ful-1',
      awb_number: 'AWB1',
      courier: 'delhivery',
      source: 'wix'
    }]]),
    shipments: new Map([['ship-1', {
      id: 'ship-1',
      order_id: 'order-1',
      status: 'picked-up',
      waybill: 'AWB1',
      courier_code: 'delhivery',
      carrier_response: {}
    }]]),
    history: [...seedHistory],
    notes: [{ id: 'n1', order_id: 'order-1', note_type: 'automation', body: 'automation:whatsapp:shipment-confirmation:AWB1' }],
    message_events: [{ dedupe_key: 'automation:whatsapp:shipment-confirmation:AWB1' }]
  };

  function from(table) {
    const ctx = { table, filters: {}, patch: null, insertRow: null, op: 'select' };
    const api = {
      select() { return api; },
      insert(row) { ctx.op = 'insert'; ctx.insertRow = Array.isArray(row) ? row[0] : row; return api; },
      update(row) { ctx.op = 'update'; ctx.patch = row; return api; },
      delete() { ctx.op = 'delete'; return api; },
      eq(key, value) { ctx.filters[key] = value; return api; },
      // keep last-write-wins map; delete matches all provided keys
      order() { return api; },
      limit() { return api; },
      single: async () => run(true),
      maybeSingle: async () => run(false),
      then(resolve, reject) {
        return Promise.resolve(run(false)).then(resolve, reject);
      }
    };

    async function run(requireOne) {
      if (table === 'status_history') {
        if (ctx.op === 'insert') {
          const row = {
            id: `h-${state.history.length + 1}`,
            created_at: new Date().toISOString(),
            ...ctx.insertRow
          };
          state.history.unshift(row);
          return { data: row, error: null };
        }
        if (ctx.op === 'update') {
          const row = state.history.find(item => item.id === ctx.filters.id);
          if (row) Object.assign(row, ctx.patch);
          return { data: row || null, error: null };
        }
        let rows = state.history.filter(item => !ctx.filters.order_id || item.order_id === ctx.filters.order_id);
        return { data: rows, error: null };
      }
      if (table === 'orders') {
        if (ctx.op === 'update') {
          const row = state.orders.get(ctx.filters.id);
          if (row) Object.assign(row, ctx.patch);
          return { data: row, error: null };
        }
        const row = state.orders.get(ctx.filters.id) || null;
        return { data: row, error: requireOne && !row ? { message: 'missing' } : null };
      }
      if (table === 'shipments') {
        if (ctx.op === 'update') {
          const row = state.shipments.get(ctx.filters.id);
          if (row) Object.assign(row, ctx.patch);
          return { data: row, error: null };
        }
        const row = [...state.shipments.values()].find(item => {
          if (ctx.filters.id && item.id !== ctx.filters.id) return false;
          if (ctx.filters.order_id && item.order_id !== ctx.filters.order_id) return false;
          return true;
        }) || null;
        return { data: row, error: null };
      }
      if (table === 'notes') {
        if (ctx.op === 'delete') {
          state.notes = state.notes.filter(note => !(
            note.order_id === ctx.filters.order_id
            && note.note_type === ctx.filters.note_type
            && note.body === ctx.filters.body
          ));
          return { data: null, error: null };
        }
        return { data: state.notes, error: null };
      }
      if (table === 'message_events') {
        if (ctx.op === 'delete') {
          state.message_events = state.message_events.filter(row => row.dedupe_key !== ctx.filters.dedupe_key);
          return { data: null, error: null };
        }
        return { data: state.message_events, error: null };
      }
      return { data: null, error: null };
    }

    return api;
  }

  return { from, _state: state };
}

test('detectOrderBackwardFields finds regressions on order patch', () => {
  const changes = detectOrderBackwardFields(
    { internal_status: 'in_transit', shipment_status: 'picked-up' },
    { internal_status: 'awaiting_packing', shipment_status: 'booked' }
  );
  assert.equal(changes.length, 2);
  assert.equal(changes[0].field, 'internal_status');
  assert.equal(changes[1].field, 'shipment_status');
});

test('history helpers parse snapshots and identify undoable rows', () => {
  const row = {
    id: 'h1',
    field_name: 'status_change:mark_picked_up',
    old_value: JSON.stringify({ order: { shipment_status: 'booked' }, shipment: { id: 'ship-1', status: 'booked' } }),
    new_value: JSON.stringify({ order: { shipment_status: 'picked-up' }, shipment: { id: 'ship-1', status: 'picked-up' } })
  };
  assert.equal(historyAction(row), 'mark_picked_up');
  assert.equal(isUndoableHistoryRow(row), true);
  assert.equal(parseHistorySnapshot(row.old_value).shipment.status, 'booked');
  assert.equal(pickShipmentSnapshot({ id: 'x', status: 'booked', waybill: 'A' }).waybill, 'A');
  assert.equal(pickOrderSnapshot({ internal_status: 'packed' }).internal_status, 'packed');
});

test('recordStatusChange stores undoable mark_picked_up history', async () => {
  const db = memoryDb();
  const result = await recordStatusChange(db, {
    orderId: 'order-1',
    shipmentId: 'ship-1',
    action: 'mark_picked_up',
    before: {
      order: pickOrderSnapshot({ shipment_status: 'booked', internal_status: 'shipment_booked' }),
      shipment: pickShipmentSnapshot({ id: 'ship-1', status: 'booked', waybill: 'AWB1', courier_code: 'delhivery' })
    },
    after: {
      order: pickOrderSnapshot({ shipment_status: 'picked-up', internal_status: 'in_transit' }),
      shipment: pickShipmentSnapshot({ id: 'ship-1', status: 'picked-up', waybill: 'AWB1', courier_code: 'delhivery' })
    },
    sideEffects: { whatsapp_sent: true, wix_fulfilled: true }
  });
  assert.equal(result.ok, true);
  const last = await getLastUndoableStatusChange(db, 'order-1');
  assert.equal(historyAction(last), 'mark_picked_up');
});

test('undoLastStatusChange requires confirm + reason then restores Ops + hold + clears WA dedupe', async () => {
  const before = {
    order: pickOrderSnapshot({
      internal_status: 'shipment_booked',
      shipment_status: 'booked',
      awb_number: 'AWB1',
      courier: 'delhivery',
      wix_fulfillment_status: null,
      wix_fulfillment_id: null,
      fulfillment_status: 'NOT_FULFILLED'
    }),
    shipment: pickShipmentSnapshot({ id: 'ship-1', status: 'booked', waybill: 'AWB1', courier_code: 'delhivery' })
  };
  const after = {
    order: pickOrderSnapshot({
      internal_status: 'in_transit',
      shipment_status: 'picked-up',
      awb_number: 'AWB1',
      courier: 'delhivery',
      wix_fulfillment_status: 'fulfilled',
      wix_fulfillment_id: 'ful-1',
      fulfillment_status: 'FULFILLED'
    }),
    shipment: pickShipmentSnapshot({ id: 'ship-1', status: 'picked-up', waybill: 'AWB1', courier_code: 'delhivery' })
  };
  const db = memoryDb([{
    id: 'h-seed',
    order_id: 'order-1',
    field_name: 'status_change:mark_picked_up',
    action: 'mark_picked_up',
    shipment_id: 'ship-1',
    old_value: JSON.stringify(before),
    new_value: JSON.stringify(after),
    side_effects: { whatsapp_sent: true, wix_fulfilled: true, woo_writeback: false },
    created_at: new Date().toISOString()
  }]);

  const blocked = await undoLastStatusChange('order-1', { db });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'confirm_backward_required');

  const undone = await undoLastStatusChange('order-1', {
    db,
    confirmBackward: true,
    reason: 'Accidental Mark picked up on 11074-like case',
    clearWhatsAppDedupe: true
  });
  assert.equal(undone.ok, true);
  assert.equal(undone.undone_action, 'mark_picked_up');
  assert.equal(db._state.shipments.get('ship-1').status, 'booked');
  assert.equal(db._state.orders.get('order-1').shipment_status, 'booked');
  // Wix fulfillment identity left alone
  assert.equal(db._state.orders.get('order-1').wix_fulfillment_id, 'ful-1');
  assert.equal(db._state.shipments.get('ship-1').carrier_response.ops_status_hold.active, true);
  assert.equal(db._state.shipments.get('ship-1').carrier_response.ops_status_hold.revert_from, 'picked-up');
  assert.equal(db._state.notes.length, 0);
  assert.ok((undone.warnings || []).some(text => /WhatsApp|Wix/i.test(text)));
});
