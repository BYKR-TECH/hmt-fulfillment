import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getConfig } from '../src/config.js';
import { SupabaseRestClient } from '../src/supabase.js';
import {
  buildRecoveredShipmentRow,
  planWooShipmentRecoveries,
  recoveredMessageMarker
} from '../src/wooShipmentRecovery.js';

async function main() {
  const db = new SupabaseRestClient(getConfig());
  const [orders, shipments, notes] = await Promise.all([
    selectAll(db, 'orders', 'select=*&source=eq.woocommerce&order=id'),
    selectAll(db, 'shipments', 'select=*&order=id'),
    selectAll(db, 'notes', 'select=body&note_type=eq.automation&body=like.automation%3Awhatsapp%3Ashipment-confirmation%3A%25&order=id')
  ]);
  const requested = requestedOrderNumbers(process.argv);
  const scopedOrders = requested.size ? orders.filter(order => requested.has(String(order.order_number))) : orders;
  const plan = planWooShipmentRecoveries(scopedOrders, shipments);
  const insertCount = plan.filter(item => !item.matchingShipment).length;
  console.log(JSON.stringify({
    dryRun: !process.argv.includes('--apply'),
    ordersScanned: scopedOrders.length,
    recoveries: plan.length,
    shipmentsToInsert: insertCount,
    existingShipmentsToRepair: plan.length - insertCount,
    orderNumbers: plan.map(item => item.order.order_number)
  }, null, 2));
  if (!process.argv.includes('--apply') || !plan.length) return;

  const backupArg = process.argv.find(arg => arg.startsWith('--backup-dir='));
  if (!backupArg) throw new Error('--backup-dir outside the checkout is required.');
  const backupDir = resolve(backupArg.slice('--backup-dir='.length));
  if (backupDir.startsWith(`${process.cwd()}/`) || backupDir === process.cwd()) throw new Error('Backup must be outside the checkout.');
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  await writeFile(
    resolve(backupDir, 'woo-shipment-recovery.json'),
    JSON.stringify({ created_at: new Date().toISOString(), plan: plan.map(({ order, recovered, matchingShipment }) => ({ order, recovered, matchingShipment })) }, null, 2),
    { mode: 0o600, flag: 'wx' }
  );

  const existingMarkers = new Set(notes.map(note => note.body).filter(Boolean));
  let inserted = 0;
  let updated = 0;
  for (const item of plan) {
    const recoveredAt = new Date().toISOString();
    let shipment = item.matchingShipment;
    if (!shipment) {
      shipment = await db.insert('shipments', buildRecoveredShipmentRow(item.order, item.recovered, recoveredAt));
      inserted += 1;
    }
    const shipmentPatch = { ...item.shipmentPatch };
    if (item.recovered.courier === 'delhivery' && !shipment.label_url) {
      shipmentPatch.label_url = `/api/crm/shipments/${shipment.id}/label-file`;
      shipmentPatch.label_format = 'pdf';
      shipmentPatch.label_error = null;
    }
    if (Object.keys(shipmentPatch).length) {
      shipment = await db.patch('shipments', `id=eq.${shipment.id}`, {
        ...shipmentPatch,
        updated_at: recoveredAt
      });
      updated += 1;
    }

    const labelUrl = item.recovered.courier === 'delhivery'
      ? `/api/crm/shipments/${shipment.id}/label-file`
      : '';
    const orderPatch = {
      ...item.orderPatch,
      ...(labelUrl ? { shipment_label_url: labelUrl, shipment_label_format: 'pdf', shipment_label_error: null } : {}),
      updated_at: recoveredAt
    };
    await db.patch('orders', `id=eq.${item.order.id}`, orderPatch);

    const marker = recoveredMessageMarker(item.recovered);
    if (marker && !existingMarkers.has(marker)) {
      await db.insert('notes', {
        order_id: item.order.id,
        body: marker,
        note_type: 'automation',
        actor_name: 'Woo shipment recovery'
      });
      existingMarkers.add(marker);
    }
    await db.insert('status_history', {
      order_id: item.order.id,
      field_name: 'shipment_recovery',
      old_value: item.order.shipment_waybill || '',
      new_value: item.recovered.waybill,
      notes: 'Recovered shipment identity from WooCommerce metadata after local database cutover.',
      actor_name: 'Woo shipment recovery'
    });
    console.log(`Recovered ${item.order.order_number}: ${item.recovered.courier} ${item.recovered.waybill} (${item.recovered.status}).`);
  }
  console.log(JSON.stringify({ done: true, recovered: plan.length, inserted, updated }, null, 2));
}

async function selectAll(db, table, query) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const separator = query ? `${query}&` : '';
    const batch = await db.select(table, `${separator}limit=1000&offset=${offset}`);
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}

function requestedOrderNumbers(args) {
  const argument = args.find(value => value.startsWith('--orders='));
  return new Set(String(argument?.slice('--orders='.length) || '').split(',').map(value => value.trim()).filter(Boolean));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
