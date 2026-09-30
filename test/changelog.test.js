import test from 'node:test';
import assert from 'node:assert/strict';
import { getChangelog } from '../lib/changelog.js';

test('changelog includes only merged main PRs, newest first', async () => {
  const result = await getChangelog(async () => ({ ok: true, json: async () => [
    { number: 1, title: 'First', body: 'Changed shipping', merged_at: '2026-09-01', base: { ref: 'main' } },
    { number: 2, title: 'Closed', merged_at: null, base: { ref: 'main' } },
    { number: 3, title: 'Latest', merged_at: '2026-10-01', base: { ref: 'main' } }
  ] }));
  assert.deepEqual(result.entries.map(e => e.number), [3, 1]);
  assert.equal(result.entries[1].description, 'Changed shipping');
});

test('changelog handles GitHub outage without crashing the page', async () => {
  const result = await getChangelog(async () => ({ ok: false }));
  assert.deepEqual(result.entries, []);
  assert.ok(result.error);
});
