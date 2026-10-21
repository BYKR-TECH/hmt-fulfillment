/**
 * Record operator status changes and undo the latest undoable one.
 * Reuses status_history (extended by migration 20261008231500 when applied).
 * Never recalls WhatsApp; optionally clears the Ops dedupe note so a future
 * genuine pickup can send shipment_confirmation again.
 */
import { createServiceClient } from '../supabase/server.js';
import {
  assertStatusTransitionAllowed,
  buildOpsStatusHold,
  isBackwardTransition,
  normalizeStatusKey
} from './status-transitions.js';

export const UNDOABLE_ACTIONS = new Set([
  'mark_picked_up',
  'order_status_change',
  'shipment_status_change'
]);

const ORDER_SNAPSHOT_FIELDS = [
  'internal_status',
  'shipment_status',
  'fulfillment_status',
  'wix_fulfillment_status',
  'wix_fulfillment_id',
  'wix_fulfillment_error',
  'courier',
  'awb_number',
  'tracking_url',
  'last_message_type',
  'last_communication_at'
];

const SHIPMENT_SNAPSHOT_FIELDS = ['status', 'waybill', 'courier_code', 'tracking_url'];

export function pickOrderSnapshot(row = {}) {
  return Object.fromEntries(ORDER_SNAPSHOT_FIELDS.map(key => [key, row[key] ?? null]));
}

export function pickShipmentSnapshot(row = {}) {
  if (!row || !row.id) return null;
  return {
    id: row.id,
    ...Object.fromEntries(SHIPMENT_SNAPSHOT_FIELDS.map(key => [key, row[key] ?? null]))
  };
}

export function parseHistorySnapshot(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function describeSideEffects(sideEffects = {}) {
  const parts = [];
  if (sideEffects.whatsapp_sent) parts.push('WhatsApp shipment confirmation was already sent (cannot be recalled)');
  if (sideEffects.wix_fulfilled) parts.push('Wix fulfillment cannot be cleanly un-done — clear it in Wix admin if needed');
  if (sideEffects.woo_writeback) parts.push('WooCommerce _hmt_shipment_status may have been updated');
  return parts;
}

/**
 * Insert a status_history row. Works with or without the undo migration columns
 * by falling back to JSON in old_value / new_value / notes.
 */
export async function recordStatusChange(supabase, {
  orderId,
  shipmentId = null,
  action,
  before,
  after,
  actorName = 'Operator',
  actorUserId = null,
  reason = '',
  confirmBackward = false,
  sideEffects = {},
  undoesHistoryId = null
} = {}) {
  if (!supabase || !orderId || !action) return { ok: false, error: 'Missing status-history inputs.' };

  const payload = {
    order_id: orderId,
    field_name: `status_change:${action}`,
    old_value: JSON.stringify(before || {}),
    new_value: JSON.stringify(after || {}),
    notes: reason || `Operator ${action.replaceAll('_', ' ')}`,
    actor_name: actorName,
    actor_user_id: actorUserId || null,
    shipment_id: shipmentId || null,
    action,
    side_effects: sideEffects || {},
    confirm_backward: Boolean(confirmBackward),
    reason: reason || null,
    undoes_history_id: undoesHistoryId || null
  };

  let result = await supabase.from('status_history').insert(payload).select('*').single();
  if (!result.error) return { ok: true, row: result.data };

  if (isMissingColumnError(result.error)) {
    const legacy = {
      order_id: orderId,
      field_name: `status_change:${action}`,
      old_value: JSON.stringify({
        ...(before || {}),
        __meta: {
          action,
          shipment_id: shipmentId,
          side_effects: sideEffects,
          confirm_backward: confirmBackward,
          undoes_history_id: undoesHistoryId
        }
      }),
      new_value: JSON.stringify(after || {}),
      notes: [
        reason || `Operator ${action.replaceAll('_', ' ')}`,
        sideEffects && Object.keys(sideEffects).length ? `side_effects=${JSON.stringify(sideEffects)}` : ''
      ].filter(Boolean).join(' | '),
      actor_name: actorName,
      actor_user_id: actorUserId || null
    };
    result = await supabase.from('status_history').insert(legacy).select('*').single();
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, row: result.data, legacy: true };
  }
  return { ok: false, error: result.error.message };
}

function isMissingColumnError(error) {
  return Boolean(
    error &&
      (error.code === '42703' ||
        error.code === 'PGRST204' ||
        /column .* does not exist|could not find .* column|schema cache/i.test(error.message || ''))
  );
}

export function historyAction(row) {
  if (!row) return '';
  if (row.action) return String(row.action);
  const field = String(row.field_name || '');
  if (field.startsWith('status_change:')) return field.slice('status_change:'.length);
  const meta = parseHistorySnapshot(row.old_value)?.__meta;
  return meta?.action || '';
}

export function isUndoableHistoryRow(row) {
  if (!row || row.undone_at) return false;
  const action = historyAction(row);
  if (action === 'undo') return false;
  return UNDOABLE_ACTIONS.has(action);
}

export async function getLastUndoableStatusChange(supabase, orderId) {
  if (!supabase || !orderId) return null;
  const { data, error } = await supabase
    .from('status_history')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  const rows = data || [];
  const undoneIds = new Set(
    rows
      .map(row => {
        if (row.undoes_history_id) return row.undoes_history_id;
        if (historyAction(row) === 'undo') {
          return parseHistorySnapshot(row.old_value)?.__meta?.undoes_history_id
            || parseHistorySnapshot(row.new_value)?.__meta?.undoes_history_id
            || null;
        }
        const side = row.side_effects || parseHistorySnapshot(row.old_value)?.__meta?.side_effects;
        return side?.undoes || null;
      })
      .filter(Boolean)
  );
  for (const row of rows) {
    if (undoneIds.has(row.id)) continue;
    if (!isUndoableHistoryRow(row)) continue;
    return row;
  }
  return null;
}

export async function undoLastStatusChange(orderId, options = {}) {
  const supabase = options.db || createServiceClient();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const reason = String(options.reason || '').trim();
  const confirmBackward = options.confirmBackward === true;
  const clearWhatsAppDedupe = options.clearWhatsAppDedupe !== false;
  const actorName = options.actorName || 'Operator';

  const history = await getLastUndoableStatusChange(supabase, orderId);
  if (!history) return { ok: false, error: 'No undoable operator status change found for this order.' };

  const before = parseHistorySnapshot(history.old_value) || {};
  const after = parseHistorySnapshot(history.new_value) || {};
  const meta = before.__meta || {};
  const action = historyAction(history);
  const shipmentId = history.shipment_id || meta.shipment_id || before.shipment?.id || null;
  const sideEffects = history.side_effects || meta.side_effects || {};

  const orderBefore = before.order || before;
  const orderAfter = after.order || after;
  const shipmentBefore = before.shipment || null;
  const shipmentAfter = after.shipment || null;

  const fromStatus = orderAfter.internal_status || orderAfter.shipment_status || shipmentAfter?.status;
  const toStatus = orderBefore.internal_status || orderBefore.shipment_status || shipmentBefore?.status;

  if (!confirmBackward) {
    return {
      ok: false,
      code: 'confirm_backward_required',
      error: `Undo ${action} (${normalizeStatusKey(fromStatus)} → ${normalizeStatusKey(toStatus)}) needs confirmBackward: true and a reason.`,
      history_id: history.id,
      action,
      from: fromStatus,
      to: toStatus,
      warnings: describeSideEffects(sideEffects)
    };
  }
  if (!reason) {
    return {
      ok: false,
      code: 'reason_required',
      error: 'A reason is required to undo a status change.',
      history_id: history.id,
      action
    };
  }

  const warnings = describeSideEffects(sideEffects);
  const now = new Date().toISOString();

  const orderRestore = pickOrderSnapshot(orderBefore);
  // Leave Wix fulfillment identity alone — cannot cleanly un-fulfill from Ops.
  delete orderRestore.wix_fulfillment_status;
  delete orderRestore.wix_fulfillment_id;
  delete orderRestore.wix_fulfillment_error;
  delete orderRestore.fulfillment_status;
  orderRestore.updated_at = now;

  const { error: orderError } = await supabase.from('orders').update(orderRestore).eq('id', orderId);
  if (orderError) return { ok: false, error: orderError.message };

  let restoredShipment = null;
  if (shipmentId && shipmentBefore) {
    const { data: currentShipment } = await supabase
      .from('shipments')
      .select('id,status,carrier_response,waybill,courier_code,tracking_url')
      .eq('id', shipmentId)
      .eq('order_id', orderId)
      .maybeSingle();

    const carrierResponse = {
      ...(currentShipment?.carrier_response || {}),
      ops_status_hold: buildOpsStatusHold({
        revertFrom: shipmentAfter?.status || after.shipment?.status || 'picked-up',
        previousOpsStatus: shipmentBefore.status,
        reason
      })
    };

    const { data: updatedShipment, error: shipmentError } = await supabase
      .from('shipments')
      .update({
        status: shipmentBefore.status,
        carrier_response: carrierResponse,
        updated_at: now
      })
      .eq('id', shipmentId)
      .select('*')
      .single();
    if (shipmentError) return { ok: false, error: shipmentError.message };
    restoredShipment = updatedShipment;
  }

  let whatsappDedupe = null;
  if (action === 'mark_picked_up' && clearWhatsAppDedupe) {
    whatsappDedupe = await clearShipmentConfirmationDedupe(
      supabase,
      orderId,
      shipmentBefore?.waybill || shipmentAfter?.waybill
    );
  } else if (action === 'mark_picked_up' && !clearWhatsAppDedupe) {
    whatsappDedupe = {
      skipped: true,
      reason: 'dedupe-kept',
      note: 'Future real pickup WhatsApp may stay blocked by automation:whatsapp:shipment-confirmation:<awb> until cleared.'
    };
    warnings.push(whatsappDedupe.note);
  }

  let wooWriteback = null;
  if (sideEffects.woo_writeback || options.forceWooWriteback) {
    try {
      wooWriteback = await writeWooRevertedStatus(orderId, restoredShipment || shipmentBefore, orderBefore, options);
      if (wooWriteback?.ok === false) warnings.push(`Woo write-back failed: ${wooWriteback.error}`);
    } catch (error) {
      wooWriteback = { ok: false, error: error.message };
      warnings.push(`Woo write-back failed: ${error.message}`);
    }
  }

  if (sideEffects.wix_fulfilled) {
    warnings.push('Wix fulfillment was left as-is (cannot be recalled from Ops).');
  }
  if (sideEffects.whatsapp_sent) {
    warnings.push('Customer WhatsApp was not recalled.');
  }

  // Best-effort mark original undone (column may not exist pre-migration).
  const markUndone = await supabase.from('status_history').update({ undone_at: now }).eq('id', history.id);
  if (markUndone?.error && !isMissingColumnError(markUndone.error)) {
    warnings.push(`Could not mark history undone: ${markUndone.error.message}`);
  }

  const undoRecord = await recordStatusChange(supabase, {
    orderId,
    shipmentId,
    action: 'undo',
    before: after,
    after: {
      order: orderRestore,
      shipment: restoredShipment ? pickShipmentSnapshot(restoredShipment) : shipmentBefore,
      __meta: { undoes_history_id: history.id }
    },
    actorName,
    reason: `Undo ${action}: ${reason}`,
    confirmBackward: true,
    sideEffects: {
      undoes: history.id,
      whatsapp_dedupe: whatsappDedupe,
      woo_writeback: wooWriteback,
      warnings
    },
    undoesHistoryId: history.id
  });

  return {
    ok: true,
    action: 'undo',
    undone_action: action,
    history_id: history.id,
    undo_history_id: undoRecord.row?.id || null,
    shipment: restoredShipment,
    whatsapp_dedupe: whatsappDedupe,
    woo_writeback: wooWriteback,
    warnings,
    message: warnings.length
      ? `Reverted Ops status. Notes: ${warnings.join(' ')}`
      : `Reverted Ops status from ${normalizeStatusKey(fromStatus)} to ${normalizeStatusKey(toStatus)}.`
  };
}

async function clearShipmentConfirmationDedupe(supabase, orderId, waybill) {
  const awb = String(waybill || '').trim();
  if (!awb) return { skipped: true, reason: 'no-waybill' };
  const marker = `automation:whatsapp:shipment-confirmation:${awb}`;
  const notesDelete = await supabase
    .from('notes')
    .delete()
    .eq('order_id', orderId)
    .eq('note_type', 'automation')
    .eq('body', marker);
  let eventsCleared = false;
  try {
    const eventsDelete = await supabase.from('message_events').delete().eq('dedupe_key', marker);
    eventsCleared = !eventsDelete?.error;
  } catch {
    eventsCleared = false;
  }
  return {
    ok: !notesDelete?.error,
    marker,
    notes_cleared: !notesDelete?.error,
    events_cleared: eventsCleared,
    error: notesDelete?.error?.message || null
  };
}

async function writeWooRevertedStatus(orderId, shipment, orderBefore, options = {}) {
  const { findOrderById } = await import('@/src/store.js');
  const { getConfig } = await import('@/src/config.js');
  const { getCrmSettings } = await import('./data-settings.js');
  const { applyCrmSettingsToConfig } = await import('./settings.js');
  const { syncShipmentTrackingToWoo, isWooCommerceOrder } = await import('@/src/wooShipmentSync.js');

  const order = (await findOrderById(orderId)) || { id: orderId, ...orderBefore };
  if (!isWooCommerceOrder(order)) return { skipped: true, reason: 'not-woo-order' };
  const config = applyCrmSettingsToConfig(getConfig(), await getCrmSettings());
  const status = normalizeStatusKey(shipment?.status || orderBefore.shipment_status || 'booked').replaceAll('-', '_');
  return syncShipmentTrackingToWoo(order, shipment || { waybill: order.awb_number, status }, config, {
    shipmentStatus: status,
    fetchImpl: options.fetchImpl
  });
}

export function detectOrderBackwardFields(current = {}, patch = {}) {
  const changes = [];
  if (patch.internal_status != null && patch.internal_status !== '' && patch.internal_status !== current.internal_status) {
    if (isBackwardTransition('order', current.internal_status, patch.internal_status)) {
      changes.push({
        field: 'internal_status',
        kind: 'order',
        from: current.internal_status,
        to: patch.internal_status
      });
    }
  }
  if (patch.shipment_status != null && patch.shipment_status !== '' && patch.shipment_status !== current.shipment_status) {
    if (isBackwardTransition('shipment', current.shipment_status, patch.shipment_status)) {
      changes.push({
        field: 'shipment_status',
        kind: 'shipment',
        from: current.shipment_status,
        to: patch.shipment_status
      });
    }
  }
  return changes;
}

export { isBackwardTransition, assertStatusTransitionAllowed };
