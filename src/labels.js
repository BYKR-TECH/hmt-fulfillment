export async function createShipmentLabel(shipment, config) {
  if (!config.delhivery.token) {
    throw new Error('DELHIVERY_API_TOKEN is required to generate a Delhivery label.');
  }
  if (!shipment?.waybill) {
    throw new Error('AWB is required to generate a label.');
  }

  const response = await fetchDelhiveryLabel(shipment, config);
  const payload = await safeJson(response);
  if (!response.ok) {
    const errorPayload = Object.keys(payload).length ? payload : await safeText(response);
    throw new Error(`Delhivery label failed (${response.status}): ${JSON.stringify(errorPayload)}`);
  }

  validateLabelPayload(payload, shipment.waybill);
  const labelUrl = extractLabelUrl(payload);
  const contentType = header(response, 'content-type') || '';
  const internalLabelUrl = shipment?.id ? `/api/crm/shipments/${shipment.id}/label-file` : '';

  return {
    label_url: labelUrl || internalLabelUrl,
    label_format: inferFormat(labelUrl, payload, contentType),
    label_generated_at: new Date().toISOString(),
    label_error: null,
    raw: Object.keys(payload).length ? payload : { proxied_label: true, content_type: contentType }
  };
}

export async function fetchShipmentLabelFile(shipment, config) {
  if (!config.delhivery.token) {
    throw new Error('DELHIVERY_API_TOKEN is required to download a Delhivery label.');
  }
  if (!shipment?.waybill) {
    throw new Error('AWB is required to download a label.');
  }

  const response = await fetchDelhiveryLabel(shipment, config);
  if (!response.ok) {
    const payload = await safeJson(response);
    const errorPayload = payload || await safeText(response);
    throw new Error(`Delhivery label download failed (${response.status}): ${JSON.stringify(errorPayload)}`);
  }

  const contentType = header(response, 'content-type') || '';
  let body;
  let finalContentType = contentType;

  if (contentType.includes('json')) {
    const payload = await safeJson(response);
    validateLabelPayload(payload, shipment.waybill);
    const { buildDelhiveryShippingLabelPdf } = await import('../lib/crm/shipping-label-pdf.js');
    body = buildDelhiveryShippingLabelPdf(payload);
    finalContentType = 'application/pdf';
  } else {
    body = Buffer.from(await response.arrayBuffer());
  }

  return {
    body,
    contentType: finalContentType || 'application/pdf',
    filename: `delhivery-label-${shipment.waybill}.pdf`
  };
}

function validateLabelPayload(payload, waybill) {
  if (!Array.isArray(payload.packages)) return;
  if (!payload.packages.length) {
    throw new Error(`Delhivery returned no shipping label for AWB ${waybill}. For international or manually booked shipments, upload the carrier-issued label using "Upload shipping label" on the order.`);
  }
  const packageAwb = payload.packages[0]?.wbn || payload.packages[0]?.waybill;
  if (!packageAwb || String(packageAwb).trim() !== String(waybill).trim()) {
    throw new Error(`Delhivery returned a label that does not match AWB ${waybill}.`);
  }
}

function fetchDelhiveryLabel(shipment, config) {
  const url = buildLabelUrl(config.delhivery.labelUrl, shipment.waybill);
  return fetch(url, {
    headers: {
      Authorization: `Token ${config.delhivery.token}`,
      Accept: 'application/pdf,application/json,text/html;q=0.9,*/*;q=0.8'
    },
    // Avoid leaving the booking screen stuck if the carrier endpoint stalls.
    signal: AbortSignal.timeout(45_000)
  });
}

function buildLabelUrl(labelUrl, waybill) {
  if (!labelUrl) throw new Error('DELHIVERY_LABEL_URL is not configured for label generation.');
  const rendered = labelUrl.replaceAll('{waybill}', encodeURIComponent(waybill)).replaceAll('{awb}', encodeURIComponent(waybill));
  const url = new URL(rendered);
  if (!labelUrl.includes('{waybill}') && !labelUrl.includes('{awb}')) {
    const parameter = url.pathname.includes('packing_slip') ? 'wbns' : 'waybill';
    if (!url.searchParams.has(parameter)) url.searchParams.set(parameter, waybill);
  }
  return url;
}

function extractLabelUrl(payload) {
  return (
    payload?.label_url ||
    payload?.labelUrl ||
    payload?.url ||
    payload?.pdf ||
    payload?.packages?.[0]?.label_url ||
    payload?.packages?.[0]?.labelUrl ||
    ''
  );
}

function inferFormat(labelUrl, payload, contentType = '') {
  if (payload?.format) return String(payload.format).toLowerCase();
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('html')) return 'html';
  if (String(labelUrl).toLowerCase().includes('.pdf')) return 'pdf';
  if (!labelUrl && (payload?.packages || payload?.barcode)) return 'pdf';
  return 'url';
}

function header(response, name) {
  return typeof response?.headers?.get === 'function' ? response.headers.get(name) : '';
}

async function safeText(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function safeJson(response) {
  try {
    if (typeof response.clone === 'function') return await response.clone().json();
    if (typeof response.json === 'function') return await response.json();
    if (typeof response.text === 'function') {
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    }
  } catch {
    return {};
  }
  return {};
}
