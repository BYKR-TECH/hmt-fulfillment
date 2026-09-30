import test from 'node:test';
import assert from 'node:assert/strict';
import { ORDER_STATUSES, STATUS_FILTERS } from '../lib/crm/constants.js';
import { selectAutomationLane } from '../lib/crm/automation.js';

test('fulfilled is a selectable/filterable stage and cannot trigger another booking', () => {
  assert.ok(ORDER_STATUSES.includes('fulfilled'));
  assert.ok(STATUS_FILTERS.some(([key]) => key === 'fulfilled'));
  assert.deepEqual(selectAutomationLane({ payment_status: 'PAID', internal_status: 'fulfilled' }), {
    lane: 'skip', reason: 'terminal-status'
  });
});
