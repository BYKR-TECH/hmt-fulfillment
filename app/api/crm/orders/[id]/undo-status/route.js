import { NextResponse } from 'next/server';
import { undoLastStatusChange } from '@/lib/crm/status-undo.js';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const payload = await request.json().catch(() => ({}));
    const result = await undoLastStatusChange(id, {
      confirmBackward: payload.confirmBackward === true || payload.confirm_backward === true,
      reason: payload.reason || payload.change_notes || '',
      clearWhatsAppDedupe: payload.clearWhatsAppDedupe !== false && payload.clear_whatsapp_dedupe !== false,
      actorName: payload.actor_name || payload.actorName || 'Operator',
      forceWooWriteback: payload.forceWooWriteback === true
    });
    const status = result.ok ? 200 : result.code === 'confirm_backward_required' || result.code === 'reason_required' ? 409 : 400;
    return NextResponse.json(result, { status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Undo failed.' }, { status: 500 });
  }
}
