import { createServiceClient } from '../supabase/server.js';
import { getConfig } from '../../src/config.js';
import {
  sendChatwootAbandonedCart,
  sendChatwootDeliveryConfirmation,
  sendChatwootShipmentConfirmation
} from './chatwoot.js';

export async function sendPickupConfirmationOnce(order, shipment, options = {}) {
  const config = options.config || getConfig();
  if (!config.chatwoot?.shipmentConfirmationEnabled) return { skipped: true, reason: 'shipment-confirmations-disabled' };
  if (!order?.id || !shipment?.waybill) return { skipped: true, reason: 'missing-order-or-tracking-id' };
  const db = options.db || createServiceClient();
  if (!db) return { skipped: true, reason: 'missing-supabase-config' };
  const marker = `automation:whatsapp:shipment-confirmation:${shipment.waybill}`;
  const { data: existing, error: lookupError } = await db.from('notes').select('id').eq('order_id', order.id).eq('note_type', 'automation').eq('body', marker).maybeSingle();
  if (lookupError) throw new Error(`Could not check shipment-message history: ${lookupError.message}`);
  if (existing) return { skipped: true, reason: 'already-sent' };

  const sendImpl = options.sendImpl || sendChatwootShipmentConfirmation;
  const result = await sendImpl(order, shipment, {
    inboxId: config.chatwoot.inboxId,
    templateName: config.chatwoot.shipmentTemplateName,
    language: config.chatwoot.shipmentTemplateLanguage,
    category: config.chatwoot.shipmentTemplateCategory,
    trackingButtonUrl: config.chatwoot.shipmentTrackingButtonUrl,
    fetchImpl: options.fetchImpl,
    env: options.env
  });
  if (result.skipped) {
    await recordMessageEvent(db, eventRow(order, shipment, 'shipment-confirmation', marker, result, options.trigger));
    return result;
  }
  const { error: noteError } = await db.from('notes').insert({ order_id: order.id, body: marker, note_type: 'automation', actor_name: 'WhatsApp automation' });
  if (noteError) throw new Error(`Shipment message sent but its duplicate guard could not be saved: ${noteError.message}`);
  await db.from('orders').update({
    chatwoot_conversation_id: result.conversationId,
    chatwoot_contact_id: result.contactId,
    last_message_type: 'shipment-confirmation',
    last_communication_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq('id', order.id);
  await recordMessageEvent(db, eventRow(order, shipment, 'shipment-confirmation', marker, result, options.trigger));
  return result;
}

export async function sendDeliveryConfirmationOnce(order, shipment, options = {}) {
  const config = options.config || getConfig();
  if (!config.chatwoot?.deliveryConfirmationEnabled) return { skipped: true, reason: 'delivery-confirmations-disabled' };
  const enabledAt = Date.parse(config.chatwoot.deliveryConfirmationEnabledAt || '');
  const deliveredAt = Date.parse(shipment.last_event_at || shipment.updated_at || new Date().toISOString());
  if (!Number.isFinite(enabledAt) || !Number.isFinite(deliveredAt) || deliveredAt < enabledAt) {
    return { skipped: true, reason: 'before-delivery-go-live' };
  }
  if (!order?.id || !shipment?.waybill) return { skipped: true, reason: 'missing-order-or-tracking-id' };
  if (shipment.direction === 'reverse') return { skipped: true, reason: 'reverse-shipment' };
  const db = options.db || createServiceClient();
  if (!db) return { skipped: true, reason: 'missing-supabase-config' };
  const marker = `automation:whatsapp:delivery-confirmation:${shipment.waybill}`;
  const { data: existing, error: lookupError } = await db.from('notes').select('id').eq('order_id', order.id).eq('note_type', 'automation').eq('body', marker).maybeSingle();
  if (lookupError) throw new Error(`Could not check delivery-message history: ${lookupError.message}`);
  if (existing) return { skipped: true, reason: 'already-sent' };

  const sendImpl = options.sendImpl || sendChatwootDeliveryConfirmation;
  const result = await sendImpl(order, {
    inboxId: config.chatwoot.inboxId,
    templateName: config.chatwoot.deliveryTemplateName,
    language: config.chatwoot.deliveryTemplateLanguage,
    category: config.chatwoot.deliveryTemplateCategory,
    fetchImpl: options.fetchImpl,
    env: options.env
  });
  if (result.skipped) {
    await recordMessageEvent(db, eventRow(order, shipment, 'delivery-confirmation', marker, result, options.trigger));
    return result;
  }
  const { error: noteError } = await db.from('notes').insert({ order_id: order.id, body: marker, note_type: 'automation', actor_name: 'WhatsApp automation' });
  if (noteError) throw new Error(`Delivery message sent but its duplicate guard could not be saved: ${noteError.message}`);
  await db.from('orders').update({
    chatwoot_conversation_id: result.conversationId,
    chatwoot_contact_id: result.contactId,
    last_message_type: 'delivery-confirmation',
    last_communication_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq('id', order.id);
  await recordMessageEvent(db, eventRow(order, shipment, 'delivery-confirmation', marker, result, options.trigger));
  return result;
}

export async function sendAbandonedCartReminderOnce(lead, options = {}) {
  const config = options.config || getConfig();
  if (!config.chatwoot?.abandonedCartEnabled) return { skipped: true, reason: 'abandoned-cart-messages-disabled' };
  if (!lead?.id || lead.recovered_order_id) return { skipped: true, reason: lead?.recovered_order_id ? 'cart-recovered' : 'missing-lead' };
  const db = options.db || createServiceClient();
  if (!db) return { skipped: true, reason: 'missing-supabase-config' };
  const dedupeKey = `abandoned-cart:${lead.id}`;
  const existing = await findMessageEvent(db, dedupeKey);
  if (existing?.status === 'sent') return { skipped: true, reason: 'already-sent' };
  if ((existing?.attempts || 0) >= 3) return { skipped: true, reason: 'retry-limit-reached' };

  const sendImpl = options.sendImpl || sendChatwootAbandonedCart;
  try {
    const { resolveAbandonedCartProductSlug } = await import('./abandoned-carts.js');
    const productSlug = await resolveAbandonedCartProductSlug(lead, config, { fetchImpl: options.fetchImpl });
    const result = await sendImpl(lead, {
      inboxId: config.chatwoot.inboxId,
      templateName: config.chatwoot.abandonedCartTemplateName,
      language: config.chatwoot.abandonedCartTemplateLanguage,
      category: config.chatwoot.abandonedCartTemplateCategory,
      productSlug,
      fetchImpl: options.fetchImpl,
      env: options.env
    });
    await recordMessageEvent(db, {
      dedupe_key: dedupeKey,
      event_type: 'abandoned-cart',
      template_name: config.chatwoot.abandonedCartTemplateName,
      channel: 'chatwoot-whatsapp',
      trigger: options.trigger || 'automation',
      status: result.skipped ? 'skipped' : 'sent',
      attempts: (existing?.attempts || 0) + 1,
      provider_message_id: result.providerMessageId || null,
      recipient_ref: result.conversationId || null,
      error: result.reason || null,
      sent_at: result.skipped ? null : new Date().toISOString()
    });
    if (!result.skipped) {
      await db.from('abandoned_cart_leads').update({ last_contacted_at: new Date().toISOString(), lead_status: 'contacted', updated_at: new Date().toISOString() }).eq('id', lead.id);
    }
    return result;
  } catch (error) {
    await recordMessageEvent(db, {
      dedupe_key: dedupeKey,
      event_type: 'abandoned-cart',
      template_name: config.chatwoot.abandonedCartTemplateName,
      channel: 'chatwoot-whatsapp',
      trigger: options.trigger || 'automation',
      status: 'failed',
      attempts: (existing?.attempts || 0) + 1,
      error: error.message
    });
    throw error;
  }
}

export function shipmentConfirmationEligibility(shipment) {
  if (!shipment?.waybill) return { allowed: false, reason: 'A booked shipment with an AWB is required.' };
  if (shipment.direction === 'reverse') return { allowed: false, reason: 'Shipment confirmations are only available for outbound shipments.' };
  const status = String(shipment.status || '').trim().toLowerCase().replaceAll('_', '-');
  if (['cancelled', 'canceled', 'returned', 'rto', 'failed', 'pending', 'pending-zone', 'pending-international'].includes(status)) {
    return { allowed: false, reason: 'This shipment is not active.' };
  }
  return { allowed: true, reason: '' };
}

function eventRow(order, shipment, eventType, dedupeKey, result, trigger = 'automation') {
  return {
    order_id: order.id,
    shipment_id: shipment.id || null,
    dedupe_key: dedupeKey,
    event_type: eventType,
    template_name: eventType === 'delivery-confirmation' ? 'delivery_confirmation_1' : 'shipment_confirmation_3',
    channel: 'chatwoot-whatsapp',
    trigger,
    status: result.skipped ? 'skipped' : 'sent',
    attempts: 1,
    provider_message_id: result.providerMessageId || null,
    recipient_ref: result.conversationId || null,
    error: result.reason || null,
    sent_at: result.skipped ? null : new Date().toISOString()
  };
}

async function findMessageEvent(db, dedupeKey) {
  const table = db.from('whatsapp_message_events');
  if (typeof table?.select !== 'function') return null;
  const { data, error } = await table.select('*').eq('dedupe_key', dedupeKey).maybeSingle();
  if (error && !isMissingMessageEventTable(error)) throw error;
  return data || null;
}

async function recordMessageEvent(db, row) {
  const table = db.from('whatsapp_message_events');
  if (typeof table?.upsert !== 'function') return;
  const { error } = await table.upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'dedupe_key' });
  if (error && !isMissingMessageEventTable(error)) throw error;
}

function isMissingMessageEventTable(error) {
  return /whatsapp_message_events|schema cache|does not exist/i.test(error?.message || '');
}
