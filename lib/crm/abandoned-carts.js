import { createServiceClient } from '../supabase/server.js';
import { findRecoveryMatch, normalizeEmail, normalizePhone } from './abandoned-cart-matching.js';

export const LEAD_STAGES = ['new', 'contacted', 'follow_up', 'not_interested', 'closed'];
const PAID_STATUSES = new Set(['paid', 'approved']);
let wooCheckoutScanMaxId = 0;

export async function syncAbandonedCartLeads(options = {}) {
  const db = createServiceClient();
  if (!db) return { ok: false, error: 'Supabase is not configured.' };
  const { getConfig } = await import('../../src/config.js');
  const config = getConfig();
  const [carts, wooCheckouts] = await Promise.all([
    fetchAllAbandonedCheckouts(config),
    fetchAllWooCancelledCheckouts(config, options)
  ]);
  if (!carts.ok) return carts;
  if (!wooCheckouts.ok) return wooCheckouts;

  const rows = [];
  for (const cart of carts.items) {
    const name = [cart.contactDetails?.firstName, cart.contactDetails?.lastName].filter(Boolean).join(' ');
    const email = cart.buyerInfo?.email || cart.contactDetails?.email || '';
    const phone = cart.contactDetails?.phone || '';
    let customerId = null;
    if (email || phone || cart.buyerInfo?.contactId) {
      const contactId = cart.buyerInfo?.contactId || `wix-abandoned-${cart.id}`;
      const { data, error } = await db
        .from('customers')
        .upsert({ wix_contact_id: contactId, name, email, phone, raw_customer: cart.buyerInfo || {} }, { onConflict: 'wix_contact_id' })
        .select('id')
        .single();
      if (error) return { ok: false, error: error.message };
      customerId = data.id;
    }
    rows.push({
      source: 'wix',
      external_checkout_id: String(cart.id),
      wix_abandoned_checkout_id: cart.id,
      customer_id: customerId,
      customer_name: name,
      email,
      phone,
      cart_value: cart.totalPrice?.amount || 0,
      currency: cart.currency || '',
      checkout_url: cart.checkoutUrl || '',
      items: cart.lineItems || [],
      wix_status: cart.status || '',
      wix_created_at: cart.createdDate,
      wix_updated_at: cart.updatedDate,
      raw_data: cart
    });
  }
  for (const checkout of wooCheckouts.items) rows.push(normalizeWooCancelledCheckout(checkout));
  if (rows.length) {
    const { error } = await db.from('abandoned_cart_leads').upsert(rows, { onConflict: 'source,external_checkout_id' });
    if (error) return { ok: false, error: error.message };
  }
  const recovery = await detectRecoveries(db);
  if (!recovery.ok) return recovery;
  return {
    ok: true,
    synced: rows.length,
    wixSynced: carts.items.length,
    wooCommerceSynced: wooCheckouts.items.length,
    pages: carts.pages + wooCheckouts.pages,
    recovered: recovery.recovered
  };
}

export async function listAbandonedCartLeads() {
  const db = createServiceClient();
  if (!db) return [];
  const { data } = await db.from('abandoned_cart_leads').select('*').order('wix_updated_at', { ascending: false }).limit(500);
  return data || [];
}

export async function getAbandonedCartLead(id) {
  const db = createServiceClient();
  if (!db || !id) return null;
  const { data: lead } = await db.from('abandoned_cart_leads').select('*').eq('id', id).maybeSingle();
  if (!lead) return null;
  const { data: recoveredOrder } = lead.recovered_order_id
    ? await db.from('orders').select('id,order_number,external_order_id,payment_status,total_amount,currency,source_created_at').eq('id', lead.recovered_order_id).maybeSingle()
    : { data: null };
  return { ...lead, recovered_order: recoveredOrder };
}

export async function updateAbandonedCartLead(id, payload) {
  const db = createServiceClient();
  if (!db) return { ok: false, error: 'Supabase is not configured.' };
  const leadStatus = String(payload.lead_status || '');
  if (!LEAD_STAGES.includes(leadStatus)) return { ok: false, error: 'Choose a valid lead stage.' };
  const patch = {
    lead_status: leadStatus,
    call_outcome: cleanText(payload.call_outcome, 120),
    notes: cleanText(payload.notes, 5000),
    next_follow_up_at: parseDate(payload.next_follow_up_at),
    last_contacted_at: parseDate(payload.last_contacted_at),
    updated_at: new Date().toISOString()
  };
  const { data, error } = await db.from('abandoned_cart_leads').update(patch).eq('id', id).select('*').maybeSingle();
  return error ? { ok: false, error: error.message } : { ok: true, lead: data };
}

export async function fetchAllAbandonedCheckouts(config) {
  const items = [];
  const maxPages = Math.max(1, Math.min(Number(process.env.WIX_ABANDONED_CART_MAX_PAGES || 50), 100));
  let cursor = '';
  let pages = 0;
  do {
    pages += 1;
    const query = { paging: { limit: 100 }, sort: [{ fieldName: 'updatedDate', order: 'DESC' }] };
    if (cursor) query.paging.cursor = cursor;
    const response = await fetch('https://www.wixapis.com/ecom/v1/abandoned-checkout/query', {
      method: 'POST',
      headers: { Authorization: config.wix.authToken, 'Content-Type': 'application/json', 'wix-site-id': config.wix.siteId },
      body: JSON.stringify({ query })
    });
    const body = await response.json();
    if (!response.ok) return { ok: false, error: body.message || `Wix request failed (${response.status}).` };
    items.push(...(body.abandonedCheckouts || body.results || []));
    cursor = body.pagingMetadata?.cursors?.next || body.metadata?.cursors?.next || '';
  } while (cursor && pages < maxPages);
  return { ok: true, items, pages, stoppedByMaxPages: Boolean(cursor) };
}

export async function fetchAllWooCancelledCheckouts(config, options = {}) {
  const settings = config.woocommerce?.abandonedCheckoutSync || {};
  if (!settings.enabled) return { ok: true, items: [], pages: 0, skipped: 'disabled' };
  if (!config.woocommerce?.baseUrl || !config.woocommerce?.consumerKey || !config.woocommerce?.consumerSecret) {
    return { ok: false, error: 'WooCommerce abandoned-checkout sync needs WOO_BASE_URL, WOO_CONSUMER_KEY, and WOO_CONSUMER_SECRET.' };
  }
  const { fetchWooCommerceCancelledOrders, fetchWooCommerceOrderById, fetchWooCommerceOrders } = await import('../../src/woocommerce.js');
  const fetchOrders = options.fetchWooCommerceCancelledOrders || fetchWooCommerceCancelledOrders;
  const items = [];
  let page = 0;
  let hasMore = false;
  do {
    page += 1;
    const result = await fetchOrders(config, { page, perPage: settings.pageSize || 50 });
    items.push(...(result.orders || []));
    hasMore = Boolean(result.hasMore);
  } while (hasMore && page < (settings.maxPages || 10));
  const payOrders = await scanWooPayOrders(config, {
    ...options,
    fetchWooCommerceOrderById: options.fetchWooCommerceOrderById || fetchWooCommerceOrderById,
    fetchWooCommerceOrders: options.fetchWooCommerceOrders || fetchWooCommerceOrders
  });
  const unique = new Map([...items, ...payOrders].map(order => [String(order.id), order]));
  return { ok: true, items: [...unique.values()], pages: page, stoppedByMaxPages: hasMore };
}

export async function scanWooPayOrders(config, options = {}) {
  const settings = config.woocommerce?.abandonedCheckoutSync || {};
  const listOrders = options.fetchWooCommerceOrders;
  const fetchOrder = options.fetchWooCommerceOrderById;
  const latest = await listOrders(config, { page: 1, perPage: 1, status: 'any', orderby: 'id', order: 'desc' });
  const latestCollectionId = Number(latest.orders?.[0]?.id || 0);
  const knownMax = Math.max(latestCollectionId, wooCheckoutScanMaxId);
  if (!knownMax) return [];
  const initial = wooCheckoutScanMaxId === 0;
  const lookback = initial ? (settings.initialIdLookback || 1000) : (settings.rescanIdLookback || 200);
  const firstId = Math.max(1, knownMax - lookback + 1);
  const lastId = knownMax + (settings.forwardIdProbe || 50);
  const ids = Array.from({ length: lastId - firstId + 1 }, (_, index) => firstId + index);
  const found = [];
  const concurrency = settings.scanConcurrency || 20;
  for (let offset = 0; offset < ids.length; offset += concurrency) {
    const batch = await Promise.all(ids.slice(offset, offset + concurrency).map(id => fetchOrder(id, config)));
    found.push(...batch.filter(Boolean));
  }
  wooCheckoutScanMaxId = Math.max(knownMax, ...found.map(order => Number(order.id) || 0));
  return found.filter(isWooPayAbandonedOrder);
}

export function isWooPayAbandonedOrder(order) {
  return String(order?.status || '').toLowerCase() === 'cancelled'
    && /^PAY-/i.test(String(order?.number || ''));
}

export function normalizeWooCancelledCheckout(order = {}) {
  const billing = order.billing || {};
  const createdAt = wooDate(order.date_created_gmt || order.date_created);
  const updatedAt = wooDate(order.date_modified_gmt || order.date_modified || order.date_created_gmt || order.date_created);
  return {
    source: 'woocommerce',
    external_checkout_id: String(order.id),
    wix_abandoned_checkout_id: null,
    customer_id: null,
    customer_name: [billing.first_name, billing.last_name].filter(Boolean).join(' '),
    email: billing.email || '',
    phone: billing.phone || '',
    cart_value: Number(order.total || 0),
    currency: order.currency || '',
    checkout_url: order.payment_url || '',
    items: order.line_items || [],
    wix_status: order.status || 'cancelled',
    wix_created_at: createdAt,
    wix_updated_at: updatedAt,
    raw_data: order
  };
}

export async function detectRecoveries(db) {
  const [{ data: leads, error: leadError }, { data: orders, error: orderError }] = await Promise.all([
    db.from('abandoned_cart_leads').select('id,customer_id,email,phone,wix_created_at,raw_data,recovered_order_id').is('recovered_order_id', null).not('wix_created_at', 'is', null).limit(1000),
    db.from('orders').select('id,customer_id,payment_status,source_created_at,customers(wix_contact_id,email,phone)').not('source_created_at', 'is', null).limit(5000)
  ]);
  if (leadError || orderError) return { ok: false, error: leadError?.message || orderError?.message };
  const paidOrders = (orders || []).filter(order => PAID_STATUSES.has(String(order.payment_status || '').toLowerCase()));
  const patches = [];
  for (const lead of leads || []) {
    const match = findRecoveryMatch(lead, paidOrders);
    if (match) patches.push({ id: lead.id, recovered_order_id: match.order.id, recovered_at: match.order.source_created_at, recovery_match_method: match.method, updated_at: new Date().toISOString() });
  }
  for (const patch of patches) {
    const { error } = await db.from('abandoned_cart_leads').update(patch).eq('id', patch.id).is('recovered_order_id', null);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, recovered: patches.length };
}

export async function resolveAbandonedCartProductSlug(lead, config, options = {}) {
  const first = Array.isArray(lead?.items) ? lead.items[0] : null;
  const catalogItemId = String(first?.catalogReference?.catalogItemId || '').trim();
  if (!catalogItemId || !config?.wix?.authToken || !config?.wix?.siteId) return '';
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(`https://www.wixapis.com/stores-reader/v1/products/${encodeURIComponent(catalogItemId)}`, {
    headers: { Authorization: config.wix.authToken, 'wix-site-id': config.wix.siteId }
  });
  if (!response.ok) return '';
  const body = await response.json();
  return String(body.product?.slug || '').trim();
}

function cleanText(value, limit) { return String(value || '').trim().slice(0, limit) || null; }
function parseDate(value) { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date.toISOString() : null; }
function wooDate(value) { if (!value) return null; const text = String(value); return /Z$|[+-]\d\d:\d\d$/.test(text) ? text : `${text}Z`; }
