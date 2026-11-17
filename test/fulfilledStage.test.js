import test from 'node:test';
import assert from 'node:assert/strict';
import { ORDER_STATUSES, STATUS_FILTERS, isTerminalOrderStatus, isValidOrderStatus } from '../lib/crm/constants.js';
import { selectAutomationLane } from '../lib/crm/automation.js';

test('fulfilled is a selectable/filterable stage and cannot trigger another booking', () => {
  assert.ok(ORDER_STATUSES.includes('fulfilled'));
  assert.ok(STATUS_FILTERS.some(([key]) => key === 'fulfilled'));
  assert.deepEqual(selectAutomationLane({ payment_status: 'PAID', internal_status: 'fulfilled' }), {
    lane: 'skip', reason: 'terminal-status'
  });
});

test('manual status controls accept known statuses and reject arbitrary values', () => {
  assert.equal(isValidOrderStatus('fulfilled'), true);
  assert.equal(isValidOrderStatus('cancelled'), true);
  assert.equal(isValidOrderStatus('made_up_status'), false);
  assert.equal(isTerminalOrderStatus('fulfilled'), true);
  assert.equal(isTerminalOrderStatus('fulfilled-no-tracking'), true);
  assert.equal(isTerminalOrderStatus('in_transit'), false);
});
