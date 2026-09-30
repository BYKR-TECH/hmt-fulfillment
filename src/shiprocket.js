let cachedToken = '';
let tokenExpiresAt = 0;

export async function getShiprocketRates(params, config) {
  validateCredentials(config);
  const token = await getShiprocketToken(config);
  const destinationCountry = normalizeCountryCode(params.deliveryCountry);
  const isInternational = destinationCountry !== 'IN';
  if (isInternational && params.isReturn) {
    throw new Error('Shiprocket international return estimates are not supported by the international serviceability API.');
  }
  const url = new URL(`${baseUrl(config)}${isInternational ? '/international/courier/serviceability' : '/courier/serviceability/'}`);
  const query = isInternational ? {
    pickup_postcode: params.pickupPincode || config.shiprocket.pickupPincode,
    delivery_country: destinationCountry,
    cod: 0,
    weight: gramsToKg(params.weightGrams)
  } : {
    pickup_postcode: params.pickupPincode || config.shiprocket.pickupPincode,
    delivery_postcode: params.deliveryPincode,
    cod: params.paymentMode === 'COD' ? 1 : 0,
    weight: gramsToKg(params.weightGrams),
    length: positiveNumber(params.lengthCm),
    breadth: positiveNumber(params.widthCm),
    height: positiveNumber(params.heightCm),
    declared_value: positiveNumber(params.declaredValue),
    is_return: params.isReturn ? 1 : 0
  };
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  if (!query.pickup_postcode || (!isInternational && !query.delivery_postcode)) {
    throw new Error(`Shiprocket ${isInternational ? 'international' : 'domestic'} estimates require ${isInternational ? 'a pickup pincode and destination country' : 'pickup and delivery pincodes'}. Configure SHIPROCKET_PICKUP_PINCODE.`);
  }

  const body = await shiprocketRequest(url, { method: 'GET' }, token, config);
  const companies = body?.data?.available_courier_companies || [];
  const recommendedCourierId = body?.data?.recommended_courier_company_id ?? body?.data?.shiprocket_recommended_courier_id;
  return companies.map(company => ({
    courierId: company.courier_company_id ?? company.courier_id,
    courierName: company.courier_name || company.courier_company_name || 'Shiprocket courier',
    rate: numberOrNull(company.rate?.total ?? company.rate?.rate ?? company.rate ?? company.freight_charge),
    freightCharge: numberOrNull(company.freight_charge),
    codCharges: numberOrNull(company.cod_charges),
    currency: body.currency || 'INR',
    estimatedDeliveryDays: company.estimated_delivery_days || company.etd || '',
    estimatedDeliveryDate: company.etd || company.expected_delivery_date || '',
    mode: normalizeCourierMode(company.mode ?? company.transportation_mode),
    rating: numberOrNull(company.rating),
    recommended: Boolean(company.recommendation_status || company.is_recommended || (recommendedCourierId != null && String(recommendedCourierId) === String(company.courier_company_id ?? company.courier_id))),
    international: isInternational || Boolean(company.is_international),
    raw: company
  })).filter(quote => quote.courierId != null);
}

export function mapOrderToShiprocket(order, config, options = {}) {
  const delivery = options.deliveryOverride || {};
  const address = delivery.address || {};
  const contact = delivery.contact || {};
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || 'Customer';
  const items = extractItems(order, config);
  const subtotal = items.reduce((sum, item) => sum + item.selling_price * item.units, 0) || 1;
  const orderId = shiprocketOrderReference(options.orderNumberOverride || order?.number || order?.id || order?.order?.AmazonOrderId);
  const common = {
    order_id: orderId,
    order_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
    order_items: items,
    payment_method: config.defaults.paymentMode === 'COD' ? 'COD' : 'Prepaid',
    sub_total: subtotal,
    length: positiveNumber(config.defaults.lengthCm, 1),
    breadth: positiveNumber(config.defaults.widthCm, 1),
    height: positiveNumber(config.defaults.heightCm, 1),
    weight: gramsToKg(config.defaults.weightGrams)
  };

  if (options.reverse) {
    return {
      flow: 'domestic',
      provider: 'shiprocket',
      reverse: true,
      courier_id: optionalInteger(options.courierId),
      shipment: {
        ...common,
        pickup_customer_name: contact.firstName || name,
        pickup_last_name: contact.lastName || '',
        pickup_address: address.addressLine,
        pickup_address_2: address.addressLine2 || '',
        pickup_city: address.city,
        pickup_state: address.subdivision,
        pickup_country: normalizeCountry(address.country),
        pickup_pincode: address.postalCode,
        pickup_email: extractEmail(order, config),
        pickup_phone: contact.phone,
        shipping_customer_name: config.shiprocket.returnName || config.delhivery.returnName,
        shipping_address: config.shiprocket.returnAddress || config.delhivery.returnAddress,
        shipping_city: config.shiprocket.returnCity || config.delhivery.returnCity,
        shipping_state: config.shiprocket.returnState || config.delhivery.returnState,
        shipping_country: 'India',
        shipping_pincode: config.shiprocket.returnPincode || config.delhivery.returnPincode,
        shipping_phone: config.shiprocket.returnPhone || config.delhivery.returnPhone
      }
    };
  }

  return {
    flow: 'domestic',
    provider: 'shiprocket',
    reverse: false,
    courier_id: optionalInteger(options.courierId),
    shipment: {
      ...common,
      pickup_location: options.pickupLocation || config.shiprocket.pickupLocation,
      billing_customer_name: contact.firstName || name,
      billing_last_name: contact.lastName || '',
      billing_address: address.addressLine,
      billing_address_2: address.addressLine2 || '',
      billing_city: address.city,
      billing_pincode: address.postalCode,
      billing_state: address.subdivision,
      billing_country: normalizeCountry(address.country),
      billing_email: extractEmail(order, config),
      billing_phone: contact.phone,
      shipping_is_billing: true
    }
  };
}

export async function createShiprocketShipment(payload, config) {
  validateCredentials(config);
  validateShipment(payload);
  const token = await getShiprocketToken(config);
  const createPath = payload.reverse ? '/orders/create/return' : '/orders/create/adhoc';
  const created = await shiprocketRequest(`${baseUrl(config)}${createPath}`, {
    method: 'POST',
    body: JSON.stringify(payload.shipment)
  }, token, config);
  const shipmentId = created.shipment_id ?? created?.data?.shipment_id;
  if (!shipmentId) throw new Error(`Shiprocket created the order without a shipment id: ${JSON.stringify(created)}`);

  const assigned = await shiprocketRequest(`${baseUrl(config)}/courier/assign/awb`, {
    method: 'POST',
    body: JSON.stringify({
      shipment_id: shipmentId,
      ...(payload.courier_id ? { courier_id: payload.courier_id } : {}),
      ...(payload.reverse ? { is_return: 1 } : {})
    })
  }, token, config);
  const awb = assigned?.response?.data?.awb_code || assigned?.awb_code || assigned?.data?.awb_code || '';
  if (!awb) throw new Error(`Shiprocket did not assign an AWB: ${JSON.stringify(assigned)}`);
  const pickup = await optionalShiprocketRequest(`${baseUrl(config)}/courier/generate/pickup`, {
    method: 'POST',
    body: JSON.stringify({ shipment_id: [shipmentId] })
  }, token, config);
  const label = await optionalShiprocketRequest(`${baseUrl(config)}/courier/generate/label`, {
    method: 'POST',
    body: JSON.stringify({ shipment_id: [shipmentId] })
  }, token, config);
  return {
    provider: 'shiprocket',
    order_id: created.order_id ?? created?.data?.order_id,
    shipment_id: shipmentId,
    awb_code: awb,
    waybill: awb,
    courier_company_id: payload.courier_id || assigned?.response?.data?.courier_company_id || null,
    label_url: label.body?.label_url || '',
    label_format: label.body?.label_url ? 'pdf' : '',
    pickup_response: pickup.body,
    pickup_error: pickup.error,
    create_response: created,
    awb_response: assigned
  };
}

async function optionalShiprocketRequest(url, options, token, config) {
  try {
    return { body: await shiprocketRequest(url, options, token, config), error: '' };
  } catch (error) {
    return { body: null, error: error.message };
  }
}

export async function cancelShiprocketOrder(shiprocketOrderId, config) {
  if (!shiprocketOrderId) throw new Error('Shiprocket order id is required for cancellation.');
  const token = await getShiprocketToken(config);
  return shiprocketRequest(`${baseUrl(config)}/orders/cancel`, {
    method: 'POST',
    body: JSON.stringify({ ids: [Number(shiprocketOrderId) || shiprocketOrderId] })
  }, token, config);
}

async function getShiprocketToken(config) {
  if (cachedToken && tokenExpiresAt > Date.now() + 60_000) return cachedToken;
  if (!config.shiprocket.email || !config.shiprocket.password) {
    if (config.shiprocket.token) return config.shiprocket.token;
    throw new Error('Shiprocket requires SHIPROCKET_API_TOKEN or SHIPROCKET_EMAIL/SHIPROCKET_PASSWORD.');
  }
  const response = await fetch(`${baseUrl(config)}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: config.shiprocket.email, password: config.shiprocket.password })
  });
  const body = await safeJson(response);
  if (!response.ok || !body.token) throw new Error(`Shiprocket auth failed (${response.status}): ${JSON.stringify(body)}`);
  cachedToken = body.token;
  tokenExpiresAt = Date.now() + 9 * 24 * 60 * 60 * 1000;
  return cachedToken;
}

async function shiprocketRequest(url, options, token, config) {
  const response = await fetch(String(url), {
    ...options,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  const body = await safeJson(response);
  if (!response.ok) throw new Error(`Shiprocket API failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

function extractItems(order, config) {
  const source = order?.lineItems || order?.order?.items || order?.items || [];
  const items = source.map((item, index) => ({
    name: item?.productName?.original || item?.productName || item?.Title || item?.name || `Item ${index + 1}`,
    sku: item?.physicalProperties?.sku || item?.SellerSKU || item?.sku || `ITEM-${index + 1}`,
    units: Math.max(1, Number(item?.quantity || item?.QuantityOrdered || item?.units || 1)),
    selling_price: positiveNumber(item?.price?.amount || item?.lineItemPrice?.amount || item?.ItemPrice?.Amount || item?.selling_price, 1),
    hsn: config.defaults.hsnCode || undefined
  }));
  return items.length ? items : [{ name: 'Order item', sku: 'ORDER-ITEM', units: 1, selling_price: 1, hsn: config.defaults.hsnCode || undefined }];
}

function validateShipment(payload) {
  const shipment = payload?.shipment || {};
  const required = payload.reverse
    ? ['order_id', 'pickup_customer_name', 'pickup_address', 'pickup_city', 'pickup_state', 'pickup_pincode', 'pickup_email', 'pickup_phone', 'shipping_customer_name', 'shipping_address', 'shipping_city', 'shipping_state', 'shipping_pincode', 'shipping_phone']
    : ['order_id', 'pickup_location', 'billing_customer_name', 'billing_address', 'billing_city', 'billing_state', 'billing_pincode', 'billing_email', 'billing_phone'];
  const missing = required.filter(key => !String(shipment[key] ?? '').trim());
  if (missing.length) throw new Error(`Missing required Shiprocket fields: ${missing.join(', ')}`);
}

function validateCredentials(config) {
  if (!config?.shiprocket) throw new Error('Shiprocket configuration is missing.');
}

function baseUrl(config) {
  return String(config.shiprocket.baseUrl || 'https://apiv2.shiprocket.in/v1/external').replace(/\/$/, '');
}

function shiprocketOrderReference(value) {
  const normalized = String(value || Date.now()).replace(/[^a-zA-Z0-9-]/g, '-');
  return normalized.slice(-20);
}

function normalizeCountry(value) {
  const country = String(value || 'IN').trim().toUpperCase();
  return country === 'IN' ? 'India' : value;
}

function normalizeCountryCode(value) {
  const country = String(value || 'IN').trim().toUpperCase();
  if (country === 'INDIA') return 'IN';
  return country || 'IN';
}

function extractEmail(order, config) {
  return order?.buyerInfo?.email || order?.buyer?.BuyerEmail || order?.email || config.shiprocket.email || '';
}

function gramsToKg(value) {
  return Math.max(0.001, positiveNumber(value, 1) / 1000);
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function optionalInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCourierMode(value) {
  if (value === 0 || String(value).toLowerCase() === 'surface') return 'Surface';
  if (value === 1 || String(value).toLowerCase() === 'air') return 'Air';
  return String(value || '');
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
