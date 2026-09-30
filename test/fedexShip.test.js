import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFedexShipmentPayload, mapWixOrderToFedexShipment, parseFedexShipmentResponse } from '../src/fedexShip.js';

test('builds FedEx Ship API payload for international shipment', () => {
  const payload = buildFedexShipmentPayload(
    {
      raw_order: {
        id: 'wix-order-id',
        number: '10446',
        currency: 'INR',
        buyerInfo: { email: 'buyer@example.com' },
        priceSummary: { total: { amount: '18498' } },
        shippingInfo: {
          logistics: {
            shippingDestination: {
              address: {
                addressLine: 'Main Street 1',
                city: 'Berlin',
                subdivision: 'DE-BE',
                postalCode: '10115',
                country: 'DE'
              },
              contactDetails: {
                firstName: 'Ada',
                lastName: 'Buyer',
                phone: '4912345678'
              }
            }
          }
        },
        lineItems: [
          {
            productName: { original: 'Hold My Throttle' },
            quantity: 1,
            physicalProperties: { weight: 0.4 }
          }
        ]
      }
    },
    {
      fedex: { accountNumber: '210264166' },
      defaults: { weightGrams: 400, lengthCm: 23, widthCm: 14, heightCm: 6, internationalShipmentType: 'Commercial' }
    },
    { orderNumber: '10446' }
  );

  assert.equal(payload.labelResponseOptions, 'LABEL');
  assert.equal(payload.accountNumber.value, '210264166');
  assert.equal(payload.requestedShipment.serviceType, 'FEDEX_INTERNATIONAL_PRIORITY');
  assert.equal(payload.requestedShipment.shipper.contact.personName, 'Sai Preetham');
  assert.equal(payload.requestedShipment.recipients[0].address.countryCode, 'DE');
  assert.equal(payload.requestedShipment.recipients[0].address.stateOrProvinceCode, 'BE');
  assert.equal(payload.requestedShipment.requestedPackageLineItems[0].weight.units, 'KG');
  assert.equal(payload.requestedShipment.customsClearanceDetail.commercialInvoice.shipmentPurpose, 'SOLD');
  assert.equal(payload.requestedShipment.labelSpecification.imageType, 'PDF');
});

test('parses FedEx Ship API response tracking and label', () => {
  const parsed = parseFedexShipmentResponse({
    output: {
      transactionShipments: [
        {
          masterTrackingNumber: '794612345678',
          pieceResponses: [
            {
              trackingNumber: '794612345678',
              packageDocuments: [
                {
                  contentType: 'PDF',
                  encodedLabel: 'JVBERi0x'
                }
              ]
            }
          ]
        }
      ]
    }
  });

  assert.equal(parsed.waybill, '794612345678');
  assert.equal(parsed.labelBase64, 'JVBERi0x');
  assert.equal(parsed.labelFormat, 'PDF');
});

test('uses the CRM shipping override for the FedEx recipient', () => {
  const payload = mapWixOrderToFedexShipment(
    { lineItems: [] },
    { fedex: { accountNumber: '123' }, defaults: {} },
    {
      deliveryOverride: {
        address: { addressLine: '10 Shipping Street', city: 'Washington', subdivision: 'DC', postalCode: '20001', country: 'US' },
        contact: { firstName: 'Shipping', lastName: 'Recipient', phone: '12025550123' }
      }
    }
  );

  assert.equal(payload.requestedShipment.recipients[0].contact.personName, 'Shipping Recipient');
  assert.equal(payload.requestedShipment.recipients[0].address.streetLines[0], '10 Shipping Street');
  assert.equal(payload.requestedShipment.recipients[0].address.postalCode, '20001');
});

test('CSB V sends the invoice and exact utility output with commercial purpose', () => {
  const payload = buildFedexShipmentPayload({
    shipping_address: { country: 'DE' },
    fedex_payload: { purposeOfShipment: 'GIFT', declaredValue: 2500, weightGrams: 650, lengthCm: 25 }
  }, { fedex: { accountNumber: '123' }, defaults: {} }, {
    exportClearance: 'csb5', invoiceNumber: 'INV-100', departmentNumber: 'utility-output', adCode: '7654321', orderNumber: '100'
  });
  const shipment = payload.requestedShipment;
  assert.equal(shipment.customsClearanceDetail.commercialInvoice.shipmentPurpose, 'SOLD');
  assert.deepEqual(shipment.customsClearanceDetail.commercialInvoice.customerReferences, [
    { customerReferenceType: 'INVOICE_NUMBER', value: 'INV-100' },
    { customerReferenceType: 'DEPARTMENT_NUMBER', value: 'utility-output' }
  ]);
  assert.deepEqual(shipment.customsClearanceDetail.commercialInvoice.comments, ['DEPT_NOTES: utility-output, AD Code: 7654321, INV: INV-100']);
  assert.ok(shipment.customsClearanceDetail.commercialInvoice.originatorName);
  assert.deepEqual(shipment.customsClearanceDetail.customsOption, { type: 'OTHER', description: 'utility-output' });
  assert.deepEqual(shipment.customsClearanceDetail.totalCustomsValue, { amount: 2500, currency: 'INR' });
  assert.deepEqual(shipment.shippingDocumentSpecification.shippingDocumentTypes, ['COMMERCIAL_INVOICE']);
  assert.equal(shipment.shippingDocumentSpecification.commercialInvoiceDetail.documentFormat.docType, 'PDF');
  assert.deepEqual(shipment.requestedPackageLineItems[0].customerReferences, [
    { customerReferenceType: 'CUSTOMER_REFERENCE', value: '100' },
    { customerReferenceType: 'INVOICE_NUMBER', value: 'INV-100' },
    { customerReferenceType: 'DEPARTMENT_NUMBER', value: 'utility-output' }
  ]);
  assert.equal(shipment.customsClearanceDetail.commodities[0].customsValue.amount, 2500);
  assert.equal(shipment.requestedPackageLineItems[0].weight.value, 0.65);
  assert.equal(shipment.requestedPackageLineItems[0].dimensions.length, 25);
});

test('CSB V cannot create a payload without its mandatory references or an export destination', () => {
  const config = { fedex: { accountNumber: '123' }, defaults: {} };
  assert.throws(() => buildFedexShipmentPayload({}, config, { exportClearance: 'csb5' }), /invoice number/);
  assert.throws(() => buildFedexShipmentPayload({ shipping_address: { country: 'IN' } }, config, {
    exportClearance: 'csb5', invoiceNumber: 'INV-100', departmentNumber: 'utility-output', adCode: '7654321'
  }), /export shipment from India/);
});

test('Wix booking forwards CSB V references and operator customs values', () => {
  const payload = mapWixOrderToFedexShipment({ number: '100' }, { fedex: { accountNumber: '123' }, defaults: {} }, {
    exportClearance: 'csb5', invoiceNumber: 'INV-100', departmentNumber: 'utility-output', adCode: '7654321',
    fedexPayload: { declaredValue: 2500 }, deliveryOverride: { address: { country: 'US' } }
  });
  assert.equal(payload.requestedShipment.requestedPackageLineItems[0].customerReferences[1].value, 'INV-100');
  assert.equal(payload.requestedShipment.customsClearanceDetail.commodities[0].customsValue.amount, 2500);
});


test('FedEx validation uses the non-booking endpoint and does not send label response options', async t => {
  const { validateFedexShipment } = await import('../src/fedexShip.js?validation-success');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify(url.endsWith('/oauth/token')
      ? { access_token: 'test-token', expires_in: 3600 }
      : { transactionId: 'validation-123', output: { alerts: [] } }), { status: 200 });
  });
  const config = { fedex: { baseUrl: 'https://apis-sandbox.fedex.com', clientId: 'test-id', clientSecret: 'test-secret', accountNumber: '123' } };
  const payload = { accountNumber: { value: '123' }, requestedShipment: { serviceType: 'FEDEX_INTERNATIONAL_PRIORITY' }, labelResponseOptions: 'LABEL', flow: 'international' };
  const result = await validateFedexShipment(payload, config);
  assert.equal(result.transactionId, 'validation-123');
  assert.deepEqual(requests.map(item => item.url), [
    'https://apis-sandbox.fedex.com/oauth/token',
    'https://apis-sandbox.fedex.com/ship/v1/shipments/packages/validate'
  ]);
  assert.deepEqual(JSON.parse(requests[1].options.body), { accountNumber: payload.accountNumber, requestedShipment: payload.requestedShipment });
});

test('FedEx validation preserves the access failure and transaction for carrier troubleshooting', async t => {
  const { validateFedexShipment } = await import('../src/fedexShip.js?validation-forbidden');
  t.mock.method(globalThis, 'fetch', async url => new Response(JSON.stringify(url.endsWith('/oauth/token')
    ? { access_token: 'test-token', expires_in: 3600 }
    : { transactionId: 'denied-123', errors: [{ code: 'FORBIDDEN.ERROR', message: 'Forbidden' }] }), { status: url.endsWith('/oauth/token') ? 200 : 403 }));
  await assert.rejects(validateFedexShipment({ accountNumber: { value: '123' }, requestedShipment: {} }, {
    fedex: { baseUrl: 'https://apis.fedex.com', clientId: 'test-id', clientSecret: 'test-secret', accountNumber: '123' }
  }), error => {
    assert.equal(error.carrierStatus, 403);
    assert.equal(error.transactionId, 'denied-123');
    assert.deepEqual(error.carrierErrorCodes, ['FORBIDDEN.ERROR']);
    return true;
  });
});


test('FedEx create sends carrier fields and excludes internal routing metadata', async t => {
  const { createFedexShipment } = await import('../src/fedexShip.js?create-routing-fields');
  let shipmentBody;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/oauth/token')) return new Response(JSON.stringify({ access_token: 'test-token' }));
    assert.equal(url, 'https://apis-sandbox.fedex.com/ship/v1/shipments');
    shipmentBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ output: { transactionShipments: [{ masterTrackingNumber: 'test-awb' }] } }));
  });
  const payload = { accountNumber: { value: '123' }, requestedShipment: {}, labelResponseOptions: 'LABEL', flow: 'international', provider: 'fedex' };
  await createFedexShipment(payload, { fedex: { baseUrl: 'https://apis-sandbox.fedex.com', clientId: 'test-id', clientSecret: 'test-secret', accountNumber: '123' } });
  assert.deepEqual(shipmentBody, { accountNumber: payload.accountNumber, requestedShipment: payload.requestedShipment, labelResponseOptions: 'LABEL' });
});


test('CSB V rejects a missing or placeholder bank AD Code', () => {
  const config = { fedex: { accountNumber: '123' }, defaults: {} };
  const order = { shipping_address: { country: 'US' } };
  const options = { exportClearance: 'csb5', invoiceNumber: 'INV-100', departmentNumber: 'utility-output' };
  for (const adCode of ['', 'bank-code']) {
    assert.throws(() => buildFedexShipmentPayload(order, config, { ...options, adCode }), /bank AD Code/);
  }
});

test('invoice-first carrier documents cannot be mistaken for a shipping label', () => {
  const parsed = parseFedexShipmentResponse({ output: { transactionShipments: [{
    shipmentDocuments: [{ docType: 'COMMERCIAL_INVOICE', encodedLabel: 'invoice-pdf' }, { docType: 'LABEL', contentType: 'PDF', encodedLabel: 'label-pdf' }]
  }] } });
  assert.equal(parsed.labelBase64, 'label-pdf');
  assert.equal(parsed.invoiceDocuments[0].encodedLabel, 'invoice-pdf');
  assert.equal(parseFedexShipmentResponse({ output: { transactionShipments: [{ shipmentDocuments: [{ docType: 'COMMERCIAL_INVOICE', encodedLabel: 'invoice-only' }] }] } }).labelBase64, '');
});

test('FedEx sandbox configuration cannot fall back to production credentials or host', async () => {
  const { fedexSandboxConfig } = await import('../src/fedexShip.js');
  const production = { fedex: { baseUrl: 'https://apis.fedex.com', clientId: 'production-id', clientSecret: 'production-secret', accountNumber: 'production-account' } };
  assert.throws(() => fedexSandboxConfig(production), /SANDBOX_CLIENT_ID/);
  const sandbox = fedexSandboxConfig({ ...production, fedex: { ...production.fedex, sandbox: { clientId: 'sandbox-id', clientSecret: 'sandbox-secret', accountNumber: 'sandbox-account', baseUrl: 'https://apis.fedex.com' } } });
  assert.equal(sandbox.fedex.baseUrl, 'https://apis-sandbox.fedex.com');
  assert.equal(sandbox.fedex.clientId, 'sandbox-id');
  assert.equal(sandbox.fedex.accountNumber, 'sandbox-account');
});

test('FedEx sandbox testing never reuses a production OAuth token', async t => {
  const { validateFedexShipment } = await import('../src/fedexShip.js?isolate-test-tokens');
  const authorizations = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/oauth/token')) {
      const id = new URLSearchParams(options.body).get('client_id');
      return new Response(JSON.stringify({ access_token: `${id}-token`, expires_in: 3600 }));
    }
    authorizations.push(options.headers.Authorization);
    return new Response(JSON.stringify({ transactionId: 'test' }));
  });
  const payload = { accountNumber: { value: '123' }, requestedShipment: {} };
  for (const name of ['production', 'sandbox']) {
    await validateFedexShipment(payload, { fedex: { baseUrl: name === 'production' ? 'https://apis.fedex.com' : 'https://apis-sandbox.fedex.com', clientId: name, clientSecret: `${name}-secret`, accountNumber: '123' } });
  }
  assert.deepEqual(authorizations, ['Bearer production-token', 'Bearer sandbox-token']);
});
