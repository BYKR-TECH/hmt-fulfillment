export function validateShipmentPayload(payload, { manualAwb = false } = {}) {
  const missing = [];
  if (manualAwb) {
    if (!String(payload.awb_number || '').trim()) missing.push('AWB is required to save a manual shipment');
    return missing;
  }
  if (payload.export_clearance === 'csb5') {
    if (payload.courier !== 'fedex') missing.push('Direct CSB V booking is currently available only for FedEx; Delhivery international API access is pending');
    if (isIndiaCountry(payload.country)) missing.push('CSB V requires an international destination');
    if (['reverse', 'rto'].includes(payload.shipment_type)) missing.push('CSB V requires an outbound shipment');
    if (payload.payment_mode === 'COD') missing.push('CSB V booking requires prepaid payment');
    if (!String(payload.invoice_number || '').trim()) missing.push('CSB V requires a commercial invoice number');
    if (!/^[0-9]+$/.test(String(payload.ad_code || '').trim())) missing.push('CSB V requires the exporter bank AD Code (digits only)');
    if (!String(payload.department_number || '').trim()) missing.push('CSB V requires the Department Number output from the FedEx utility');
  }
  if (!payload.phone) missing.push('Missing phone number');
  if (isIndiaCountry(payload.country) && !/^[1-9][0-9]{5}$/.test(String(payload.pincode || ''))) missing.push('Invalid pincode');
  if (!payload.address_line1) missing.push('Missing address line');
  if (!Number(payload.product_value)) missing.push('Missing product value');
  if (!Number(payload.weight_grams)) missing.push('Missing weight');
  if (!Number(payload.length_cm) || !Number(payload.width_cm) || !Number(payload.height_cm)) missing.push('Missing dimensions');
  return missing;
}

function isIndiaCountry(country) {
  const normalized = String(country || 'IN').trim().toUpperCase();
  return normalized === 'IN' || normalized === 'INDIA';
}
