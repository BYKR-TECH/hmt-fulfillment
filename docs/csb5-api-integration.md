# CSB V API booking

## FedEx payload confirmed by carrier sample

Arun Mohan replied on 30 September 2026 with `CSB Invoice request.txt` and specified the fields needed for a CSB V invoice. The ops form collects the commercial invoice number, the Department Number output from FedEx’s utility, and the exporter’s registered bank AD Code. Never copy placeholder account, AD Code, dates or invoice numbers from the sample.

The request includes:

- `customsClearanceDetail.commercialInvoice.originatorName` from the configured shipper.
- Invoice `customerReferences` containing both `INVOICE_NUMBER` and `DEPARTMENT_NUMBER`, also retained on the package.
- Invoice `comments`: `DEPT_NOTES: <department output>, AD Code: <actual AD code>, INV: <actual invoice number>`.
- Commercial shipment purpose, `isDocumentOnly: false`, a matching `customsOption` of type `OTHER`, total customs value and the configured HS code when available.
- `shippingDocumentSpecification` requesting a PDF `COMMERCIAL_INVOICE` separately from the PDF shipping label.

The same real invoice number is used in every reference and comment; the same utility output is used for department notes, references and customs description. The carrier sample contains inconsistent example dates and invoice numbers and is not copied literally. Shipper, recipient, destination, commercial value and payer choices remain the actual booking values.

This implementation does not infer or generate the Department Number string. Paste the exact utility output until FedEx provides the field definitions for an equivalent generator. Booking must not create a Wix fulfillment; fulfillment follows the current pickup lifecycle in AGENTS.md.

## Sandbox approval workflow

Arun instructed us to test in the test environment and send him a test label for validation before production.

Configure `FEDEX_SANDBOX_CLIENT_ID`, `FEDEX_SANDBOX_CLIENT_SECRET` and `FEDEX_SANDBOX_ACCOUNT_NUMBER` for a FedEx test project. Ops testing is pinned to `https://apis-sandbox.fedex.com`; production credentials cannot be used as a fallback. `FEDEX_AD_CODE` may hold the actual exporter bank AD Code, and the booking form accepts it explicitly per shipment.

**Validate in FedEx sandbox** submits to `/ship/v1/shipments/packages/validate` without creating an AWB. **Generate sandbox test label** uses the sandbox Ship API and provides downloadable test label/invoice artifacts. It never saves an ops shipment, updates an order, sends tracking, or triggers fulfillment. Both actions require the existing authenticated orders-edit permission. Keep sandbox artifacts separate from production labels and AWBs.

As of the configuration check on 30 September, the three sandbox credentials and the bank AD Code were not configured on saipi. No sandbox test label has been produced or approved. Production OAuth was previously successful, but production shipment validation returned HTTP 403 `FORBIDDEN.ERROR` (transaction `aa3a109a-9eaf-48a2-87f1-3912138c5cce`); FedEx received that diagnostic in the email thread.

Send the actual sandbox-generated test label and commercial invoice to Arun and Jeswin in the existing thread and obtain approval before moving to production. Keep credentials and customer exports out of Git. Use a secure channel for credentials. A passing unit test or build does not establish carrier clearance approval.

## Delhivery

International API documentation and enablement remain pending. Avantika received a follow-up requesting CSB V Premium/Saver schemas, seller/KYC requirements, account access, AWB/label retrieval, duplicate prevention and certification. Do not use domestic CMU to book international shipments; Delhivery international orders still queue for portal handling.

## Release

Keep the PR in draft until FedEx approves the sandbox label/invoice and production access is verified. Use Node 24, run `npm test` and `npm run build`, and pass Validate before merging. Deploy only through validated main commits per DEPLOYMENT.md. No schema migration is required; carrier references/documents are retained in the existing request and response payloads.
