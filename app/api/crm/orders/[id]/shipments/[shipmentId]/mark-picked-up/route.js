import { NextResponse } from 'next/server';
import { markShipmentPickedUp } from '@/lib/crm/data';

export async function POST(request, { params }) {
  try {
    const { id, shipmentId } = await params;
    const payload = await request.json().catch(() => ({}));
    // Forward customer-message actions should be confirmed in the UI.
    // Server still records history; this flag is reserved for future hard-require.
    if (payload.confirmCustomerMessage === false) {
      return NextResponse.json({
        ok: false,
        code: 'confirm_customer_message_required',
        error: 'Mark picked up sends WhatsApp and may fulfill Wix/Woo. Confirm before continuing.'
      }, { status: 409 });
    }
    const result = await markShipmentPickedUp(id, shipmentId, {
      actorName: payload.actor_name || payload.actorName || 'Operator',
      reason: payload.reason || 'Operator marked shipment picked up',
      confirmCustomerMessage: payload.confirmCustomerMessage !== false
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Pickup could not be completed. Refresh and retry.' }, { status: 500 });
  }
}
