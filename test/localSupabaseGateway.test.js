import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localSupabaseTarget, proxyLocalSupabase } from '../app/local-supabase/[...path]/route.js';

test('local Supabase gateway allows only selected API services', () => {
  const env = { LOCAL_SUPABASE_URL: 'http://127.0.0.1:8001/' };
  assert.equal(
    localSupabaseTarget(['auth', 'v1', 'token'], '?grant_type=password', env).href,
    'http://127.0.0.1:8001/auth/v1/token?grant_type=password'
  );
  assert.equal(localSupabaseTarget(['rest', 'v1', 'orders'], '', env).href, 'http://127.0.0.1:8001/rest/v1/orders');
  assert.equal(localSupabaseTarget(['studio'], '', env), null);
  assert.equal(localSupabaseTarget(['functions', 'v1', 'run'], '', env), null);
  assert.equal(localSupabaseTarget(['auth', 'v2', 'token'], '', env), null);
});

test('local Supabase gateway rejects path traversal segments', () => {
  const target = localSupabaseTarget(['rest', 'v1', '..', 'auth', 'v1'], '', { LOCAL_SUPABASE_URL: 'http://127.0.0.1:8001' });
  assert.equal(target, null);
});

test('local Supabase gateway forwards requests without hop-by-hop headers', async () => {
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (target, options) => {
    captured = { target: target.href, options };
    return Response.json({ ok: true }, { status: 201, headers: { 'x-upstream': 'yes' } });
  };
  try {
    const request = {
      method: 'POST',
      nextUrl: { search: '?grant_type=password' },
      headers: new Headers({ apikey: 'anon', host: 'ops.example', connection: 'keep-alive', 'content-type': 'application/json' }),
      arrayBuffer: async () => new TextEncoder().encode('{"email":"admin@example.com"}').buffer
    };
    const response = await proxyLocalSupabase(request, { params: Promise.resolve({ path: ['auth', 'v1', 'token'] }) });
    assert.equal(captured.target, 'http://127.0.0.1:8001/auth/v1/token?grant_type=password');
    assert.equal(captured.options.headers.get('apikey'), 'anon');
    assert.equal(captured.options.headers.has('host'), false);
    assert.equal(captured.options.headers.has('connection'), false);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-upstream'), 'yes');
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    global.fetch = originalFetch;
  }
});
