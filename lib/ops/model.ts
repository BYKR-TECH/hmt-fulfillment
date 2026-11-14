// Domain model for the rebuilt Ops screens (rebuild spec §3).
//
// Until the stage/state migrations are applied, order stage and shipment state
// are derived from today's columns (orders.internal_status, payment_status,
// shipments.status …), which mix Wix/Woo spellings and hyphen/underscore forms.
// Everything here is pure so it can be unit-tested without a database.

export const ORDER_STAGES = [
  'not_paid', 'paid', 'booked', 'pickup_requested', 'shipped', 'out_for_delivery', 'delivered',
  'on_hold', 'delivery_failed', 'rto_in_transit', 'rto_delivered', 'cancelled', 'refunded', 'lost'
] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export const SHIPMENT_STATES = [
  'booking', 'booking_failed', 'booked', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery',
  'delivery_failed', 'delivered', 'rto_in_transit', 'rto_delivered', 'not_picked', 'cancelled', 'lost_damaged', 'exception'
] as const;
export type ShipmentState = (typeof SHIPMENT_STATES)[number];

export type Lane = 'domestic' | 'intl_standard' | 'intl_express';
export type Tone = 'neutral' | 'info' | 'brand' | 'violet' | 'ok' | 'warn' | 'bad';

// The happy path shown as a progress bar on the order page.
export const HAPPY_PATH: OrderStage[] = ['paid', 'booked', 'pickup_requested', 'shipped', 'out_for_delivery', 'delivered'];

export const STAGE_META: Record<OrderStage, { label: string; tone: Tone }> = {
  not_paid: { label: 'Not paid', tone: 'neutral' },
  paid: { label: 'To book', tone: 'info' },
  booked: { label: 'Booked', tone: 'brand' },
  pickup_requested: { label: 'Pickup requested', tone: 'brand' },
  shipped: { label: 'Shipped', tone: 'violet' },
  out_for_delivery: { label: 'Out for delivery', tone: 'violet' },
  delivered: { label: 'Delivered', tone: 'ok' },
  on_hold: { label: 'On hold', tone: 'warn' },
  delivery_failed: { label: 'Delivery failed', tone: 'bad' },
  rto_in_transit: { label: 'Returning', tone: 'bad' },
  rto_delivered: { label: 'Returned', tone: 'warn' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  refunded: { label: 'Refunded', tone: 'neutral' },
  lost: { label: 'Lost / damaged', tone: 'bad' }
};

export const SHIPMENT_META: Record<ShipmentState, { label: string; tone: Tone }> = {
  booking: { label: 'Booking', tone: 'info' },
  booking_failed: { label: 'Booking failed', tone: 'bad' },
  booked: { label: 'Booked', tone: 'brand' },
  pickup_requested: { label: 'Pickup requested', tone: 'brand' },
  picked_up: { label: 'Picked up', tone: 'violet' },
  in_transit: { label: 'In transit', tone: 'violet' },
  out_for_delivery: { label: 'Out for delivery', tone: 'violet' },
  delivery_failed: { label: 'Delivery failed', tone: 'bad' },
  delivered: { label: 'Delivered', tone: 'ok' },
  rto_in_transit: { label: 'Returning (RTO)', tone: 'bad' },
  rto_delivered: { label: 'Returned', tone: 'warn' },
  not_picked: { label: 'Not picked', tone: 'warn' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  lost_damaged: { label: 'Lost / damaged', tone: 'bad' },
  exception: { label: 'Needs a look', tone: 'warn' }
};

export const LANE_LABEL: Record<Lane, string> = {
  domestic: 'Domestic',
  intl_standard: 'International',
  intl_express: 'International express'
};

export const END_STATES = new Set<ShipmentState>(['booking_failed', 'delivered', 'rto_delivered', 'cancelled', 'lost_damaged']);
const INACTIVE_FOR_ORDER = new Set<ShipmentState>(['booking_failed', 'cancelled']);

export function normalizeKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

const SHIPMENT_STATUS_MAP: Record<string, ShipmentState> = {
  pending: 'booking',
  pending_zone: 'booking',
  pending_international: 'booking',
  awaiting_fedex_awb: 'booking',
  booked: 'booked',
  shipment_booked: 'booked',
  manifested: 'booked',
  ready_to_ship: 'booked',
  pickup_pending: 'pickup_requested',
  pickup_scheduled: 'pickup_requested',
  pickup_error: 'not_picked',
  not_picked: 'not_picked',
  picked_up: 'picked_up',
  collected: 'picked_up',
  dispatched: 'in_transit',
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  failed_delivery: 'delivery_failed',
  undelivered: 'delivery_failed',
  delivered: 'delivered',
  rto: 'rto_in_transit',
  rto_in_transit: 'rto_in_transit',
  returned: 'rto_delivered',
  rto_delivered: 'rto_delivered',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  lost: 'lost_damaged',
  damaged: 'lost_damaged'
};

export type ShipmentRow = {
  id: string;
  order_id?: string | null;
  status?: string | null;
  waybill?: string | null;
  courier_code?: string | null;
  direction?: string | null;
  shipment_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function shipmentState(row: Pick<ShipmentRow, 'status' | 'waybill'>): ShipmentState {
  const key = normalizeKey(row.status);
  if (key === 'failed') {
    // The legacy code writes "failed" both for a rejected booking (no AWB) and
    // for carrier-side failures; only the first is a booking failure.
    return row.waybill ? 'exception' : 'booking_failed';
  }
  return SHIPMENT_STATUS_MAP[key] ?? 'exception';
}

export function isOutbound(row: Pick<ShipmentRow, 'direction' | 'shipment_type'>): boolean {
  return normalizeKey(row.direction) !== 'reverse' && !['reverse', 'rto'].includes(normalizeKey(row.shipment_type));
}

/** The original (first) outbound shipment that is still active, else the newest outbound one. */
export function primaryShipment<T extends ShipmentRow>(shipments: readonly T[]): T | null {
  const outbound = shipments.filter(isOutbound).slice().sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  const active = outbound.filter(row => !INACTIVE_FOR_ORDER.has(shipmentState(row)));
  const originals = active.filter(row => normalizeKey(row.shipment_type || 'original') === 'original');
  return originals[0] ?? active[0] ?? outbound[outbound.length - 1] ?? null;
}

export type OrderRow = {
  id: string;
  source?: string | null;
  status?: string | null;
  payment_status?: string | null;
  internal_status?: string | null;
  fulfillment_status?: string | null;
  wix_fulfillment_status?: string | null;
  shipment_status?: string | null;
  automation_hold?: boolean | null;
  automation_hold_reason?: string | null;
  payment_method?: string | null;
  selected_shipping_title?: string | null;
  country?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  placed_at?: string | null;
};

/** Paid but never booked for this long: probably shipped outside Ops or abandoned. */
export const STALE_UNBOOKED_DAYS = 30;
/** Shipped with no update for this long: treated as history, not live work. */
export const SHIPPED_HISTORY_DAYS = 30;

const PAID = new Set(['paid', 'approved']);

export function isPaid(order: OrderRow): boolean {
  return PAID.has(normalizeKey(order.payment_status));
}

export function isCod(order: OrderRow): boolean {
  return normalizeKey(order.payment_method) === 'cod';
}

const STATE_TO_STAGE: Partial<Record<ShipmentState, OrderStage>> = {
  booking: 'paid',
  booked: 'booked',
  pickup_requested: 'pickup_requested',
  not_picked: 'pickup_requested',
  picked_up: 'shipped',
  in_transit: 'shipped',
  out_for_delivery: 'out_for_delivery',
  delivery_failed: 'delivery_failed',
  delivered: 'delivered',
  rto_in_transit: 'rto_in_transit',
  rto_delivered: 'rto_delivered',
  lost_damaged: 'lost',
  exception: 'booked'
};

const PRE_PICKUP = new Set<ShipmentState>(['booking', 'booked', 'pickup_requested', 'not_picked', 'exception']);

/**
 * The store already shows the order as fulfilled/shipped (Wix FULFILLED, Woo
 * shipped/completed pulled back as "fulfilled"). The old screens treat that as
 * collected even when the shipment row was never updated by tracking.
 */
export function isChannelFulfilled(order: OrderRow): boolean {
  const wix = normalizeKey(order.wix_fulfillment_status);
  if (wix === 'awaiting_pickup') return false;
  return normalizeKey(order.fulfillment_status) === 'fulfilled' || ['fulfilled', 'synced', 'synced_from_wix'].includes(wix);
}

/** Shipment state, corrected for orders the store already shows as shipped. */
export function effectiveShipmentState(row: Pick<ShipmentRow, 'status' | 'waybill'>, order: OrderRow): ShipmentState {
  const state = shipmentState(row);
  return PRE_PICKUP.has(state) && isChannelFulfilled(order) ? 'picked_up' : state;
}

export function orderStage(order: OrderRow, primary: ShipmentRow | null): OrderStage {
  const internal = normalizeKey(order.internal_status);
  const status = normalizeKey(order.status);
  const payment = normalizeKey(order.payment_status);
  const shipment = primary ? effectiveShipmentState(primary, order) : null;
  const pickedUp = shipment !== null && !['booking', 'booked', 'pickup_requested', 'not_picked', 'exception', 'cancelled', 'booking_failed'].includes(shipment);

  if (!pickedUp) {
    if (payment === 'refunded') return 'refunded';
    if (internal === 'cancelled' || status === 'cancelled' || status === 'canceled') return 'cancelled';
  }
  if (shipment && !INACTIVE_FOR_ORDER.has(shipment)) return STATE_TO_STAGE[shipment] ?? 'booked';

  // No active shipment: fall back to what the old screens recorded.
  if (internal === 'installation_pending' || internal === 'installation_done' || internal === 'completed' || normalizeKey(order.shipment_status) === 'delivered') return 'delivered';
  if (internal === 'fulfilled' || internal === 'fulfilled_no_tracking' || isChannelFulfilled(order)) return 'shipped';
  if (!isPaid(order) && !isCod(order)) return 'not_paid';
  if (order.automation_hold) return 'on_hold';
  return 'paid';
}

export type Review = { reason: string; tone: Tone };

/** Reasons an order needs a human before it can be booked (spec §4.1 step 2). */
export function reviewFlags(order: OrderRow, stage: OrderStage, now: Date = new Date()): Review[] {
  const flags: Review[] = [];
  const waiting = ageInDays(order.placed_at, now);
  if (stage === 'paid' && waiting !== null && waiting > STALE_UNBOOKED_DAYS) flags.push({ reason: `Paid ${waiting} days ago and never booked — check whether it shipped outside Ops, then cancel or book`, tone: 'warn' });
  if (isCod(order) && ['paid', 'on_hold'].includes(stage)) flags.push({ reason: 'Cash on delivery — not offered, check before booking', tone: 'warn' });
  if (stage === 'paid' || stage === 'on_hold') {
    const lane = laneFor(order);
    const pin = String(order.postal_code ?? '').replace(/\s/g, '');
    if (lane === 'domestic' && !/^[1-9]\d{5}$/.test(pin)) flags.push({ reason: 'PIN code is not a valid 6-digit Indian PIN', tone: 'bad' });
    if (!String(order.phone ?? '').replace(/\D/g, '')) flags.push({ reason: 'No phone number', tone: 'bad' });
  }
  if (normalizeKey(order.internal_status) === 'awaiting_fedex_awb' && ['paid', 'on_hold'].includes(stage)) flags.push({ reason: 'In the FedEx export batch — enter the FedEx AWB once booked', tone: 'info' });
  if (order.automation_hold) flags.push({ reason: order.automation_hold_reason ? `On hold: ${order.automation_hold_reason}` : 'On hold', tone: 'warn' });
  return flags;
}

export function laneFor(order: Pick<OrderRow, 'country' | 'selected_shipping_title'>): Lane {
  const country = String(order.country ?? '').trim().toUpperCase();
  if (!country || country === 'IN' || country === 'INDIA') return 'domestic';
  return /express|priority/i.test(String(order.selected_shipping_title ?? '')) ? 'intl_express' : 'intl_standard';
}

// ---------- Formatting ----------

const IST = 'Asia/Kolkata';

export function formatMoney(value: unknown, currency = 'INR'): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
}

export function formatDate(value: unknown, withTime = false): string {
  const date = new Date(String(value ?? ''));
  if (!value || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST, day: 'numeric', month: 'short',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {})
  }).format(date);
}

export function relativeAge(value: unknown, now: Date = new Date()): string {
  const date = new Date(String(value ?? ''));
  if (!value || Number.isNaN(date.getTime())) return '—';
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

export function ageInDays(value: unknown, now: Date = new Date()): number | null {
  const time = Date.parse(String(value ?? ''));
  return Number.isFinite(time) ? Math.floor((now.getTime() - time) / 86_400_000) : null;
}

/** Start of the current IST day as a UTC ISO string. */
export function istDayStart(now: Date = new Date(), offsetDays = 0): string {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600_000 + offsetDays * 86_400_000).toISOString();
}

export function trackingLink(awb: unknown): string | null {
  const value = String(awb ?? '').trim();
  return value ? `https://track.holdmythrottle.com/${encodeURIComponent(value)}` : null;
}

// ---------- Integration errors ----------

export type ErrorRow = { id: string; integration: string; operation: string; message: string; occurred_at: string };
export type ErrorGroup = { key: string; integration: string; operation: string; message: string; count: number; latest: string; ids: string[] };

/**
 * The old automation logs the same failure every 15 minutes, so the table holds
 * many copies of one problem. Group copies by integration + operation + message
 * (with numbers masked, so "order 10234" and "order 10235" stay separate only
 * when the operation differs).
 */
export function groupErrors(rows: readonly ErrorRow[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();
  for (const row of rows) {
    const shape = String(row.message ?? '').replace(/\d+/g, '#').slice(0, 160);
    const key = `${row.integration}|${row.operation}|${shape}`;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      if (row.occurred_at > group.latest) { group.latest = row.occurred_at; group.message = row.message; }
      if (group.ids.length < 50) group.ids.push(row.id);
    } else {
      groups.set(key, { key, integration: row.integration, operation: row.operation, message: row.message, count: 1, latest: row.occurred_at, ids: [row.id] });
    }
  }
  return [...groups.values()].sort((a, b) => b.latest.localeCompare(a.latest));
}

/** Delhivery pickup slot: today (next hour, from 11:00) before the 16:00 IST cut-off, else tomorrow 11:00. */
export function pickupWindow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(part => [part.type, part.value]));
  const hour = Number(parts.hour);
  if (hour < 16) {
    const nextHour = String(Math.max(hour + 1, 11)).padStart(2, '0');
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${nextHour}:00:00` };
  }
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const t = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(tomorrow).map(part => [part.type, part.value]));
  return { date: `${t.year}-${t.month}-${t.day}`, time: '11:00:00' };
}
