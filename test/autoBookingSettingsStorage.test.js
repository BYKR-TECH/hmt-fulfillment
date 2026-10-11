import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as settings from '../lib/crm/settings.js';
import { hasPermission, permissionForPath } from '../lib/access-control.js';
const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/build/swc');
const { code } = transformSync(readFileSync(new URL('../lib/crm/data-settings.js', import.meta.url), 'utf8'), {
  filename: 'data-settings.js', jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' }
});
function harness() {
  const writes = [];
  const client = { from(table) { return { upsert: async row => { writes.push({ table, row }); return { error: null }; } }; } };
  const exports = {};
  runInNewContext(code, { exports, Date, Object, console, require: name => {
    if (name === '@/lib/supabase/server') return { createServiceClient: () => client };
    if (name === './settings') return settings;
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return { writes, save: exports.saveCrmSettings };
}
const payload = { auto_booking_enabled: 'on', auto_booking_pickup_location: 'Sis Vars', auto_booking_domestic_mode: 'express', auto_booking_international_courier: 'delhivery', auto_booking_international_mode: 'dlv_premium', auto_booking_weightGrams: '400', auto_booking_lengthCm: '23', auto_booking_widthCm: '14', auto_booking_heightCm: '6', auto_booking_sources: 'wix', auto_booking_require_paid: 'on', auto_booking_skip_hold: 'on', auto_booking_max_value: '' };
test('settings save stores typed auto-booking with server actor and timestamp', async () => {
  const h = harness(); const result = await h.save(payload, { id: 'operator-profile' });
  assert.equal(result.ok, true);
  const row = h.writes.find(write => write.row.key === 'auto_booking').row;
  assert.equal(row.updated_by, 'operator-profile');
  assert.ok(Number.isFinite(Date.parse(row.updated_at)));
  assert.equal(row.value.package.weightGrams, 400);
  assert.equal(row.value.international.serviceMode, 'dlv_premium');
});
test('invalid booking settings cause no writes; older forms do not seed booking settings', async () => {
  const invalid = harness();
  assert.equal((await invalid.save({ ...payload, auto_booking_international_mode: 'dlv_saver' })).ok, false);
  assert.equal(invalid.writes.length, 0);
  const legacy = harness();
  assert.equal((await legacy.save({})).ok, true);
  assert.equal(legacy.writes.some(write => write.row.key === 'auto_booking'), false);
});
test('settings API follows settings permissions rather than dashboard permissions', () => {
  assert.equal(permissionForPath('/api/crm/settings', 'POST'), 'settings.manage');
  assert.equal(permissionForPath('/api/crm/settings', 'GET'), 'settings.view');
  assert.equal(hasPermission({ active: true, role: 'viewer' }, 'settings.manage'), false);
  assert.equal(hasPermission({ active: true, role: 'operations_manager' }, 'settings.manage'), true);
});
