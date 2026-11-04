import assert from 'node:assert/strict';
import test from 'node:test';
import { runAmazonOrderSync } from '../lib/crm/amazon-sync.js';

test('runs Amazon sync in mock/demo mode only when explicitly enabled', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });

    // Stub Supabase queries
    if (String(url).includes('/rest/v1/customers') && options.method === 'POST') {
      return jsonResponse({ id: 'cust-1', email: 'sneha@example.com' });
    }
    if (String(url).includes('/rest/v1/customers') && (options.method || 'GET') === 'GET') {
      return jsonResponse([]);
    }
    if (String(url).includes('/rest/v1/customer_addresses') && options.method === 'POST') {
      return jsonResponse({ id: 'addr-1' });
    }
    if (String(url).includes('/rest/v1/orders') && (options.method || 'GET') === 'GET') {
      return jsonResponse([]);
    }
    if (String(url).includes('/rest/v1/orders') && options.method === 'POST') {
      return jsonResponse({ id: 'order-1', external_order_id: 'AMZ-mock' });
    }
    if (String(url).includes('/rest/v1/order_items') && options.method === 'POST') {
      return jsonResponse({ id: 'item-1' });
    }
    if (String(url).includes('/rest/v1/inventory_items') && options.method === 'POST') {
      return jsonResponse({ sku: 'HMT-390-ADV-KIT' });
    }
    if (String(url).includes('/rest/v1/payment_refs') && options.method === 'POST') {
      return jsonResponse({ id: 'pay-1' });
    }
    if (String(url).includes('/rest/v1/audit_log') && options.method === 'POST') {
      return jsonResponse({ id: 'audit-1' });
    }
    throw new Error(`Unexpected request ${options.method || 'GET'} ${url}`);
  };
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

  // Ensure LWA credentials are empty
  const oldClientId = process.env.AMAZON_SP_API_CLIENT_ID;
  const oldClientSecret = process.env.AMAZON_SP_API_CLIENT_SECRET;
  const oldRefreshToken = process.env.AMAZON_SP_API_REFRESH_TOKEN;
  const oldSyncEnabled = process.env.AMAZON_ORDER_SYNC_ENABLED;
  const oldDemoMode = process.env.AMAZON_DEMO_MODE;
  delete process.env.AMAZON_SP_API_CLIENT_ID;
  delete process.env.AMAZON_SP_API_CLIENT_SECRET;
  delete process.env.AMAZON_SP_API_REFRESH_TOKEN;
  process.env.AMAZON_ORDER_SYNC_ENABLED = 'true';
  process.env.AMAZON_DEMO_MODE = 'true';

  try {
    const result = await runAmazonOrderSync({ reason: 'manual', force: true });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'demo');
    assert.equal(result.pulled, 1);
    assert.equal(result.persisted, 1);

    const customerPost = requests.find(r => r.url.includes('/rest/v1/customers') && r.method === 'POST');
    const orderPost = requests.find(r => r.url.includes('/rest/v1/orders') && r.method === 'POST');
    const addressPosts = requests.filter(r => r.url.includes('/rest/v1/customer_addresses') && r.method === 'POST');
    assert.equal(customerPost.body.email, 'sneha@example.com');
    assert.ok(orderPost.body.external_order_id.startsWith('AMZ-406-'));
    assert.deepEqual(addressPosts.map(request => request.body.address_type), ['shipping', 'billing']);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (oldClientId !== undefined) process.env.AMAZON_SP_API_CLIENT_ID = oldClientId;
    if (oldClientSecret !== undefined) process.env.AMAZON_SP_API_CLIENT_SECRET = oldClientSecret;
    if (oldRefreshToken !== undefined) process.env.AMAZON_SP_API_REFRESH_TOKEN = oldRefreshToken;
    if (oldSyncEnabled === undefined) delete process.env.AMAZON_ORDER_SYNC_ENABLED;
    else process.env.AMAZON_ORDER_SYNC_ENABLED = oldSyncEnabled;
    if (oldDemoMode === undefined) delete process.env.AMAZON_DEMO_MODE;
    else process.env.AMAZON_DEMO_MODE = oldDemoMode;
  }
});

test('skips Amazon sync without creating demo data when disabled', async () => {
  const originalFetch = globalThis.fetch;
  const oldSyncEnabled = process.env.AMAZON_ORDER_SYNC_ENABLED;
  const oldDemoMode = process.env.AMAZON_DEMO_MODE;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error('Amazon sync should not make requests while disabled.');
  };
  delete process.env.AMAZON_ORDER_SYNC_ENABLED;
  delete process.env.AMAZON_DEMO_MODE;
  try {
    const result = await runAmazonOrderSync({ reason: 'automation', force: true });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'disabled');
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldSyncEnabled === undefined) delete process.env.AMAZON_ORDER_SYNC_ENABLED;
    else process.env.AMAZON_ORDER_SYNC_ENABLED = oldSyncEnabled;
    if (oldDemoMode === undefined) delete process.env.AMAZON_DEMO_MODE;
    else process.env.AMAZON_DEMO_MODE = oldDemoMode;
  }
});

test('skips Amazon sync when enabled without credentials unless demo mode is explicit', async () => {
  const originalFetch = globalThis.fetch;
  const oldSyncEnabled = process.env.AMAZON_ORDER_SYNC_ENABLED;
  const oldDemoMode = process.env.AMAZON_DEMO_MODE;
  const oldClientId = process.env.AMAZON_SP_API_CLIENT_ID;
  const oldClientSecret = process.env.AMAZON_SP_API_CLIENT_SECRET;
  const oldRefreshToken = process.env.AMAZON_SP_API_REFRESH_TOKEN;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error('Amazon sync should not create demo data implicitly.');
  };
  process.env.AMAZON_ORDER_SYNC_ENABLED = 'true';
  delete process.env.AMAZON_DEMO_MODE;
  delete process.env.AMAZON_SP_API_CLIENT_ID;
  delete process.env.AMAZON_SP_API_CLIENT_SECRET;
  delete process.env.AMAZON_SP_API_REFRESH_TOKEN;
  try {
    const result = await runAmazonOrderSync({ reason: 'automation', force: true });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'missing-amazon-config');
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv('AMAZON_ORDER_SYNC_ENABLED', oldSyncEnabled);
    restoreEnv('AMAZON_DEMO_MODE', oldDemoMode);
    restoreEnv('AMAZON_SP_API_CLIENT_ID', oldClientId);
    restoreEnv('AMAZON_SP_API_CLIENT_SECRET', oldClientSecret);
    restoreEnv('AMAZON_SP_API_REFRESH_TOKEN', oldRefreshToken);
  }
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
    json: async () => payload
  };
}
