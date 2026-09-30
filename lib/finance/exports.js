import { money } from './calculations.js';

export function csv(rows) {
  return rows.map(row => row.map(value => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',')).join('\r\n');
}

export function buildCaPack({ documents = [], bankTransactions = [], dashboard = {} }) {
  const sales = [['Invoice number', 'Date', 'Currency', 'Taxable value', 'GST', 'Total', 'Status'], ...documents.filter(doc => ['sales_invoice', 'credit_note'].includes(doc.document_type)).map(doc => [doc.document_number, doc.document_date, doc.currency, money(doc.subtotal), money(doc.tax_amount), money(doc.total_amount), doc.status])];
  const purchases = [['Reference', 'Vendor', 'Date', 'Currency', 'Taxable value', 'GST', 'TDS', 'Total', 'Status'], ...documents.filter(doc => ['purchase_bill', 'expense', 'payroll', 'reimbursement'].includes(doc.document_type)).map(doc => [doc.document_number, doc.vendors?.name || '', doc.document_date, doc.currency, money(doc.subtotal), money(doc.tax_amount), money(doc.tds_amount), money(doc.total_amount), doc.status])];
  const bank = [['Date', 'Description', 'Debit', 'Credit', 'Currency', 'Status'], ...bankTransactions.map(row => [row.transaction_date, row.description, money(row.debit), money(row.credit), row.currency, row.status])];
  const pnl = [['Metric', 'Amount (INR)'], ['Revenue', money(dashboard.revenue)], ['Expenses', money(dashboard.expenses)], ['Management P&L', money(dashboard.grossMargin)], ['Payables', money(dashboard.payables)], ['Cash movement', money(dashboard.cash)]];
  return { sales, purchases, bank, pnl };
}
