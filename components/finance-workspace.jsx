'use client';

import { useState } from 'react';

export function FinanceWorkspace({ overview }) {
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(resource, event, transform = form => Object.fromEntries(form.entries())) {
    event.preventDefault(); setBusy(true); setNotice('');
    const response = await fetch(`/api/finance/${resource}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(transform(new FormData(event.currentTarget))) });
    const payload = await response.json(); setBusy(false);
    setNotice(response.ok ? 'Saved. Refreshing the workspace…' : payload.error || 'Could not save.');
    if (response.ok) setTimeout(() => window.location.reload(), 400);
  }
  return <>
    {notice ? <p className="muted" role="status">{notice}</p> : null}
    <MetricGrid dashboard={overview.dashboard} />
    <div className="toolbar" style={{ marginBottom: 16 }}><form onSubmit={event => submit('sales-sync', event)}><button disabled={busy}>Sync sales invoices from orders</button></form><a className="button secondary" href="/api/finance/export?type=pnl">Download P&amp;L CSV</a><a className="button secondary" href="/api/finance/export?type=sales">GST sales CSV</a><a className="button secondary" href="/api/finance/export?type=purchases">Purchase / ITC CSV</a></div>
    <div className="twoColumn">
      <Panel title="Create vendor"><form className="formGrid" onSubmit={event => submit('vendors', event)}><Field name="name" label="Vendor name" required /><Field name="gstin" label="GSTIN" /><Field name="email" label="Email" type="email" /><Field name="payment_terms_days" label="Payment terms (days)" type="number" value="30" /><button disabled={busy}>Add vendor</button></form></Panel>
      <Panel title="Record bill or expense"><form className="formGrid" onSubmit={event => submit('documents', event, form => ({ ...Object.fromEntries(form.entries()), lines: [{ description: form.get('description'), quantity: 1, unit_price: Number(form.get('amount')), tax_rate: Number(form.get('tax_rate') || 0) }] }))}><label><span>Document type</span><select name="document_type" defaultValue="purchase_bill"><option value="purchase_bill">Purchase bill</option><option value="expense">Expense</option><option value="payroll">Payroll journal</option><option value="sales_invoice">Sales invoice</option><option value="credit_note">Credit note</option></select></label><Field name="document_number" label="Invoice/reference" required /><Field name="document_date" label="Date" type="date" /><Field name="amount" label="Amount" type="number" required /><Field name="tax_rate" label="GST %" type="number" value="0" /><Field name="description" label="Description" required /><button disabled={busy}>Save document</button></form></Panel>
      <Panel title="Submit reimbursement"><form className="formGrid" onSubmit={event => submit('reimbursements', event)}><Field name="business_purpose" label="Business purpose" required /><Field name="amount" label="Amount" type="number" required /><Field name="document_date" label="Expense date" type="date" /><button disabled={busy}>Submit claim</button></form></Panel>
      <Panel title="Bank statement import"><form className="formGrid" onSubmit={event => submit('bank-imports', event, form => ({ bank_account_id: form.get('bank_account_id'), filename: form.get('filename'), source_type: 'manual', transactions: JSON.parse(form.get('transactions') || '[]') }))}><Field name="bank_account_id" label="Bank account ID" required /><Field name="filename" label="Statement filename" value="statement.csv" /><label className="full"><span>Transaction JSON</span><textarea name="transactions" placeholder={'[{"transaction_date":"2026-08-01","description":"UPI receipt","credit":1000,"debit":0}]'} required /></label><button disabled={busy}>Import transactions</button></form><p className="muted">CSV/XLSX/PDF ingestion routes into this validated transaction format after parser/OCR review.</p></Panel>
    </div>
    <Panel title="Recent financial documents"><DocumentTable rows={overview.documents} /></Panel>
    <Panel title="Reimbursement queue"><ClaimTable rows={overview.claims} onAction={(id, action) => submit('reimbursements', { preventDefault() {}, currentTarget: { } }, () => ({ id, action }))} /></Panel>
  </>;
}

function Panel({ title, children }) { return <section className="panel"><div className="panelHeader"><h2>{title}</h2></div><div className="panelBody">{children}</div></section>; }
function Field({ name, label, type = 'text', value, required = false }) { return <label><span>{label}</span><input name={name} type={type} defaultValue={value} required={required} /></label>; }
function MetricGrid({ dashboard = {} }) { const entries = [['Revenue', currency(dashboard.revenue)], ['Expenses', currency(dashboard.expenses)], ['Management P&L', currency(dashboard.grossMargin)], ['Cash movement', currency(dashboard.cash)], ['Payables', currency(dashboard.payables)], ['Unreconciled bank', dashboard.unreconciled]]; return <section className="metricGrid">{entries.map(([label, value]) => <article className="card metric" key={label}><span>{label}</span><strong>{value ?? 0}</strong></article>)}</section>; }
function DocumentTable({ rows = [] }) { return <table><thead><tr><th>Type</th><th>Reference</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.document_type?.replaceAll('_', ' ')}</td><td>{row.document_number || row.vendors?.name || '—'}</td><td>{row.document_date}</td><td>{currency(row.base_total_amount || row.total_amount, row.currency)}</td><td>{row.status}</td></tr>)}{!rows.length && <Empty cols="5" />}</tbody></table>; }
function ClaimTable({ rows = [] }) { return <table><thead><tr><th>Claim</th><th>Employee</th><th>Purpose</th><th>Amount</th><th>Status</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.claim_number}</td><td>{row.users?.full_name || row.users?.email || '—'}</td><td>{row.business_purpose}</td><td>{currency(row.finance_documents?.total_amount, row.finance_documents?.currency)}</td><td>{row.status?.replaceAll('_', ' ')}</td></tr>)}{!rows.length && <Empty cols="5" />}</tbody></table>; }
function Empty({ cols }) { return <tr><td colSpan={cols} className="empty">No records yet.</td></tr>; }
function currency(value, currencyCode = 'INR') { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currencyCode || 'INR', maximumFractionDigits: 2 }).format(Number(value || 0)); }
