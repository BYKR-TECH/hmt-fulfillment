import { normalizeWixOrder, normalizeWooCommerceOrder } from '../../src/fulfillment.js';
import { extractOrderTaxDetails } from './order-tax.js';

function filledFields(...records) {
  const result = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record || {})) {
      if (value !== null && value !== undefined && value !== '') result[key] = value;
    }
  }
  return result;
}

export function orderDisplayDetails(row = {}) {
  const raw = row.raw_order || {
    id: row.external_order_id || row.wix_order_id,
    billing: row.source_billing, shipping: row.source_shipping,
    billingInfo: row.source_billing_info, shippingInfo: row.source_shipping_info,
    buyerInfo: row.source_buyer_info, meta_data: row.source_metadata,
    vatId: row.source_vat_id, gstin: row.source_gstin, tax_id: row.source_tax_id,
    priceSummary: row.source_price_summary, total_tax: row.source_total_tax
  };
  let fallback = {};
  if (row.source === 'woocommerce' && (raw.billing || raw.shipping)) {
    fallback = normalizeWooCommerceOrder({ ...raw, id: raw.id || row.id });
    if (fallback.customer.name === 'WooCommerce Customer') fallback.customer.name = '';
  } else if (!row.source || row.source === 'wix') {
    fallback = normalizeWixOrder(raw);
  }
  const sourceTax = raw.total_tax ?? raw.priceSummary?.tax?.amount;
  const taxAmount = sourceTax === null || sourceTax === undefined || sourceTax === '' ? null : Number(sourceTax);
  return {
    taxAmount: Number.isFinite(taxAmount) ? taxAmount : null,
    customer: filledFields(fallback.customer, row.customers),
    shipping: filledFields(fallback.shippingAddress, row.shipping_address),
    billing: filledFields(fallback.billingAddress, row.billing_address),
    billingCompany: raw.billing?.company || raw.billingInfo?.contactDetails?.company || '',
    tax: extractOrderTaxDetails(raw)
  };
}
