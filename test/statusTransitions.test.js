import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertStatusTransitionAllowed,
  buildOpsStatusHold,
  isBackwardTransition,
  normalizeStatusKey,
  orderStatusRank,
  shipmentStatusRank,
  shouldBlockTrackingAdvance
} from '../lib/crm/status-transitions.js';
import { shouldUpdateStatus } from '../src/delhiveryTracking.js';

test('normalizeStatusKey collapses underscores and case', () => {
  assert.equal(normalizeStatusKey('picked_up'), 'picked-up');
  assert.equal(normalizeStatusKey('IN_TRANSIT'), 'in-transit');
});

test('shipment and order ranks progress forward', () => {
  assert.ok(shipmentStatusRank('booked') < shipmentStatusRank('picked-up'));
  assert.ok(shipmentStatusRank('picked-up') < shipmentStatusRank('in-transit'));
  assert.ok(orderStatusRank('packed') < orderStatusRank('in-transit'));
  assert.ok(orderStatusRank('in-transit') < orderStatusRank('delivered'));
});

test('isBackwardTransition detects lifecycle regressions', () => {
  assert.equal(isBackwardTransition('shipment', 'picked-up', 'booked'), true);
  assert.equal(isBackwardTransition('shipment', 'booked', 'picked-up'), false);
  assert.equal(isBackwardTransition('order', 'in_transit', 'awaiting_packing'), true);
  assert.equal(isBackwardTransition('order', 'awaiting_packing', 'packed'), false);
  assert.equal(isBackwardTransition('order', 'delivered', 'delivered'), false);
});

test('assertStatusTransitionAllowed requires confirm + reason for backward moves', () => {
  const blocked = assertStatusTransitionAllowed({
    kind: 'shipment',
    from: 'picked-up',
    to: 'booked'
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'confirm_backward_required');

  const missingReason = assertStatusTransitionAllowed({
    kind: 'shipment',
    from: 'picked-up',
    to: 'booked',
    confirmBackward: true,
    reason: '  '
  });
  assert.equal(missingReason.ok, false);
  assert.equal(missingReason.code, 'reason_required');

  const allowed = assertStatusTransitionAllowed({
    kind: 'shipment',
    from: 'picked-up',
    to: 'booked',
    confirmBackward: true,
    reason: 'Accidental mark picked up'
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.backward, true);

  const forward = assertStatusTransitionAllowed({
    kind: 'shipment',
    from: 'booked',
    to: 'picked-up'
  });
  assert.equal(forward.ok, true);
  assert.equal(forward.backward, false);
});

test('ops status hold blocks re-apply of same carrier status but allows further progress', () => {
  const hold = buildOpsStatusHold({ revertFrom: 'picked-up', previousOpsStatus: 'booked', reason: 'undo' });
  const shipment = { status: 'booked', carrier_response: { ops_status_hold: hold } };
  assert.equal(shouldBlockTrackingAdvance(shipment, 'picked-up'), true);
  assert.equal(shouldBlockTrackingAdvance(shipment, 'booked'), true);
  assert.equal(shouldBlockTrackingAdvance(shipment, 'in-transit'), false);
  assert.equal(shouldUpdateStatus('booked', 'picked-up', shipment), false);
  assert.equal(shouldUpdateStatus('booked', 'in-transit', shipment), true);
});

test('inactive or expired holds do not block tracking', () => {
  const expired = {
    status: 'booked',
    carrier_response: {
      ops_status_hold: {
        active: true,
        revert_from: 'picked-up',
        until: new Date(Date.now() - 60_000).toISOString()
      }
    }
  };
  assert.equal(shouldBlockTrackingAdvance(expired, 'picked-up'), false);

  const inactive = {
    status: 'booked',
    carrier_response: {
      ops_status_hold: { active: false, revert_from: 'picked-up' }
    }
  };
  assert.equal(shouldBlockTrackingAdvance(inactive, 'picked-up'), false);
});
