import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/build/swc');

function load(path, mocks) {
  const { code } = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    filename: path, jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' }
  });
  const exports = {};
  runInNewContext(code, { exports, require: name => mocks[name] || require(name) });
  return exports;
}

test('retired finance resources reject reads and writes without loading data', async () => {
  const api = load('../app/api/finance/[resource]/route.js', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/current-user': { requirePermission: async () => ({ id: 'operator' }) },
    '@/lib/finance/data': { financeOverview: async () => { throw new Error('Retired resource queried finance data'); } }
  });
  for (const resource of ['items', 'inventory', 'manufacturing', 'movements', 'boms', 'work-orders']) {
    const context = { params: Promise.resolve({ resource }) };
    assert.equal((await api.GET(null, context)).status, 404);
    assert.equal((await api.POST({ json: async () => ({}) }, context)).status, 404);
  }
});

test('finance overview queries only active finance tables', async () => {
  const queried = [];
  const db = { from(table) {
    queried.push(table);
    const query = { select: () => query, order: () => query, limit: async () => ({ data: [] }) };
    return query;
  } };
  const api = load('../lib/finance/data.js', {
    '@/lib/supabase/server': { createServiceClient: () => db },
    './calculations': { money: value => Number(value || 0) }
  });
  const overview = await api.financeOverview();
  assert.deepEqual(queried, ['finance_documents', 'bank_transactions', 'reimbursement_claims', 'vendors']);
  assert.equal(overview.items, undefined);
  assert.equal(overview.workOrders, undefined);
});
