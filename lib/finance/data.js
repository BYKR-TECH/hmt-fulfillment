import { createServiceClient } from '@/lib/supabase/server';
import { bankFingerprint, documentTotals, isBalanced, money, nextClaimNumber } from './calculations';

const DEMO = { dashboard: { revenue: 0, expenses: 0, grossMargin: 0, cash: 0, payables: 0, unreconciled: 0 }, documents: [], vendors: [], bankTransactions: [], claims: [] };

export async function financeOverview() {
  const db = createServiceClient();
  if (!db) return DEMO;
  const [documents, bank, claims, vendors] = await Promise.all([
    db.from('finance_documents').select('id,document_type,status,total_amount,base_total_amount,document_date,currency,vendors(name),orders(order_number)').order('document_date', { ascending: false }).limit(100),
    db.from('bank_transactions').select('id,transaction_date,description,debit,credit,status,currency').order('transaction_date', { ascending: false }).limit(100),
    db.from('reimbursement_claims').select('id,claim_number,status,business_purpose,created_at,finance_documents(total_amount,currency),users!reimbursement_claims_employee_id_fkey(full_name,email)').order('created_at', { ascending: false }).limit(100),
    db.from('vendors').select('id,name,gstin,email,payment_terms_days').order('name').limit(200)
  ]);
  const rows = documents.data || [];
  const metrics = rows.reduce((result, doc) => {
    const amount = money(doc.base_total_amount || doc.total_amount);
    if (doc.document_type === 'sales_invoice') result.revenue += amount;
    if (['purchase_bill', 'expense', 'payroll', 'reimbursement'].includes(doc.document_type)) result.expenses += amount;
    if (['purchase_bill', 'expense'].includes(doc.document_type) && !['paid', 'reconciled'].includes(doc.status)) result.payables += amount;
    return result;
  }, { revenue: 0, expenses: 0, payables: 0 });
  const bankRows = bank.data || [];
  metrics.cash = money(bankRows.reduce((sum, row) => sum + money(row.credit) - money(row.debit), 0));
  metrics.unreconciled = bankRows.filter(row => row.status === 'unreconciled').length;
  metrics.grossMargin = money(metrics.revenue - metrics.expenses);
  return { dashboard: metrics, documents: rows, vendors: vendors.data || [], bankTransactions: bankRows, claims: claims.data || [] };
}

export async function createFinanceDocument(payload, actor) {
  const db = configured();
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (!payload.document_type || !lines.length) throw new Error('A document type and at least one line are required.');
  const totals = documentTotals(lines, payload.exchange_rate, payload.tds_amount);
  const { data: document, error } = await db.from('finance_documents').insert({
    document_type: payload.document_type, document_number: payload.document_number || null, vendor_id: payload.vendor_id || null, order_id: payload.order_id || null,
    document_date: payload.document_date || new Date().toISOString().slice(0, 10), due_date: payload.due_date || null, currency: payload.currency || 'INR', exchange_rate: Number(payload.exchange_rate || 1),
    ...totals, tax_details: payload.tax_details || {}, source_ref: payload.source_ref || null, notes: payload.notes || null, created_by: actor?.id || null
  }).select().single();
  if (error) throw new Error(error.message);
  const { error: lineError } = await db.from('finance_document_lines').insert(lines.map((line, index) => ({ document_id: document.id, line_number: index + 1, description: line.description || 'Line item', account_id: line.account_id || null, quantity: Number(line.quantity || 1), unit_price: Number(line.unit_price || 0), tax_rate: Number(line.tax_rate || 0), tax_amount: Number(line.tax_amount || 0), amount: money(Number(line.quantity || 1) * Number(line.unit_price || 0)), dimensions: line.dimensions || {} })));
  if (lineError) throw new Error(lineError.message);
  await audit(db, 'finance_document', document.id, 'created', actor, null, document);
  return document;
}

export async function syncSalesInvoices(actor) {
  const db = configured();
  const { data: orders, error } = await db.from('orders').select('id,order_number,external_order_id,source,source_created_at,total_amount,tax_amount,currency,payment_status,payment_refs(paid_amount,refunded_amount)').in('payment_status', ['paid', 'PAID', 'approved', 'APPROVED', 'partially_refunded']).limit(5000);
  if (error) throw new Error(error.message);
  const rows = (orders || []).map(order => {
    const payment = order.payment_refs || {};
    const gross = money(payment.paid_amount || order.total_amount);
    const refund = money(payment.refunded_amount);
    return { document_type: 'sales_invoice', document_number: order.order_number || order.external_order_id || order.id, order_id: order.id, document_date: String(order.source_created_at || new Date().toISOString()).slice(0, 10), currency: order.currency || 'INR', subtotal: money(gross - Number(order.tax_amount || 0)), tax_amount: money(order.tax_amount), total_amount: gross, base_total_amount: gross, source_ref: `${order.source || 'crm'}:${order.id}`, notes: refund ? `Imported commerce sale; refund tracked: ${refund}` : 'Imported commerce sale', status: refund >= gross && gross > 0 ? 'void' : 'approved', created_by: actor?.id || null };
  });
  if (!rows.length) return { imported: 0 };
  const { data, error: upsertError } = await db.from('finance_documents').upsert(rows, { onConflict: 'document_type,document_number' }).select();
  if (upsertError) throw new Error(upsertError.message);
  await Promise.all((data || []).map(document => audit(db, 'finance_document', document.id, 'sales_synced', actor, null, document)));
  return { imported: data?.length || 0 };
}

export async function createVendor(payload, actor) {
  const db = configured();
  if (!payload.name) throw new Error('Vendor name is required.');
  const { data, error } = await db.from('vendors').insert({ code: payload.code || null, name: payload.name, gstin: payload.gstin || null, pan: payload.pan || null, email: payload.email || null, phone: payload.phone || null, payment_terms_days: Number(payload.payment_terms_days || 30), preferred_currency: payload.preferred_currency || 'INR', address: payload.address || {} }).select().single();
  if (error) throw new Error(error.message);
  await audit(db, 'vendor', data.id, 'created', actor, null, data);
  return data;
}

export async function postJournal(payload, actor) {
  const db = configured();
  if (!payload.entry_number || !isBalanced(payload.lines)) throw new Error('Journal entry number and balanced debit/credit lines are required.');
  const { data: entry, error } = await db.from('journal_entries').insert({ entry_number: payload.entry_number, entry_date: payload.entry_date || new Date().toISOString().slice(0, 10), source_document_id: payload.source_document_id || null, memo: payload.memo || null, created_by: actor?.id || null, posted_at: new Date().toISOString() }).select().single();
  if (error) throw new Error(error.message);
  const { error: linesError } = await db.from('journal_lines').insert(payload.lines.map((line, index) => ({ journal_entry_id: entry.id, line_number: index + 1, account_id: line.account_id, debit: money(line.debit), credit: money(line.credit), currency: line.currency || 'INR', foreign_amount: line.foreign_amount || null, dimensions: line.dimensions || {}, memo: line.memo || null })));
  if (linesError) throw new Error(linesError.message);
  await audit(db, 'journal_entry', entry.id, 'posted', actor, null, entry);
  return entry;
}

export async function importBankTransactions(payload, actor) {
  const db = configured();
  if (!payload.bank_account_id || !Array.isArray(payload.transactions)) throw new Error('Bank account and transaction rows are required.');
  const checksum = payload.file_checksum || `manual-${Date.now()}`;
  const { data: imported, error } = await db.from('bank_statement_imports').insert({ bank_account_id: payload.bank_account_id, filename: payload.filename || 'manual-import', file_checksum: checksum, source_type: payload.source_type || 'manual', status: 'imported', imported_by: actor?.id || null }).select().single();
  if (error) throw new Error(error.message);
  const rows = payload.transactions.map(row => ({ bank_account_id: payload.bank_account_id, statement_import_id: imported.id, transaction_date: row.transaction_date, value_date: row.value_date || null, description: row.description || '', bank_reference: row.bank_reference || null, debit: money(row.debit), credit: money(row.credit), balance: row.balance ?? null, currency: row.currency || 'INR', fingerprint: bankFingerprint(row) }));
  const { data, error: txError } = await db.from('bank_transactions').upsert(rows, { onConflict: 'bank_account_id,fingerprint', ignoreDuplicates: true }).select();
  if (txError) throw new Error(txError.message);
  await audit(db, 'bank_statement_import', imported.id, 'imported', actor, null, { imported: data?.length || 0 });
  return { import: imported, imported: data?.length || 0 };
}

export async function createReimbursement(payload, actor) {
  const db = configured();
  const document = await createFinanceDocument({ ...payload, document_type: 'reimbursement', lines: payload.lines || [{ description: payload.business_purpose || 'Reimbursement', quantity: 1, unit_price: payload.amount || 0, tax_rate: 0 }] }, actor);
  const { count } = await db.from('reimbursement_claims').select('*', { count: 'exact', head: true });
  const { data, error } = await db.from('reimbursement_claims').insert({ claim_number: nextClaimNumber((count || 0) + 1), employee_id: payload.employee_id || actor?.id, manager_id: payload.manager_id || null, finance_document_id: document.id, business_purpose: payload.business_purpose || 'Business expense' }).select().single();
  if (error) throw new Error(error.message);
  await audit(db, 'reimbursement_claim', data.id, 'submitted', actor, null, data);
  return data;
}

export async function transitionReimbursement(id, action, actor) {
  const db = configured();
  const transitions = { manager_approve: 'manager_approved', finance_verify: 'finance_verified', schedule: 'scheduled', pay: 'paid', reconcile: 'reconciled', reject: 'rejected' };
  const status = transitions[action];
  if (!status) throw new Error('Invalid reimbursement action.');
  const timestampField = { manager_approved: 'manager_approved_at', finance_verified: 'finance_verified_at', paid: 'paid_at' }[status];
  const patch = { status, updated_at: new Date().toISOString() }; if (timestampField) patch[timestampField] = new Date().toISOString();
  const { data, error } = await db.from('reimbursement_claims').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  await audit(db, 'reimbursement_claim', id, status, actor, null, data);
  return data;
}

export async function closeFinancePeriod(id, action, actor) {
  const db = configured();
  if (!['start_close', 'lock', 'reopen'].includes(action)) throw new Error('Invalid period action.');
  const patch = action === 'start_close' ? { status: 'closing' } : action === 'lock' ? { status: 'locked', locked_by: actor?.id || null, locked_at: new Date().toISOString() } : { status: 'open', locked_by: null, locked_at: null };
  const { data, error } = await db.from('finance_periods').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  await audit(db, 'finance_period', id, action, actor, null, data);
  return data;
}

async function audit(db, entityType, entityId, action, actor, beforeValue, afterValue) { await db.from('finance_audit_events').insert({ entity_type: entityType, entity_id: entityId, action, before_value: beforeValue, after_value: afterValue, actor_id: actor?.id || null }); }
function configured() { const db = createServiceClient(); if (!db) throw new Error('Finance requires Supabase configuration.'); return db; }
