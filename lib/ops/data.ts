import 'server-only';
import { cache } from 'react';
import { createServiceClient } from '@/lib/supabase/server';
import { findOrderIdsMatchingQuery } from '@/lib/crm/order-search';
import {
  ageInDays, effectiveShipmentState, SHIPPED_HISTORY_DAYS, STALE_UNBOOKED_DAYS, END_STATES, groupErrors, istDayStart, laneFor, orderStage, primaryShipment, reviewFlags, shipmentState,
  type Lane, type OrderRow, type OrderStage, type Review, type ShipmentRow, type ShipmentState, type ErrorGroup, type ErrorRow
} from './model.ts';

// Read side of the new Ops screens. Reads today's tables with narrow selects;
// writes still go through the existing, tested API routes until each module is
// rebuilt. No demo fallback: a misconfigured database is an error (spec §8).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function db(): Db {
  const client = createServiceClient();
  if (!client) throw new Error('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  return client;
}

const ID_CHUNK = 200;
const WORK_WINDOW_DAYS = 180;
const WORK_LIMIT = 3000;

const ORDER_COLUMNS = `
  id, order_number, external_order_id, woo_order_id, source, status, payment_status, internal_status,
  fulfillment_status, wix_fulfillment_status, shipment_status, total_amount, currency, selected_shipping_title, source_created_at, created_at, updated_at,
  automation_hold, automation_hold_reason, awb_number, courier, tracking_url,
  payment_method:raw_order->>payment_method,
  customers(name,phone,email),
  shipping_address:customer_addresses!orders_shipping_address_id_fkey(name,phone,address_line1,address_line2,city,state,postal_code,country),
  order_items(product_name,quantity,sku)
`;

const SHIPMENT_COLUMNS = 'id, order_id, status, waybill, courier_code, service_mode, courier_service_code, direction, pickup_location, tracking_url, label_url, created_at, updated_at';

type RawOrder = {
  id: string; order_number?: string | null; external_order_id?: string | null; woo_order_id?: string | null;
  source?: string | null; status?: string | null; payment_status?: string | null; internal_status?: string | null;
  fulfillment_status?: string | null; wix_fulfillment_status?: string | null; shipment_status?: string | null; total_amount?: number | string | null; currency?: string | null;
  selected_shipping_title?: string | null; source_created_at?: string | null; created_at?: string | null; updated_at?: string | null;
  automation_hold?: boolean | null; automation_hold_reason?: string | null; awb_number?: string | null; courier?: string | null;
  tracking_url?: string | null; payment_method?: string | null;
  customers?: { name?: string | null; phone?: string | null; email?: string | null } | null;
  shipping_address?: { name?: string | null; phone?: string | null; address_line1?: string | null; address_line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null } | null;
  order_items?: { product_name?: string | null; quantity?: number | string | null; sku?: string | null }[] | null;
};

export type OpsShipment = ShipmentRow & {
  state: ShipmentState;
  /** State taken from the store's fulfilment because tracking never updated the row. */
  inferred?: boolean;
  courier_code?: string | null;
  service_mode?: string | null;
  courier_service_code?: string | null;
  pickup_location?: string | null;
  tracking_url?: string | null;
  label_url?: string | null;
};

export type OpsOrder = {
  id: string;
  number: string;
  source: string;
  stage: OrderStage;
  lane: Lane;
  review: Review[];
  customer: string;
  phone: string;
  email: string;
  address1: string;
  address2: string;
  postalCode: string;
  city: string;
  state: string;
  country: string;
  total: number | null;
  currency: string;
  items: string;
  itemCount: number;
  placedAt: string | null;
  updatedAt: string | null;
  paymentStatus: string;
  shippingMethod: string;
  shipment: OpsShipment | null;
  shipments: OpsShipment[];
};

function toShipment(row: ShipmentRow & Record<string, unknown>): OpsShipment {
  return { ...row, state: shipmentState(row) } as OpsShipment;
}

function toOrder(row: RawOrder, rawShipments: OpsShipment[]): OpsOrder {
  const address = row.shipping_address ?? {};
  const customer = row.customers ?? {};
  const base: OrderRow = {
    ...row,
    country: address.country,
    postal_code: address.postal_code,
    phone: address.phone || customer.phone,
    placed_at: row.source_created_at || row.created_at
  };
  const shipments = rawShipments.map(shipment => {
    const state = effectiveShipmentState(shipment, base);
    return state === shipment.state ? shipment : { ...shipment, state, inferred: true };
  });
  const primary = primaryShipment(shipments);
  const stage = orderStage(base, primary);
  const items = row.order_items ?? [];
  return {
    id: row.id,
    number: String(row.order_number || row.woo_order_id || row.external_order_id || row.id.slice(0, 8)),
    source: String(row.source || ''),
    stage,
    lane: laneFor(base),
    review: reviewFlags(base, stage),
    customer: String(address.name || customer.name || 'Unknown customer'),
    phone: String(address.phone || customer.phone || ''),
    email: String(customer.email || ''),
    address1: String(address.address_line1 || ''),
    address2: String(address.address_line2 || ''),
    postalCode: String(address.postal_code || ''),
    city: String(address.city || ''),
    state: String(address.state || ''),
    country: String(address.country || ''),
    total: row.total_amount === null || row.total_amount === undefined ? null : Number(row.total_amount),
    currency: String(row.currency || 'INR'),
    items: items.map(item => `${Number(item.quantity) > 1 ? `${Number(item.quantity)}× ` : ''}${item.product_name || item.sku || 'Item'}`).join(', '),
    itemCount: items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0),
    placedAt: row.source_created_at || row.created_at || null,
    updatedAt: row.updated_at || null,
    paymentStatus: String(row.payment_status || ''),
    shippingMethod: String(row.selected_shipping_title || ''),
    shipment: (primary as OpsShipment | null) ?? null,
    shipments
  };
}

async function shipmentsForOrders(client: Db, orderIds: string[]): Promise<Map<string, OpsShipment[]>> {
  const map = new Map<string, OpsShipment[]>();
  for (let start = 0; start < orderIds.length; start += ID_CHUNK) {
    const chunk = orderIds.slice(start, start + ID_CHUNK);
    const { data, error } = await client.from('shipments').select(SHIPMENT_COLUMNS).in('order_id', chunk);
    if (error) throw new Error(`Could not load shipments: ${error.message}`);
    for (const row of data ?? []) {
      const list = map.get(row.order_id) ?? [];
      list.push(toShipment(row));
      map.set(row.order_id, list);
    }
  }
  return map;
}

async function hydrate(client: Db, rows: RawOrder[]): Promise<OpsOrder[]> {
  const shipments = await shipmentsForOrders(client, rows.map(row => row.id));
  return rows.map(row => toOrder(row, shipments.get(row.id) ?? []));
}

/**
 * Every order from the last WORK_WINDOW_DAYS, hydrated with shipments and a derived stage.
 * Queues, Today counts and stage filters all read from this one snapshot per request.
 */
export const loadWorkingSet = cache(async (): Promise<OpsOrder[]> => {
  const client = db();
  const since = new Date(Date.now() - WORK_WINDOW_DAYS * 86_400_000).toISOString();
  const rows: RawOrder[] = [];
  for (let offset = 0; offset < WORK_LIMIT; offset += 1000) {
    const { data, error } = await client
      .from('orders')
      .select(ORDER_COLUMNS)
      .neq('source', 'merged')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(offset, offset + 999);
    if (error) throw new Error(`Could not load orders: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return hydrate(client, rows);
});

export type OrderListFilter = { q?: string; stage?: string; lane?: string; page?: number; pageSize?: number };

export async function listOrders(filter: OrderListFilter) {
  const pageSize = Math.min(Math.max(Number(filter.pageSize) || 50, 10), 100);
  const page = Math.max(Number(filter.page) || 1, 1);
  const client = db();
  let orders: OpsOrder[];
  if (filter.q?.trim()) {
    const ids: string[] = await findOrderIdsMatchingQuery(client, filter.q, { all: true });
    const rows: RawOrder[] = [];
    for (let start = 0; start < Math.min(ids.length, 1000); start += ID_CHUNK) {
      const { data, error } = await client.from('orders').select(ORDER_COLUMNS).in('id', ids.slice(start, start + ID_CHUNK)).neq('source', 'merged');
      if (error) throw new Error(`Could not search orders: ${error.message}`);
      rows.push(...(data ?? []));
    }
    rows.sort((a, b) => String(b.source_created_at || b.created_at || '').localeCompare(String(a.source_created_at || a.created_at || '')));
    orders = await hydrate(client, rows);
  } else {
    orders = await loadWorkingSet();
  }
  const counts = countBy(orders, order => order.stage);
  const filtered = orders.filter(order =>
    (!filter.stage || stageGroup(filter.stage).includes(order.stage)) && (!filter.lane || order.lane === filter.lane));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  return {
    orders: filtered.slice((current - 1) * pageSize, current * pageSize),
    total: filtered.length,
    page: current,
    pageCount,
    counts,
    searched: Boolean(filter.q?.trim())
  };
}

export const STAGE_GROUPS: Record<string, OrderStage[]> = {
  to_book: ['paid', 'on_hold'],
  awaiting_pickup: ['booked', 'pickup_requested'],
  in_transit: ['shipped', 'out_for_delivery'],
  delivered: ['delivered'],
  problems: ['delivery_failed', 'rto_in_transit', 'rto_delivered', 'lost'],
  closed: ['cancelled', 'refunded', 'not_paid']
};

function stageGroup(key: string): OrderStage[] {
  return STAGE_GROUPS[key] ?? [key as OrderStage];
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
}

export async function getOrderDetail(id: string) {
  const client = db();
  const { data: row, error } = await client
    .from('orders')
    .select(`${ORDER_COLUMNS}, subtotal, shipping_amount, tax_amount, discount_amount, notes_text:notes,
      billing_address:customer_addresses!orders_billing_address_id_fkey(name,phone,address_line1,address_line2,city,state,postal_code,country),
      full_shipping:customer_addresses!orders_shipping_address_id_fkey(name,phone,address_line1,address_line2,city,state,postal_code,country),
      line_items:order_items(product_name,quantity,sku,item_price,total_price,hsn_code)`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Could not load order: ${error.message}`);
  if (!row) return null;
  const shipments = (await shipmentsForOrders(client, [id])).get(id) ?? [];
  const order = toOrder(row, shipments);
  const shipmentIds = shipments.map(s => s.id);

  const [events, notes, messages, whatsapp, attempts, errors] = await Promise.all([
    shipmentIds.length
      ? client.from('shipment_events').select('id, shipment_id, event_status, normalized_status, carrier_location, message, occurred_at').in('shipment_id', shipmentIds).order('occurred_at', { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
    client.from('notes').select('id, body, note_type, actor_name, created_at').eq('order_id', id).order('created_at', { ascending: false }).limit(100),
    client.from('customer_messages').select('id, message_type, channel, status, attempts, error, sent_at, created_at').eq('order_id', id).order('created_at', { ascending: false }),
    client.from('whatsapp_message_events').select('id, event_type, template_name, status, attempts, error, sent_at, created_at').eq('order_id', id).order('created_at', { ascending: false }),
    client.from('automation_action_attempts').select('id, action_type, status, attempts, last_error, updated_at').eq('order_id', id).order('updated_at', { ascending: false }).limit(30),
    client.from('integration_errors').select('id, integration, operation, message, status, occurred_at').eq('status', 'open').contains('payload', { orderId: id }).limit(20)
  ]);

  return {
    order,
    raw: row,
    events: (events.data ?? []) as ShipmentEvent[],
    notes: (notes.data ?? []) as Note[],
    messages: [
      ...((whatsapp.data ?? []) as WhatsAppEvent[]).map(m => ({ id: m.id, label: templateLabel(m.event_type, m.template_name), status: m.status, attempts: m.attempts, error: m.error, at: m.sent_at || m.created_at })),
      ...((messages.data ?? []) as CustomerMessage[]).map(m => ({ id: m.id, label: templateLabel(m.message_type, ''), status: m.status, attempts: m.attempts, error: m.error, at: m.sent_at || m.created_at }))
    ].sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? ''))),
    attempts: (attempts.data ?? []) as Attempt[],
    errors: (errors.data ?? []) as IntegrationError[]
  };
}

export type ShipmentEvent = { id: string; shipment_id: string; event_status: string | null; normalized_status: string | null; carrier_location: string | null; message: string | null; occurred_at: string | null };
export type Note = { id: string; body: string; note_type: string; actor_name: string | null; created_at: string };
type CustomerMessage = { id: string; message_type: string; channel: string; status: string; attempts: number; error: string | null; sent_at: string | null; created_at: string };
type WhatsAppEvent = { id: string; event_type: string; template_name: string; status: string; attempts: number; error: string | null; sent_at: string | null; created_at: string };
export type Attempt = { id: string; action_type: string; status: string; attempts: number; last_error: string | null; updated_at: string };
export type IntegrationError = { id: string; integration: string; operation: string; message: string; status: string; occurred_at: string };

function templateLabel(type: string, template: string): string {
  const key = String(type || '').replace(/[-_]+/g, ' ').trim();
  const pretty = key ? key[0]!.toUpperCase() + key.slice(1) : 'Message';
  return template ? `${pretty} · ${template}` : pretty;
}

// ---------- Today ----------

export type TodaySummary = Awaited<ReturnType<typeof loadToday>>;

export async function loadToday() {
  const client = db();
  const orders = await loadWorkingSet();
  const now = new Date();
  const todayStart = istDayStart(now);
  const yesterdayStart = istDayStart(now, -1);

  const toBook = orders.filter(o => o.stage === 'paid' && !isStale(o, now));
  const staleUnbooked = orders.filter(o => o.stage === 'paid' && isStale(o, now));
  const onHold = orders.filter(o => o.stage === 'on_hold' || (o.stage === 'paid' && o.review.length));
  const toPickUp = orders.filter(o => o.stage === 'booked' || o.stage === 'pickup_requested');
  const moving = orders.filter(o => isMoving(o, now));
  const problems = orders.filter(o => ['delivery_failed', 'rto_in_transit', 'rto_delivered', 'lost'].includes(o.stage)
    || o.shipments.some(s => s.state === 'exception' || s.state === 'not_picked'));
  const placedToday = orders.filter(o => (o.placedAt ?? '') >= todayStart && o.stage !== 'not_paid');
  const placedYesterday = orders.filter(o => (o.placedAt ?? '') >= yesterdayStart && (o.placedAt ?? '') < todayStart && o.stage !== 'not_paid');
  const deliveredToday = orders.filter(o => o.stage === 'delivered' && o.shipment?.updated_at && o.shipment.updated_at >= todayStart);
  const stuck = moving.filter(o => {
    const age = ageInDays(o.shipment?.updated_at, now);
    return age !== null && age >= (o.lane === 'domestic' ? 3 : 5);
  });
  const oldestToBook = toBook.reduce<number | null>((max, o) => {
    const age = ageInDays(o.placedAt, now);
    return age === null ? max : Math.max(max ?? 0, age);
  }, null);

  const [runs, openErrors] = await Promise.all([
    client.from('automation_runs').select('id, trigger, status, started_at, finished_at, counters, error_summary').order('started_at', { ascending: false }).limit(12),
    client.from('integration_errors').select('id, integration, operation, message, occurred_at', { count: 'exact' }).eq('status', 'open').order('occurred_at', { ascending: false }).limit(1000)
  ]);
  const errorGroups = groupErrors((openErrors.data ?? []) as ErrorRow[]);

  const stageCounts = countBy(orders, o => o.stage);
  const revenueToday = placedToday.reduce((sum, o) => sum + (o.total ?? 0), 0);

  return {
    toBook, staleUnbooked, onHold, toPickUp, moving, problems, stuck, deliveredToday, placedToday, placedYesterday,
    oldestToBook, stageCounts, revenueToday,
    recent: orders.filter(o => o.stage !== 'not_paid').slice(0, 8),
    runs: (runs.data ?? []) as AutomationRun[],
    errorGroups,
    openErrorRows: openErrors.count ?? 0
  };
}

export function isStale(order: OpsOrder, now: Date = new Date()): boolean {
  const age = ageInDays(order.placedAt, now);
  return age !== null && age > STALE_UNBOOKED_DAYS;
}

/** Shipped and still producing tracking updates recently (not months-old history). */
export function isMoving(order: OpsOrder, now: Date = new Date()): boolean {
  if (order.stage !== 'shipped' && order.stage !== 'out_for_delivery') return false;
  const age = ageInDays(order.shipment?.updated_at ?? order.updatedAt, now);
  return age !== null && age <= SHIPPED_HISTORY_DAYS && !order.shipment?.inferred;
}

export type AutomationRun = { id: string; trigger: string; status: string; started_at: string; finished_at: string | null; counters: Record<string, number> | null; error_summary: string | null };

// ---------- Queues ----------

export async function loadBookingQueue() {
  const orders = await loadWorkingSet();
  const queue = orders
    .filter(o => o.stage === 'paid' || o.stage === 'on_hold')
    .sort((a, b) => String(a.placedAt ?? '').localeCompare(String(b.placedAt ?? '')));
  const failed = orders.filter(o => o.stage === 'paid' && o.shipments.some(s => s.state === 'booking_failed'));
  return { queue, failed: new Set(failed.map(o => o.id)) };
}

export type PickupGroup = { key: string; location: string; courier: string; rows: { order: OpsOrder; shipment: OpsShipment }[] };

export async function loadPickupBoard() {
  const orders = await loadWorkingSet();
  const groups = new Map<string, PickupGroup>();
  const notPicked: { order: OpsOrder; shipment: OpsShipment }[] = [];
  for (const order of orders) {
    for (const shipment of order.shipments) {
      if (!['booked', 'pickup_requested', 'not_picked'].includes(shipment.state) || !shipment.waybill) continue;
      if (shipment.state === 'not_picked') notPicked.push({ order, shipment });
      const location = shipment.pickup_location || 'No pickup location';
      const courier = shipment.courier_code || 'delhivery';
      const key = `${location}::${courier}`;
      const group = groups.get(key) ?? { key, location, courier, rows: [] };
      group.rows.push({ order, shipment });
      groups.set(key, group);
    }
  }
  const list = [...groups.values()].sort((a, b) => a.location.localeCompare(b.location) || a.courier.localeCompare(b.courier));
  for (const group of list) group.rows.sort((a, b) => String(a.shipment.created_at ?? '').localeCompare(String(b.shipment.created_at ?? '')));
  return { groups: list, notPicked };
}

export type ExceptionItem = {
  key: string;
  kind: 'ndr' | 'rto' | 'not_picked' | 'lost' | 'stuck' | 'review' | 'integration' | 'booking_failed' | 'exception';
  title: string;
  detail: string;
  at: string | null;
  order?: OpsOrder;
  group?: ErrorGroup;
};

export async function loadExceptions() {
  const client = db();
  const orders = await loadWorkingSet();
  const now = new Date();
  const items: ExceptionItem[] = [];
  for (const order of orders) {
    const s = order.shipment;
    const at = s?.updated_at ?? order.updatedAt;
    if (order.stage === 'delivery_failed') items.push({ key: `ndr:${order.id}`, kind: 'ndr', title: 'Delivery failed (NDR)', detail: 'Call the customer, then ask the courier to reattempt or return.', at, order });
    else if (order.stage === 'rto_in_transit') items.push({ key: `rto:${order.id}`, kind: 'rto', title: 'Returning to warehouse (RTO)', detail: 'Record the reason; decide reship, refund or replacement when it arrives.', at, order });
    else if (order.stage === 'rto_delivered') items.push({ key: `rtod:${order.id}`, kind: 'rto', title: 'Returned to warehouse', detail: 'Record the outcome: reship, refund or replacement.', at, order });
    else if (order.stage === 'lost') items.push({ key: `lost:${order.id}`, kind: 'lost', title: 'Lost or damaged', detail: 'Raise a courier claim and decide whether to reship.', at, order });
    for (const shipment of order.shipments) {
      if (shipment.state === 'not_picked') items.push({ key: `np:${shipment.id}`, kind: 'not_picked', title: 'Courier missed pickup', detail: 'Goes back on the pickup list for the next day.', at: shipment.updated_at ?? null, order });
      if (shipment.state === 'exception' && !END_STATES.has(shipment.state)) items.push({ key: `ex:${shipment.id}`, kind: 'exception', title: `Unrecognised courier status “${shipment.status}”`, detail: 'Check the courier portal; this never counts as progress.', at: shipment.updated_at ?? null, order });
    }
    if (order.stage === 'paid' && order.shipments.some(sh => sh.state === 'booking_failed')) items.push({ key: `bf:${order.id}`, kind: 'booking_failed', title: 'Booking failed', detail: 'Courier rejected the booking. Fix the address or box and book again.', at, order });
    if ((order.stage === 'paid' || order.stage === 'on_hold') && order.review.length) items.push({ key: `rv:${order.id}`, kind: 'review', title: 'Needs review before booking', detail: order.review.map(r => r.reason).join(' · '), at: order.placedAt, order });
    if (isMoving(order, now)) {
      const age = ageInDays(s?.updated_at, now);
      if (age !== null && age >= (order.lane === 'domestic' ? 3 : 5)) items.push({ key: `st:${order.id}`, kind: 'stuck', title: `No movement for ${age} days`, detail: 'Check tracking and chase the courier.', at, order });
    }
  }
  const { data, count } = await client.from('integration_errors').select('id, integration, operation, message, occurred_at', { count: 'exact' }).eq('status', 'open').order('occurred_at', { ascending: false }).limit(1000);
  const errorGroups = groupErrors((data ?? []) as ErrorRow[]);
  for (const group of errorGroups) {
    items.push({ key: `ie:${group.key}`, kind: 'integration', title: `${group.integration} · ${group.operation}`, detail: group.message, at: group.latest, group });
  }
  items.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  return { items, counts: countBy(items, item => item.kind), errorRows: count ?? 0 };
}

// ---------- Shipments ----------

export async function loadShipmentBoard(filter: { state?: string; courier?: string }) {
  const orders = await loadWorkingSet();
  const rows = orders.flatMap(order => order.shipments.map(shipment => ({ order, shipment })))
    .filter(({ shipment }) => (!filter.state || shipment.state === filter.state) && (!filter.courier || shipment.courier_code === filter.courier))
    .sort((a, b) => String(b.shipment.updated_at ?? '').localeCompare(String(a.shipment.updated_at ?? '')));
  const all = orders.flatMap(order => order.shipments);
  return { rows: rows.slice(0, 300), total: rows.length, counts: countBy(all, s => s.state), couriers: [...new Set(all.map(s => s.courier_code || 'unknown'))].sort() };
}

// ---------- Automation ----------

export async function loadAutomation() {
  const client = db();
  const [runs, settings] = await Promise.all([
    client.from('automation_runs').select('id, trigger, status, started_at, finished_at, counters, error_summary').order('started_at', { ascending: false }).limit(40),
    client.from('crm_settings').select('key, value, updated_at')
  ]);
  return { runs: (runs.data ?? []) as AutomationRun[], settings: (settings.data ?? []) as { key: string; value: unknown; updated_at: string }[] };
}

// ---------- Carts ----------

export async function loadCarts(stage?: string) {
  const client = db();
  let query = client.from('abandoned_cart_leads')
    .select('id, customer_name, email, phone, cart_value, currency, items, lead_status, next_follow_up_at, last_contacted_at, recovered_order_id, recovered_at, source, created_at, updated_at, wix_created_at')
    .order('created_at', { ascending: false })
    .limit(300);
  if (stage === 'recovered') query = query.not('recovered_order_id', 'is', null);
  else if (stage) query = query.eq('lead_status', stage).is('recovered_order_id', null);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load carts: ${error.message}`);
  return (data ?? []) as Cart[];
}

export type Cart = {
  id: string; customer_name: string | null; email: string | null; phone: string | null; cart_value: number | null; currency: string | null;
  items: { name?: string; productName?: string; quantity?: number }[] | null; lead_status: string; next_follow_up_at: string | null;
  last_contacted_at: string | null; recovered_order_id: string | null; recovered_at: string | null; source: string; created_at: string;
  updated_at: string; wix_created_at: string | null;
};
