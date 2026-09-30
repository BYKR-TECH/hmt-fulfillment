import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/current-user';
import { closeFinancePeriod, createFinanceDocument, createReimbursement, createVendor, financeOverview, importBankTransactions, postJournal, syncSalesInvoices, transitionReimbursement } from '@/lib/finance/data';

export async function GET(_request, { params }) {
  const { resource } = await params;
  await requirePermission(permissionFor(resource, 'GET'));
  const key = resourceToKey(resource);
  if (key === undefined) return NextResponse.json({ error: 'Unknown finance resource.' }, { status: 404 });
  const overview = await financeOverview();
  return NextResponse.json(key ? { [key]: overview[key] } : overview);
}

export async function POST(request, { params }) {
  const { resource } = await params;
  const actor = await requirePermission(permissionFor(resource, 'POST'));
  const payload = await request.json();
  try {
    const handlers = {
      documents: () => createFinanceDocument(payload, actor),
      'sales-sync': () => syncSalesInvoices(actor),
      vendors: () => createVendor(payload, actor),
      journals: () => postJournal(payload, actor),
      'bank-imports': () => importBankTransactions(payload, actor),
      reimbursements: () => payload.id ? transitionReimbursement(payload.id, payload.action, actor) : createReimbursement(payload, actor),
      periods: () => closeFinancePeriod(payload.id, payload.action, actor)
    };
    if (!handlers[resource]) return NextResponse.json({ error: 'Unknown finance resource.' }, { status: 404 });
    return NextResponse.json({ ok: true, data: await handlers[resource]() }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Finance operation failed.' }, { status: 400 });
  }
}

function resourceToKey(resource) {
  return { dashboard: null, documents: 'documents', bank: 'bankTransactions', reimbursements: 'claims' }[resource];
}
function permissionFor(resource, method) {
  return `finance.${method === 'GET' ? 'view' : 'edit'}`;
}
