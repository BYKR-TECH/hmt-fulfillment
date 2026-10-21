/**
 * Order / shipment lifecycle ranking for backward-transition guards.
 * Used by updateOrder, undo, and tracking hold checks.
 */

const SHIPMENT_RANK = {
  'not-booked': 0,
  pending: 0,
  'pending-zone': 0,
  'pending-international': 0,
  booked: 10,
  'shipment-booked': 10,
  'pickup-pending': 20,
  'pickup-error': 20,
  'picked-up': 30,
  dispatched: 35,
  'in-transit': 40,
  'out-for-delivery': 50,
  delivered: 60,
  failed: 55,
  'failed-delivery': 55,
  'rto-initiated': 65,
  rto: 70,
  'rto-delivered': 75,
  cancelled: 80,
  canceled: 80,
  'lost-damaged': 80
};

const ORDER_RANK = {
  'not-paid': 5,
  new: 10,
  'details-verified': 15,
  'awaiting-packing': 20,
  packed: 30,
  'shipment-booked': 40,
  'pickup-pending': 45,
  'in-transit': 50,
  'out-for-delivery': 55,
  delivered: 60,
  'installation-pending': 70,
  'feedback-pending': 80,
  'issue-reported': 75,
  fulfilled: 85,
  'fulfilled-no-tracking': 85,
  completed: 90,
  'pending-international': 35,
  cancelled: 0,
  rto: 0,
  'rto-initiated': 0,
  'rto-delivered': 0,
  'lost-damaged': 0,
  'warranty-case': 0,
  'failed-delivery': 55
};

export function normalizeStatusKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .replaceAll(' ', '-');
}

export function shipmentStatusRank(value) {
  const key = normalizeStatusKey(value);
  return Object.prototype.hasOwnProperty.call(SHIPMENT_RANK, key) ? SHIPMENT_RANK[key] : null;
}

export function orderStatusRank(value) {
  const key = normalizeStatusKey(value);
  return Object.prototype.hasOwnProperty.call(ORDER_RANK, key) ? ORDER_RANK[key] : null;
}

/**
 * True when moving from a later lifecycle stage back to an earlier one.
 * Unknown statuses never force a confirm (avoid blocking novel values).
 */
export function isBackwardTransition(kind, from, to) {
  const fromKey = normalizeStatusKey(from);
  const toKey = normalizeStatusKey(to);
  if (!fromKey || !toKey || fromKey === toKey) return false;
  const fromRank = kind === 'shipment' ? shipmentStatusRank(fromKey) : orderStatusRank(fromKey);
  const toRank = kind === 'shipment' ? shipmentStatusRank(toKey) : orderStatusRank(toKey);
  if (fromRank == null || toRank == null) return false;
  return toRank < fromRank;
}

/**
 * Server-side guard for operator status edits / undo.
 * Backward moves require confirmBackward: true and a non-empty reason.
 */
export function assertStatusTransitionAllowed({ kind, from, to, confirmBackward = false, reason = '' } = {}) {
  const backward = isBackwardTransition(kind, from, to);
  if (!backward) return { ok: true, backward: false };
  if (!confirmBackward) {
    return {
      ok: false,
      code: 'confirm_backward_required',
      error: `Moving ${kind} status backward (${normalizeStatusKey(from)} → ${normalizeStatusKey(to)}) needs an explicit confirm and reason.`,
      from: normalizeStatusKey(from),
      to: normalizeStatusKey(to),
      backward: true
    };
  }
  if (!String(reason || '').trim()) {
    return {
      ok: false,
      code: 'reason_required',
      error: 'A reason is required for backward status changes.',
      from: normalizeStatusKey(from),
      to: normalizeStatusKey(to),
      backward: true
    };
  }
  return { ok: true, backward: true };
}

/**
 * After an operator undoes a pickup (or similar), tracking must not
 * immediately re-apply the same carrier status. Genuine further progress
 * (rank > revert_from) is allowed and clears the hold at the call site.
 */
export function shouldBlockTrackingAdvance(shipment, liveStatus) {
  const hold = shipment?.carrier_response?.ops_status_hold;
  if (!hold || hold.active === false) return false;
  if (hold.until) {
    const untilMs = Date.parse(hold.until);
    if (Number.isFinite(untilMs) && Date.now() > untilMs) return false;
  }
  const revertRank = shipmentStatusRank(hold.revert_from);
  const liveRank = shipmentStatusRank(liveStatus);
  if (revertRank == null || liveRank == null) return false;
  return liveRank <= revertRank;
}

export function buildOpsStatusHold({ revertFrom, previousOpsStatus, reason, hours = 72 } = {}) {
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  return {
    active: true,
    revert_from: normalizeStatusKey(revertFrom || 'picked-up'),
    previous_ops_status: normalizeStatusKey(previousOpsStatus || ''),
    reason: String(reason || 'operator-undo').trim() || 'operator-undo',
    set_at: new Date().toISOString(),
    until
  };
}

export { SHIPMENT_RANK, ORDER_RANK };
