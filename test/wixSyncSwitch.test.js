import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/build/swc');
const source = readFileSync(new URL('../lib/crm/wix-sync.js', import.meta.url), 'utf8');
const { code } = transformSync(source, {
  filename: 'wix-sync.js',
  jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
  module: { type: 'commonjs' }
});

test('disabled Wix order sync skips even forced CRM and automation requests', async () => {
  for (const value of [undefined, 'false']) {
    const exports = {};
    runInNewContext(code, {
      exports,
      require: name => {
        if (name === '@/lib/supabase/server') return { createServiceClient: () => null };
        throw new Error(`Unexpected import: ${name}`);
      },
      process: { env: { WIX_ORDER_SYNC_ENABLED: value } },
      Date,
      Math,
      Number,
      String,
      Boolean
    });
    for (const reason of ['crm-open', 'automation', 'manual']) {
      const result = await exports.runWixOrderSync({ reason, force: true });
      assert.equal(result.ok, true);
      assert.equal(result.skipped, true);
      assert.equal(result.reason, 'disabled');
    }
  }
});
