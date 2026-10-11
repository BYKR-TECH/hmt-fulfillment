// Use the carrier mapper without importing a manual order as a Wix order.
export function manualOrderForCarrier(order) {
  const address = order.shipping_address || {};
  const customer = order.customers || {};
  return {
    id: order.id, number: order.order_number || order.id, currency: order.currency || 'INR',
    paymentStatus: order.payment_status,
    buyerInfo: { email: customer.email || '' },
    priceSummary: { total: { amount: String(order.total_amount || 0) } },
    lineItems: (order.order_items || []).map(item => ({ productName: { original: item.product_name }, quantity: item.quantity })),
    shippingInfo: { logistics: { shippingDestination: {
      address: { addressLine: address.address_line1, addressLine2: address.address_line2, city: address.city,
        subdivision: address.state, postalCode: address.postal_code, country: address.country },
      contactDetails: { firstName: address.name || customer.name, phone: address.phone || customer.phone }
    } } }
  };
}

export async function bookManualAutomationOrder(order, config, metadata, dependencies = {}) {
  const { getCourierAdapter } = dependencies.couriers || await import('../../src/couriers/index.js');
  const { upsertShipment } = dependencies.store || await import('../../src/store.js');
  const courier = getCourierAdapter(metadata.courierCode);
  const bookingConfig = { ...config, defaults: { ...config.defaults, shippingMode: metadata.shippingMode } };
  const payload = courier.mapOrder(manualOrderForCarrier(order), bookingConfig, { internationalService: metadata.internationalService });
  const pending = await upsertShipment({ ...metadata, dbOrderId: order.id, orderId: order.id,
    orderNumber: order.order_number || order.id, courierCode: courier.code,
    status: config.createAwbOnBook ? 'pending' : 'pending-zone', requestPayload: payload });
  if (!config.createAwbOnBook) return { shipment: pending };
  if (payload.flow === 'international' && courier.code !== 'fedex') {
    return { shipment: await upsertShipment({ ...pending, status: 'pending-international', waybill: '',
      message: 'International shipment queued; Delhivery international manifest API is not configured.' }) };
  }
  try {
    const response = await courier.createShipment(payload, bookingConfig);
    const waybill = response?.waybill || response?.packages?.[0]?.waybill || response?.packages?.[0]?.waybill_number || response?.upload_wbn || '';
    return { shipment: await upsertShipment({ ...pending, status: 'booked', waybill, delhiveryResponse: response, error: '' }) };
  } catch (error) {
    await upsertShipment({ ...pending, status: 'failed', error: error.message });
    throw error;
  }
}
