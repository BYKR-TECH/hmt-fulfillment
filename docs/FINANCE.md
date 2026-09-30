# Finance

Apply `supabase/migrations/015_finance_inventory_manufacturing.sql` after the existing CRM migrations. It provides the financial subledger, private `finance-documents` storage bucket, and finance audit records.

## Operations

- Open `/finance` for financial documents, sales synchronization, reimbursements, bank-statement intake, and downloadable CA-review CSVs.

## Imports and files

Bank parser/OCR workers should normalize input to `bank_transactions` fields (`transaction_date`, `description`, `debit`, `credit`, optional value date/reference/balance) before calling `/api/finance/bank-imports`. The fingerprint constraint prevents duplicate imported rows.

Documents are private. Upload application code must place objects in `finance-documents`, create a matching `finance_attachments` row, and set scan status to `clean` only after the configured malware/OCR review step completes.

## Accounting controls

Use `finance_documents` as a reviewed source record and `journal_entries`/`journal_lines` for immutable balanced postings. Corrections must use reversal entries. Lock financial periods only after bank, tax, and exception review; never update posted activity in a locked period.
