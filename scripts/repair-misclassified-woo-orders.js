import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getConfig } from '../src/config.js';
import { SupabaseRestClient } from '../src/supabase.js';
import { isWooCommerceRawOrder } from '../src/wooOrderShape.js';
import { upsertWooCommerceOrder } from '../src/store.js';

export function planWooOrderRepairs(rows) {
  return rows.filter(row => row.source === 'wix' && isWooCommerceRawOrder(row.raw_order)).map(broken => {
    const rawId = String(broken.raw_order.id ?? '');
    if (!rawId || String(broken.wix_order_id) !== rawId) throw new Error(`Ambiguous source identity: ${broken.id}`);
    const matches = rows.filter(row => row.source === 'woocommerce' && String(row.woo_order_id || row.external_order_id) === rawId);
    if (matches.length !== 1) throw new Error(`Expected one Woo counterpart for ${broken.id}; got ${matches.length}`);
    return { broken, counterpart: matches[0] };
  });
}

async function main() {
  const db = new SupabaseRestClient(getConfig());
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const batch = await db.select('orders', `select=*&order=id&limit=1000&offset=${offset}`);
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  const plan = planWooOrderRepairs(rows);
  console.log(`Found ${plan.length} misclassified WooCommerce orders.`);
  if (!process.argv.includes('--apply')) return;
  const backupArg = process.argv.find(arg => arg.startsWith('--backup-dir='));
  if (!backupArg) throw new Error('--backup-dir outside the checkout is required.');
  const backupDir = resolve(backupArg.slice('--backup-dir='.length));
  if (backupDir.startsWith(`${process.cwd()}/`) || backupDir === process.cwd()) throw new Error('Backup must be outside the checkout.');
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  // Refuse to merge counterparts with operational activity. Keep all shipment
  // and operator references on the original, shipment-bearing order UUID.
  const guardedTables = ['shipments', 'notes', 'packing_checklists', 'status_history', 'feedback', 'attachments', 'pick_pack_tasks'];
  for (const { broken, counterpart } of plan) {
    for (const table of guardedTables) {
      const related = await db.select(table, `select=id&order_id=eq.${counterpart.id}&limit=1`);
      if (related.length) throw new Error(`Counterpart ${counterpart.id} has ${table}; review required.`);
    }
    const items = await db.select('order_items', `select=*&order_id=in.(${broken.id},${counterpart.id})`);
    const payments = await db.select('payment_refs', `select=*&order_id=in.(${broken.id},${counterpart.id})`);
    await writeFile(resolve(backupDir, `${broken.id}.json`), JSON.stringify({ broken, counterpart, items, payments }), { mode: 0o600, flag: 'wx' });
  }
  for (const { broken, counterpart } of plan) {
    await db.patch('orders', `id=eq.${counterpart.id}`, {
      source: 'merged', woo_order_id: null, external_order_id: broken.id,
      updated_at: new Date().toISOString()
    });
    try {
      await db.patch('orders', `id=eq.${broken.id}`, {
        source: 'woocommerce', wix_order_id: null,
        woo_order_id: counterpart.woo_order_id, external_order_id: counterpart.external_order_id,
        customer_id: counterpart.customer_id, shipping_address_id: counterpart.shipping_address_id,
        billing_address_id: counterpart.billing_address_id,
        wix_fulfillment_status: null, wix_fulfillment_id: null,
        wix_fulfillment_synced_at: null, wix_fulfillment_error: null
      });
    } catch (error) {
      await db.patch('orders', `id=eq.${counterpart.id}`, {
        source: counterpart.source, woo_order_id: counterpart.woo_order_id,
        external_order_id: counterpart.external_order_id
      });
      throw error;
    }
    await upsertWooCommerceOrder(counterpart.raw_order);
    const [verified] = await db.select('orders', `select=id,source,wix_order_id,customers(name),shipping_address:customer_addresses!orders_shipping_address_id_fkey(address_line1),order_items(id,product_name)&id=eq.${broken.id}`);
    if (verified.source !== 'woocommerce' || verified.wix_order_id || !verified.customers?.name || !verified.shipping_address?.address_line1 || verified.order_items.length !== counterpart.raw_order.line_items.length) {
      throw new Error(`Repair verification failed for ${broken.id}; backup retained.`);
    }
    console.log(`Repaired order ${broken.order_number}: customer, address and ${verified.order_items.length} invoice items; UUID and shipments retained.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
