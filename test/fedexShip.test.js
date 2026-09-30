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
    exportClearance: 'csb5', invoiceNumber: 'INV-100', departmentNumber: 'utility-output', orderNumber: '100'
  });
  const shipment = payload.requestedShipment;
  assert.equal(shipment.customsClearanceDetail.commercialInvoice.shipmentPurpose, 'SOLD');
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
    exportClearance: 'csb5', invoiceNumber: 'INV-100', departmentNumber: 'utility-output'
  }), /export shipment from India/);
});

test('Wix booking forwards CSB V references and operator customs values', () => {
  const payload = mapWixOrderToFedexShipment({ number: '100' }, { fedex: { accountNumber: '123' }, defaults: {} }, {
    exportClearance: 'csb5', invoiceNumber: 'INV-100', departmentNumber: 'utility-output',
    fedexPayload: { declaredValue: 2500 }, deliveryOverride: { address: { country: 'US' } }
  });
  assert.equal(payload.requestedShipment.requestedPackageLineItems[0].customerReferences[1].value, 'INV-100');
  assert.equal(payload.requestedShipment.customsClearanceDetail.commodities[0].customsValue.amount, 2500);
});
