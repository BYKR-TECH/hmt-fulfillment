import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createBrowserConfig, createServerAuthConfig } from '../lib/supabase/server.js';
import { SUPABASE_AUTH_COOKIE_OPTIONS } from '../lib/supabase/auth-config.js';
import { createBrowserAuthClient } from '../lib/supabase/browser.js';

const saved = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
};

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('server auth prefers the private URL while browsers keep the public gateway', () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:8001';
  process.env.SUPABASE_ANON_KEY = 'private-anon';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ops.example/local-supabase';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon';

  assert.deepEqual(createServerAuthConfig(), { url: 'http://127.0.0.1:8001', anonKey: 'private-anon' });
  assert.deepEqual(createBrowserConfig(), { url: 'https://ops.example/local-supabase', anonKey: 'public-anon' });
});

test('browser auth uses a stable cookie name independent of the public URL', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ops.example/local-supabase';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon';

  const client = createBrowserAuthClient();

  assert.equal(client.auth.storageKey, SUPABASE_AUTH_COOKIE_OPTIONS.name);
  assert.equal(SUPABASE_AUTH_COOKIE_OPTIONS.name, 'sb-hmt-ops-auth-token');
});
