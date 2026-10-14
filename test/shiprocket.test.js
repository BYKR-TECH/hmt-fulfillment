import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelShiprocketOrder, createShiprocketShipment, getShiprocketRates, mapOrderToShiprocket } from '../src/shiprocket.js';

function config() {
  return {
    shiprocket: {
      baseUrl: 'https://example.test/v1/external',
      token: 'token',
      pickupLocation: 'Primary',
      pickupPincode: '560001',
      returnName: 'Warehouse',
      returnAddress: '1 Warehouse Road',
      returnCity: 'Bengaluru',
      returnState: 'Karnataka',
      returnPincode: '560001',
      returnPhone: '9999999999'
    },
    delhivery: {},
    defaults: { paymentMode: 'Prepaid', weightGrams: 400, lengthCm: 23, widthCm: 14, heightCm: 6, hsnCode: '8512' }
  };
}

test('normalizes Shiprocket serviceability quotes with price and delivery estimate', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    if (String(url).endsWith('/settings/company/pickup')) return new Response(JSON.stringify({ data: { shipping_address: [{ pickup_location: 'Primary', pin_code: '560001' }] } }));
    assert.match(String(url), /pickup_postcode=560001/);
    assert.match(String(url), /delivery_postcode=110001/);
    return new Response(JSON.stringify({ currency: 'INR', data: { available_courier_companies: [{ courier_company_id: 42, courier_name: 'Fast Air', rate: 125.5, etd: '2026-10-03', estimated_delivery_days: '3', rating: 4.8 }] } }), { status: 200 });
  };
  try {
    const quotes = await getShiprocketRates({ deliveryPincode: '110001', weightGrams: 400 }, config());
    assert.equal(quotes[0].courierId, 42);
    assert.equal(quotes[0].courierName, 'Fast Air');
    assert.equal(quotes[0].rate, 125.5);
    assert.equal(quotes[0].estimatedDeliveryDate, '2026-10-03');
  } finally { global.fetch = originalFetch; }
});

test('fetches every international Shiprocket courier and normalizes nested rates', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    if (String(url).endsWith('/settings/company/pickup')) return new Response(JSON.stringify({ data: { shipping_address: [{ pickup_location: 'Primary', pin_code: '560001' }] } }));
    const requestUrl = String(url);
    assert.match(requestUrl, /\/international\/courier\/serviceability/);
    assert.match(requestUrl, /delivery_country=US/);
    assert.match(requestUrl, /pickup_postcode=560001/);
    assert.match(requestUrl, /cod=0/);
    assert.doesNotMatch(requestUrl, /delivery_postcode/);
    return new Response(JSON.stringify({ currency: '', data: { available_courier_companies: [
      { courier_company_id: 140, courier_name: 'SRX Premium', rate: { rate: '108.01' }, etd: 'Oct 10 - Oct 15', estimated_delivery_days: '10 - 15', is_international: 1 },
      { courier_company_id: 326, courier_name: 'India Post EMS', rate: { rate: 2330.6, total: 2340.6 }, estimated_delivery_days: '4 - 7', is_international: 1 }
    ] } }), { status: 200 });
  };
  try {
    const quotes = await getShiprocketRates({ deliveryCountry: 'US', weightGrams: 400 }, config());
    assert.equal(quotes.length, 2);
    assert.equal(quotes[0].rate, 108.01);
    assert.equal(quotes[1].rate, 2340.6);
    assert.equal(quotes.every(quote => quote.international), true);
  } finally { global.fetch = originalFetch; }
});

test('maps a forward order and books the selected Shiprocket courier', async () => {
  const payload = mapOrderToShiprocket({ id: 'wix-1', number: '1001', buyerInfo: { email: 'buyer@example.com' }, lineItems: [{ productName: { original: 'Light kit' }, quantity: 1, price: { amount: 2500 } }] }, config(), {
    courierId: 42,
    pickupLocation: 'Primary',
    deliveryOverride: { contact: { firstName: 'Asha', lastName: 'Rao', phone: '9876543210' }, address: { addressLine: '2 Main Road', city: 'Delhi', subdivision: 'Delhi', country: 'IN', postalCode: '110001' } }
  });
  assert.equal(payload.shipment.billing_customer_name, 'Asha');
  assert.equal(payload.shipment.is_insurance_opt, false);
  assert.equal(payload.courier_id, 42);

  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).includes('/orders/show/')) return Response.json({ data: { order_insurance: { insurance_status: 'No' } } });
    if (String(url).endsWith('/settings/company/pickup')) return new Response(JSON.stringify({ data: { shipping_address: [{ pickup_location: 'Primary', pin_code: '560001' }] } }));
    if (String(url).endsWith('/orders/create/adhoc')) return new Response(JSON.stringify({ order_id: 10, shipment_id: 20 }), { status: 200 });
    if (String(url).endsWith('/courier/assign/awb')) {
      assert.equal(JSON.parse(options.body).courier_id, 42);
      return new Response(JSON.stringify({ response: { data: { awb_code: 'SR123' } } }), { status: 200 });
    }
    if (String(url).endsWith('/courier/generate/label')) return new Response(JSON.stringify({ label_url: 'https://example.test/label.pdf' }), { status: 200 });
    return new Response(JSON.stringify({ pickup_status: 1 }), { status: 200 });
  };
  try {
    const booked = await createShiprocketShipment(payload, config());
    assert.equal(booked.waybill, 'SR123');
    assert.equal(booked.label_url, 'https://example.test/label.pdf');
  } finally { global.fetch = originalFetch; }
});

test('reuses a Shiprocket order after a wallet failure and confirms pickup on retry', async () => {
  const payload = mapOrderToShiprocket({ number: '11052-2', billing: { email: 'buyer@example.test' }, line_items: [{ name: 'Kit', sku: 'KIT', quantity: 1, price: 100 }] }, config(), {
    courierId: 1, pickupLocation: 'Sis Vars', deliveryOverride: { contact: { firstName: 'Buyer', phone: '9999999999' }, address: { addressLine: 'Road', city: 'Mumbai', subdivision: 'MH', country: 'IN', postalCode: '400079' } }
  });
  const originalFetch = global.fetch;
  let recharge = false;
  global.fetch = async (url, options) => {
    const path = String(url);
    if (path.includes('/orders/show/')) return Response.json({ data: { order_insurance: { insurance_status: 'No' } } });
    if (path.endsWith('/settings/company/pickup')) return Response.json({ data: { shipping_address: [{ pickup_location: 'Sid Vars', pin_code: '560093' }] } });
    if (path.includes('/orders?search=')) return Response.json({ data: [{ id: 10, channel_order_id: '11052-2', shipments: [{ id: 20, awb: '' }] }] });
    assert.equal(path.includes('/orders/create/'), false, 'must not create a duplicate order');
    if (path.endsWith('/courier/assign/awb')) {
      assert.deepEqual(JSON.parse(options.body), { shipment_id: 20, courier_id: 1 });
      return Response.json(recharge ? { response: { data: { awb_code: 'BD123', courier_name: 'Blue Dart Air' } } } : { awb_assign_status: 0, message: 'Recharge wallet' });
    }
    if (path.endsWith('/courier/generate/pickup')) return Response.json({ pickup_status: 1, response: { pickup_scheduled_date: '2026-10-14' } });
    return Response.json({ label_url: 'https://example.test/label.pdf' });
  };
  try {
    await assert.rejects(createShiprocketShipment(payload, config()), error => error.message === 'Recharge wallet' && error.carrierResponse.create_response.shipment_id === 20);
    recharge = true;
    const booked = await createShiprocketShipment(payload, config());
    assert.equal(booked.waybill, 'BD123');
    assert.equal(booked.pickup_confirmed, true);
    assert.equal(booked.pickup_location, 'Sid Vars');
    assert.equal(booked.courier_name, 'Blue Dart Air');
  } finally { global.fetch = originalFetch; }
});

test('cancellation verifies pre-pickup state and requires carrier confirmation', async () => {
  const originalFetch = global.fetch;
  let status = 'PICKUP SCHEDULED';
  let confirmed = false;
  let cancellations = 0;
  global.fetch = async (url, options) => {
    if (String(url).includes('/orders/show/')) return Response.json({ data: { status } });
    cancellations++;
    assert.deepEqual(JSON.parse(options.body), { ids: [123] });
    return Response.json(confirmed ? { status_code: 200, message: 'Orders cancelled successfully' } : { status_code: 400, message: 'Cannot cancel' });
  };
  try {
    await assert.rejects(cancelShiprocketOrder(123, config()), /Cannot cancel/);
    confirmed = true;
    assert.equal((await cancelShiprocketOrder(123, config())).status_code, 200);
    status = 'IN TRANSIT';
    await assert.rejects(cancelShiprocketOrder(123, config()), /IN TRANSIT/);
    assert.equal(cancellations, 2, 'collected shipments cannot reach the cancellation endpoint');
  } finally { global.fetch = originalFetch; }
});

test('Ops forces Secure off and never assigns an AWB when insurance is enabled or unverified', async () => {
  const originalFetch = global.fetch;
  for (const insuranceStatus of ['Yes', undefined]) {
    const payload = mapOrderToShiprocket({ number: 'TEST', billing: { email: 'buyer@example.test' } }, config(), {
      pickupLocation: 'Primary', courierId: 1, deliveryOverride: { contact: { firstName: 'Buyer', phone: '9999999999' }, address: { addressLine: 'Road', city: 'Delhi', subdivision: 'Delhi', country: 'IN', postalCode: '110001' } }
    });
    payload.shipment.is_insurance_opt = true;
    let awbRequested = false;
    global.fetch = async (url, options) => {
      const path = String(url);
      if (path.endsWith('/settings/company/pickup')) return Response.json({ data: { shipping_address: [{ pickup_location: 'Primary', pin_code: '560001' }] } });
      if (path.includes('/orders?search=')) return Response.json({ data: [] });
      if (path.endsWith('/orders/create/adhoc')) {
        assert.equal(JSON.parse(options.body).is_insurance_opt, false);
        return Response.json({ order_id: 10, shipment_id: 20 });
      }
      if (path.includes('/orders/show/')) return Response.json({ data: { order_insurance: { insurance_status: insuranceStatus } } });
      awbRequested = true;
      throw new Error('Must not assign AWB or request pickup');
    };
    try {
      await assert.rejects(createShiprocketShipment(payload, config()), /did not confirm insurance is off/);
      assert.equal(awbRequested, false);
    } finally { global.fetch = originalFetch; }
  }
});

test('maps reverse pickup customer and warehouse addresses', () => {
  const payload = mapOrderToShiprocket({ id: 'wix-2', number: '1002' }, config(), {
    reverse: true,
    deliveryOverride: { contact: { firstName: 'Dev', phone: '9876543210' }, address: { addressLine: 'Customer road', city: 'Mumbai', subdivision: 'Maharashtra', country: 'IN', postalCode: '400001' } }
  });
  assert.equal(payload.reverse, true);
  assert.equal(payload.shipment.pickup_pincode, '400001');
  assert.equal(payload.shipment.shipping_pincode, '560001');
});
