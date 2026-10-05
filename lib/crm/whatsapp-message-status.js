// Chatwoot acceptance is not delivery. Poll provider status and preserve the
// original duplicate guard: permanent failures require recipient/error repair.
export async function correctedRecipientAllowsRetry(event, phone, { fetchImpl = fetch, env = process.env } = {}) {
  if (event?.status !== 'failed' || !/131026/.test(event.error || '') || !phone || !event.recipient_ref || (event.attempts || 0) >= 3) return false;
  const base = String(env.CHATWOOT_BASE_URL || '').replace(/\/$/, '');
  const token = env.CHATWOOT_API_TOKEN || env.CHATWOOT_ACCESS_TOKEN;
  if (!base || !token || !env.CHATWOOT_ACCOUNT_ID) return false;
  const response = await fetchImpl(`${base}/api/v1/accounts/${env.CHATWOOT_ACCOUNT_ID}/conversations/${encodeURIComponent(event.recipient_ref)}`, { headers: { 'api-access-token': token }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) return false;
  const payload = await response.json();
  const previous = payload.meta?.sender?.phone_number;
  return Boolean(previous && previous !== phone);
}

export async function reconcileWhatsAppMessageFailures(db, { fetchImpl = fetch, env = process.env } = {}) {
  const base = String(env.CHATWOOT_BASE_URL || '').replace(/\/$/, '');
  const token = env.CHATWOOT_API_TOKEN || env.CHATWOOT_ACCESS_TOKEN;
  const account = env.CHATWOOT_ACCOUNT_ID;
  const result = { checked: 0, failed: 0, errors: [] };
  if (!base || !token || !account) return result;
  for (const table of ['whatsapp_message_events', 'customer_messages']) {
  for (let offset = 0; ; offset += 100) {
    // Preserve failures; Ops creates a new provider ID on an approved retry.
    let query = db.from(table).select(table === 'customer_messages' ? '*,orders(chatwoot_conversation_id)' : '*');
    if (table === 'customer_messages') query = query.eq('channel', 'chatwoot-whatsapp');
    const { data, error } = await query
      .not('provider_message_id', 'is', null).order('id').range(offset, offset + 99);
    if (error) throw new Error(`WhatsApp message status lookup failed: ${error.message}`);
    for (const event of data || []) {
      if (table === 'customer_messages') {
        event.recipient_ref = event.orders?.chatwoot_conversation_id;
        event.event_type = event.message_type;
      }
      if (!event.recipient_ref || !event.provider_message_id || event.status === 'failed') continue;
      try {
        let message;
        let before;
        for (let page = 0; page < 30; page += 1) {
          const url = new URL(`${base}/api/v1/accounts/${account}/conversations/${encodeURIComponent(event.recipient_ref)}/messages`);
          if (before) url.searchParams.set('before', before);
          const response = await fetchImpl(url, { headers: { 'api-access-token': token }, signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw new Error(`Chatwoot status HTTP ${response.status}`);
          const payload = await response.json();
          const messages = payload.payload || [];
          message = messages.find(item => String(item.id) === String(event.provider_message_id));
          if (message || !messages.length) break;
          const next = Math.min(...messages.map(item => item.id));
          if (next === before) break;
          before = next;
        }
        result.checked += 1;
        if (message?.status !== 'failed' || event.status === 'failed') continue;
        const reason = String(message.content_attributes?.external_error || 'WhatsApp provider reported delivery failure').slice(0, 1000);
        const update = await db.from(table).update({ status: 'failed', error: reason, updated_at: new Date().toISOString() }).eq('id', event.id);
        if (update.error) throw new Error(update.error.message);
        if (event.order_id) {
          const note = await db.from('notes').insert({ order_id: event.order_id, note_type: 'automation', actor_name: 'WhatsApp delivery monitor', body: `WhatsApp ${event.event_type} failed (message ${event.provider_message_id}): ${reason}. Check recipient and template before retrying.` });
          if (note.error) throw new Error(note.error.message);
        }
        result.failed += 1;
      } catch (error) { result.errors.push(`WhatsApp message ${event.provider_message_id}: ${error.message}`); }
    }
    if ((data || []).length < 100) break;
  }
  }
  return result;
}
