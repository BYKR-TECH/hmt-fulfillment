import assert from 'node:assert/strict';
import test from 'node:test';
import {
  courierCodeForTracking,
  fetchDelhiveryTracking,
  groupShipmentsByCourier,
  isDelhiveryInternationalWaybill,
  normalizeDelhiveryStatus
} from '../src/delhiveryTracking.js';

test('maps Delhivery Not Picked and cancelled statuses to cancelled', () => {
  assert.equal(normalizeDelhiveryStatus('Not Picked'), 'cancelled');
  assert.equal(normalizeDelhiveryStatus('Cancelled'), 'cancelled');
});

test('routes DL...CN international AWBs through Delhivery tracking', () => {
  assert.equal(isDelhiveryInternationalWaybill('DL343934225CN'), true);
  assert.equal(isDelhiveryInternationalWaybill('dl343934225cn'), true);
  assert.equal(isDelhiveryInternationalWaybill('AWB123'), false);

  assert.equal(
    courierCodeForTracking({
      waybill: 'DL343934225CN',
      courier_code: 'shiprocket'
    }),
    'delhivery'
  );
});

test('groups DL...CN AWBs with Delhivery even when courier code differs', () => {
  const grouped = groupShipmentsByCourier([
    { id: '1', waybill: 'DL343934225CN', courier_code: 'shiprocket' },
    { id: '2', waybill: 'SR123', courier_code: 'shiprocket' }
  ]);

  assert.equal(grouped.get('delhivery')[0].id, '1');
  assert.equal(grouped.get('shiprocket')[0].id, '2');
});

test('fetches Delhivery tracking and indexes waybills case-insensitively', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(
      JSON.stringify({
        ShipmentData: [
          {
            Shipment: {
              Waybill: 'dl343934225cn',
              Status: { Status: 'In Transit' },
              Scans: []
            }
          }
        ]
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const result = await fetchDelhiveryTracking(['DL343934225CN'], {
      delhivery: {
        trackingApiUrl: 'https://track.delhivery.com/api/v1/packages/json/',
        token: 'token-1'
      }
    });

    assert.equal(new URL(requests[0].url).searchParams.get('waybill'), 'DL343934225CN');
    assert.equal(requests[0].options.headers.Authorization, 'Token token-1');
    assert.equal(result.get('DL343934225CN').Status.Status, 'In Transit');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('tracking pass calls the status-change handler for every changed shipment', async () => {
  const { createDelhiveryTrackingSync } = await import('../src/delhiveryTracking.js');
  const config = {
    delhivery: { trackingEnabled: true, token: 'test-token', trackingBatchSize: 10, trackingIntervalMs: 900_000 },
    supabase: { url: 'http://supabase.test', serviceRoleKey: 'test-key' }
  };
  const shipments = [
    { id: 's1', order_id: 'o1', waybill: 'AWB1', courier_code: 'delhivery', status: 'booked' },
    { id: 's2', order_id: 'o2', waybill: 'AWB2', courier_code: 'delhivery', status: 'booked' }
  ];
  const updates = [];
  const changed = [];
  const sync = createDelhiveryTrackingSync(config, {
    logger: {},
    setTimer: () => null,
    clearTimer: () => null,
    listActiveShipmentWaybills: async () => shipments,
    saveTrackingEvents: async () => 0,
    updateShipmentTracking: async (id, patch) => updates.push({ id, status: patch.status }),
    fetchCourierTracking: async () => new Map([
      ['AWB1', { Status: { Status: 'Picked Up' } }],
      ['AWB2', { Status: { Status: 'Picked Up' } }]
    ]),
    onShipmentStatusChanged: async shipment => {
      changed.push(shipment.id);
      if (shipment.id === 's1') throw new Error('channel down');
    }
  });

  const result = await sync.run('test');

  assert.equal(result.lastError, null);
  assert.deepEqual(updates, [{ id: 's1', status: 'picked-up' }, { id: 's2', status: 'picked-up' }]);
  assert.deepEqual(changed, ['s1', 's2']);
  assert.equal(result.lastUpdated, 2);
  assert.match(result.lastWarnings[0], /status-update callback failed: channel down/);
});
