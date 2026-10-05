export function normalizeManualAwb(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

export function validateShipmentPayload(payload, { manualAwb = false } = {}) {
  const missing = [];
  if (manualAwb) {
    if (!String(payload.awb_number || '').trim()) missing.push('AWB is required to save a manual shipment');
    const awb = normalizeManualAwb(payload.awb_number);
    const courier = String(payload.courier || '').trim().toLowerCase();
    if (awb && !/^[A-Z0-9-]{5,64}$/.test(awb)) missing.push('AWB must contain 5–64 letters, digits or hyphens; do not paste a tracking URL');
    if (awb && courier === 'fedex' && !/^\d{12,15}$/.test(awb)) missing.push('FedEx AWB must be a 12–15 digit tracking number. Verify the courier on the shipping label; DL…XB references are not FedEx Express AWBs.');
    if (awb && courier === 'delhivery' && !/^(?:\d{12,14}|DL\d{9}XB)$/.test(awb)) missing.push('Delhivery AWB must be 12–14 digits or an international DL followed by 9 digits and XB. Verify the shipping label.');
    if (!supportsAutomaticTracking(payload.courier) && !isSafeTrackingUrl(payload.tracking_url)) {
      missing.push('A valid HTTPS tracking link is required for couriers without automatic tracking');
    }
    return missing;
  }
  if (!payload.phone) missing.push('Missing phone number');
  if (isIndiaCountry(payload.country) && !/^[1-9][0-9]{5}$/.test(String(payload.pincode || ''))) missing.push('Invalid pincode');
  if (!payload.address_line1) missing.push('Missing address line');
  if (!Number(payload.product_value)) missing.push('Missing product value');
  if (!Number(payload.weight_grams)) missing.push('Missing weight');
  if (!Number(payload.length_cm) || !Number(payload.width_cm) || !Number(payload.height_cm)) missing.push('Missing dimensions');
  return missing;
}

export function supportsAutomaticTracking(courier) {
  const normalized = String(courier || '').trim().toLowerCase().replaceAll('_', '-');
  return !normalized || ['delhivery', 'fedex', 'shiprocket'].includes(normalized);
}

export function isSafeTrackingUrl(value) {
  try {
    return new URL(String(value || '').trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

function isIndiaCountry(country) {
  const normalized = String(country || 'IN').trim().toUpperCase();
  return normalized === 'IN' || normalized === 'INDIA';
}
