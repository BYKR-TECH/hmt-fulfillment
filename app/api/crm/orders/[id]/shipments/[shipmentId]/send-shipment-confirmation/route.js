import { NextResponse } from 'next/server';
import { applyCrmSettingsToConfig } from '@/lib/crm/settings';
import { getCrmSettings } from '@/lib/crm/data-settings';
import { sendPickupConfirmationOnce, shipmentConfirmationEligibility } from '@/lib/crm/whatsapp-notifications';
import { getConfig } from '@/src/config.js';
import { findOrderById, findShipmentById } from '@/src/store.js';

export async function POST(_request, { params }) {
  try {
    const { id, shipmentId } = await params;
    const [order, shipment] = await Promise.all([findOrderById(id), findShipmentById(shipmentId)]);
    if (!order) return NextResponse.json({ ok: false, error: 'Order not found.' }, { status: 404 });
    if (!shipment || shipment.order_id !== order.id) {
      return NextResponse.json({ ok: false, error: 'Shipment not found for this order.' }, { status: 404 });
    }
    const eligibility = shipmentConfirmationEligibility(shipment);
    if (!eligibility.allowed) return NextResponse.json({ ok: false, error: eligibility.reason }, { status: 400 });

    const config = applyCrmSettingsToConfig(getConfig(), await getCrmSettings());
    const result = await sendPickupConfirmationOnce(order, shipment, { config });
    if (result.skipped) {
      const message = result.reason === 'already-sent'
        ? 'Shipment confirmation was already sent for this AWB.'
        : `Shipment confirmation was not sent: ${result.reason}.`;
      return NextResponse.json({ ok: result.reason === 'already-sent', message, result });
    }
    return NextResponse.json({ ok: true, message: 'Shipment confirmation sent on WhatsApp.', result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Shipment confirmation could not be sent.' }, { status: 500 });
  }
}
