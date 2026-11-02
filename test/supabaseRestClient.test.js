import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseRestClient } from '../src/supabase.js';

test('bulk tracking upsert ignores duplicates in one request', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify([{ id: 'new-event' }]), { status: 201 });
  };
  try {
    const client = new SupabaseRestClient({ supabase: { url: 'https://example.supabase.co', serviceRoleKey: 'secret' } });
    const rows = [{ shipment_id: 's1', occurred_at: '2026-11-03T00:00:00Z', event_status: 'Picked Up' }];
    const saved = await client.upsertManyIgnoreDuplicates('shipment_events', rows, 'shipment_id,occurred_at,event_status');
    assert.equal(saved.length, 1);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /on_conflict=shipment_id%2Coccurred_at%2Cevent_status/);
    assert.equal(calls[0].init.headers.Prefer, 'resolution=ignore-duplicates,return=representation');
    assert.deepEqual(JSON.parse(calls[0].init.body), rows);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
