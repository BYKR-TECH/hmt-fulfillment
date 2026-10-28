import test from 'node:test';
import assert from 'node:assert/strict';
import { can, canAccessOpsPath, permissionForOpsPath, ROLE_PERMISSIONS, roleOf } from '../lib/ops/permissions.ts';

const as = role => ({ active: true, role });

test('access is denied by default', () => {
  assert.equal(can(null, 'orders.view'), false);
  assert.equal(can({ active: false, role: 'admin' }, 'orders.view'), false);
  assert.equal(can(as('employee'), 'orders.view'), false); // finance-only legacy role
  assert.equal(can(as('made_up'), 'orders.view'), false);
  assert.equal(permissionForOpsPath('/ops/unknown-page'), null);
  assert.equal(canAccessOpsPath(as('admin'), '/ops/unknown-page'), false);
});

test('legacy roles map onto the rebuild roles', () => {
  assert.equal(roleOf(as('operations_manager')), 'ops_manager');
  assert.equal(roleOf(as('packing_operator')), 'shipping');
  assert.equal(roleOf(as('support_operator')), 'support');
  assert.equal(roleOf(as('accountant')), 'accounts');
});

test('roles get exactly what the spec gives them', () => {
  assert.equal(can(as('packing_operator'), 'shipping.book'), true);
  assert.equal(can(as('packing_operator'), 'settings.manage'), false);
  assert.equal(can(as('packing_operator'), 'shipping.cancel'), false);
  assert.equal(can(as('support_operator'), 'carts.edit'), true);
  assert.equal(can(as('support_operator'), 'shipping.book'), false);
  assert.equal(can(as('accountant'), 'gst.view'), true);
  assert.equal(can(as('accountant'), 'shipping.pickup'), false);
  assert.equal(can(as('viewer'), 'orders.edit'), false);
  assert.equal(can(as('operations_manager'), 'users.manage'), false);
  for (const permission of ROLE_PERMISSIONS.admin) assert.equal(can(as('admin'), permission), true);
});

test('every /ops page has a permission rule', () => {
  for (const path of ['/ops', '/ops/orders', '/ops/orders/abc', '/ops/booking', '/ops/pickup', '/ops/exceptions', '/ops/shipments', '/ops/carts', '/ops/gst', '/ops/automation', '/ops/settings']) {
    assert.notEqual(permissionForOpsPath(path), null, path);
  }
  assert.equal(canAccessOpsPath(as('support_operator'), '/ops/booking'), false);
  assert.equal(canAccessOpsPath(as('packing_operator'), '/ops/booking'), true);
});
