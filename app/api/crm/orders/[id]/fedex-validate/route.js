import { createServiceClient } from '@/lib/supabase/server';
import { applyCrmSettingsToConfig } from '@/lib/crm/settings';
import { getConfig } from '@/src/config.js';
import { buildFedexShipmentPayload, validateFedexShipment, createFedexShipment, parseFedexShipmentResponse, fedexSandboxConfig } from '@/src/fedexShip.js';
import { validateShipmentPayload } from '@/src/shipmentValidation.js';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { id } = await params;
  const input = await request.json().catch(() => ({}));
  const validation = validateShipmentPayload({ ...input, courier: 'fedex', export_clearance: 'csb5' });
  if (validation.length) return Response.json({ ok: false, validation }, { status: 400 });
  const supabase = createServiceClient();
  if (!supabase) return Response.json({ ok: false, error: 'Supabase service client is not configured.' }, { status: 503 });
  const { data: order, error } = await supabase.from('orders')
    .select('*, customers(*), shipping_address:customer_addresses!orders_shipping_address_id_fkey(*)')
    .eq('id', id).maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!order) return Response.json({ ok: false, error: 'Order not found.' }, { status: 404 });
  const settingsResult = await supabase.from('crm_settings').select('key,value');
  if (settingsResult.error) return Response.json({ ok: false, error: settingsResult.error.message }, { status: 500 });
  const settings = Object.fromEntries((settingsResult.data || []).map(row => [row.key, row.value]));
  const baseConfig = applyCrmSettingsToConfig(getConfig(), settings);
  try {
    const config = fedexSandboxConfig(baseConfig);
    const payload = buildFedexShipmentPayload({ ...order, fedex_payload: {
      weightGrams: Number(input.weight_grams), lengthCm: Number(input.length_cm),
      widthCm: Number(input.width_cm), heightCm: Number(input.height_cm),
      declaredValue: Number(input.product_value), phone: input.phone,
      postalCode: input.pincode, addressLine1: input.address_line1, country: input.country
    } }, config, {
      orderNumber: order.order_number || order.external_order_id,
      exportClearance: 'csb5', invoiceNumber: input.invoice_number, departmentNumber: input.department_number, adCode: input.ad_code
    });
    if (input.test_label === true) {
      const result = await createFedexShipment(payload, config);
      const parsed = parseFedexShipmentResponse(result);
      if (!parsed.labelBase64) return Response.json({ ok: false, error: 'FedEx sandbox returned no test label.', transaction_id: result.transactionId }, { status: 400 });
      // Sandbox artifacts are returned for carrier review, never saved as a real shipment.
      return Response.json({ ok: true, environment: 'sandbox', transaction_id: result.transactionId,
        test_label_url: `data:application/pdf;base64,${parsed.labelBase64}`,
        test_invoice_documents: parsed.invoiceDocuments
      });
    }
    const result = await validateFedexShipment(payload, config);
    return Response.json({ ok: true, environment: 'sandbox', transaction_id: result.transactionId, alerts: result.output?.alerts || [] });
  } catch (error) {
    const forbidden = error.carrierStatus === 403;
    return Response.json({ ok: false,
      error: forbidden ? 'FedEx denied sandbox Ship API access. Ask FedEx to enable the test project/account.' : error.message,
      transaction_id: error.transactionId, carrier_error_codes: error.carrierErrorCodes
    }, { status: 400 });
  }
}
