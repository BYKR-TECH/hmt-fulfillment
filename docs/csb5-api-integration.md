# CSB V API booking

## Current implementation

The FedEx booking form in ops collects a commercial invoice number and the exact Department Number output from FedEx's CSB5 utility. Booking sends these as `INVOICE_NUMBER` and `DEPARTMENT_NUMBER` customer references on the package; the commercial invoice also carries the invoice reference and `shipmentPurpose: SOLD`. Package dimensions, weight and declared customs value come from the operator's form.

CSB V requests must be outbound, prepaid exports from India and include both references. Manual AWB entry remains available without these API fields. Booking only records the shipment locally: the operator must select the booked shipment and explicitly fulfill it after pickup to send tracking to Wix.

This implementation does not generate the Department Number string. Do not substitute a literal `CSB V` marker for the utility output or alter its format. FedEx's utility attachment is an Excel macro workbook; obtain its specification or a worked example before implementing an equivalent generator.

## Carrier verification pending

FedEx's email on 10 September 2026 requires the utility output in the Department No additional reference and makes the invoice number mandatory. Follow-up sent on 30 September asks Arun Mohan and Jeswin Raphael to confirm the REST mapping, label appearance, clearance selection and production test/certification process. Until those answers and a successful carrier test are available, this change should remain a draft PR.

REST reference documentation: https://developer.fedex.com/api/en-in/catalog/ship/docs.html

Verify with a carrier-approved test shipment: inspect the redacted request, response, AWB and generated label; have FedEx confirm CSB V clearance and mandatory references. Do not share OAuth credentials or unnecessary customer information by email. A successful unit test or build does not establish customs clearance or production account enablement.

Delhivery's international API documentation and enablement are still pending. Follow-up sent to Avantika on 30 September requests sandbox/production access, CSB V Premium/Saver schemas, seller/KYC requirements, AWB/label retrieval, duplicate prevention and certification. The domestic CMU API must not be used to book international shipments. International Delhivery shipments continue to queue for portal handling until the carrier provides the contract.

## Release

Run Node 24, `npm test`, and `npm run build`. Obtain carrier confirmation, complete the approved test, and update this document with the confirmed mapping before merging. The PR must pass Validate; deploy through validated main commits as documented in DEPLOYMENT.md. No database migration is required for this change; references are retained in the existing shipment request payload.
