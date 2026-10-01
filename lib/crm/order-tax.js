function taxValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (!value || typeof value !== 'object') return '';
  return taxValue(value.id ?? value.value ?? value.number);
}

export function extractOrderTaxDetails(raw = {}) {
  raw = raw || {};
  const candidates = [
    [raw.billingInfo?.contactDetails?.vatId, 'VAT'],
    [raw.billingInfo?.vatId, 'VAT'], [raw.buyerInfo?.vatId, 'VAT'],
    [raw.contactDetails?.vatId, 'VAT'], [raw.vatId, 'VAT'],
    [raw.billing?.gstin, 'GSTIN'], [raw.billing?.gst_number, 'GSTIN'],
    [raw.billing?.tax_id, 'Tax ID'], [raw.billing?.vat_id, 'VAT'],
    [raw.gstin, 'GSTIN'], [raw.tax_id, 'Tax ID']
  ];
  for (const entry of Array.isArray(raw.meta_data) ? raw.meta_data : []) {
    const key = String(entry.key || '').toLowerCase();
    if (/^_?(?:(?:billing|shipping)_)?(?:gst(?:in|_?(?:number|no|id))?|tax_?id|vat(?:_?(?:id|number))?)$/.test(key)) {
      candidates.push([entry.value, key.includes('gst') ? 'GSTIN' : key.includes('vat') ? 'VAT' : 'Tax ID']);
    }
  }
  for (const [candidate, label] of candidates) {
    const id = taxValue(candidate);
    if (!id) continue;
    const isGstin = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/i.test(id);
    return { id: isGstin ? id.toUpperCase() : id, type: isGstin ? 'GSTIN' : candidate?.type || candidate?.name || label };
  }
  return { id: '', type: '' };
}
