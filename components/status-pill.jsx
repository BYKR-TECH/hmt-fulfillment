const danger = new Set(['issue_reported', 'failed_delivery', 'rto', 'rto_initiated', 'rto_delivered', 'lost_damaged', 'cancelled', 'canceled', 'warranty_case', 'installation_issue', 'negative_feedback', 'issue_escalated']);
const warn = new Set(['new', 'not_paid', 'awaiting_packing', 'pickup_pending', 'installation_pending', 'feedback_pending', 'customer_needs_help', 'not_contacted', 'fulfilled_no_tracking', 'not_fulfilled']);
const ok = new Set(['packed', 'booked', 'shipment_booked', 'picked_up', 'in_transit', 'in-transit', 'delivered', 'installed_successfully', 'positive_feedback', 'review_received', 'ugc_received', 'completed', 'fulfilled', 'paid', 'approved', 'synced', 'synced_from_wix']);
const info = new Set(['guide_sent', 'video_sent', 'installation_scheduled', 'review_requested', 'out_for_delivery', 'pending_international', 'pending-international', 'partially_fulfilled']);

export function StatusPill({ value }) {
  const key = String(value || 'not_set').toLowerCase();
  const tone = danger.has(key) ? 'danger' : warn.has(key) ? 'warn' : ok.has(key) ? 'ok' : info.has(key) ? 'info' : 'neutral';
  return <span className={`pill ${tone}`}>{String(key).replaceAll('_', ' ').replaceAll('-', ' ')}</span>;
}
