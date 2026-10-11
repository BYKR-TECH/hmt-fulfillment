# Auto shipment booking

The settings page stores `auto_booking` JSON in the existing `crm_settings` table.
POST requires `settings.manage`; the authenticated profile supplies `updated_by`.
The audit migration records operator profile/auth IDs, timestamp, and old/new JSON
in `crm_settings_audit` in the same transaction as each changed setting row.
Unchanged saves do not add audit entries. Deploy the audit migration separately
before enabling settings writes; it is not applied by app deployment.

## No saved row: compatibility

With no `auto_booking` row, automation retains its previous booking decisions:
paid/approved orders, automation holds skipped, terminal/cancelled orders skipped,
no source/country/value/packing/time restriction, domestic Delhivery Express,
international standard DLV Saver, international express FedEx CSV queue.
Existing runtime shipment/package/pickup configuration continues to apply.
In particular, the existing pickup setting or environment can override Sis Vars.
The legacy Saver route is a deliberate compatibility exception to the new
Premium-only validation. Saving settings ends this exception.

## Defaults for the first save

- Enabled: on; dry run: off. These match legacy booking being active.
- Pickup: `SID vars` (displayed as Sis Vars), as specified for Delhivery One.
  Existing source uses `Sis Vars`, not `SID vars`; the exact carrier account name
  must be verified by the operator before enabling live booking. No lookup was made.
  HSR GDP / HSR BYKR require an explicit confirmation checkbox; server validation
  rejects these warehouses without `pickupExplicitlyChosen: true`.
- Domestic: Delhivery Express (matches legacy), or Surface.
- International: Delhivery DLV Premium (changes legacy standard routing), or
  FedEx International Express (direct booking, replacing the legacy CSV queue).
  Saver and incompatible courier/service combinations are rejected.
  Domestic FedEx is not offered because the existing adapter supports only
  International Express.
- Package: 400 g, 23 × 14 × 6 cm for both lanes. This matches default domestic
  packaging; old international dimensions depend on existing runtime settings.
- Sources: woocommerce, wix, manual. This narrows the old unrestricted source rule.
  Configured Woo uses Woo booking functions. Manual orders use the carrier mapper
  with the existing CRM UUID, without importing them as Wix orders.
- Require paid: on; skip automation hold: on; require packed: off. These match
  legacy qualifying rules. Packed means `internal_status=packed` or a packed
  `pick_pack_tasks` row. Terminal/cancelled orders are always excluded.
- Countries: empty means all; maximum value: blank means unlimited. These match
  legacy rules. Values are compared in each order's currency, without conversion;
  unknown values fail qualification when a maximum is set.
- Run time and cutoff: blank means unrestricted (matches legacy). HH:mm uses
  Asia/Kolkata. Both boundaries are inclusive, with no overnight windows. Run time
  is the earliest booking time, not a new scheduler: the existing recurring cycle
  books on its next invocation within the window. Manual/forced cycles honour it.

Enabled, dry run, rules and time windows affect new shipment booking only.
Existing AWB tracking, messages, and pickup fulfillment continue independently.
Dry run writes a `courier-booking-dry-run` proposal with lane, warehouse and package
to the existing attempt log, without consuming retry attempts, changing booking
status, creating a shipment, queuing FedEx or calling a carrier. The log retains
the latest proposal per order, following the existing action-attempt pattern.

Booking never creates Wix fulfillment. Operator pickup or carrier pickup/later
remains the fulfillment trigger. Delhivery international bookings still queue
`pending-international`, following existing carrier support; this change does not
add an international manifest API. FedEx uses existing configured sender details;
the Delhivery warehouse name does not resolve a FedEx sender address.

Migration: `20261011120000_auto_booking_settings_audit.sql`. It adds only auditing,
seeds no booking settings, and has not been applied. No live service was contacted.
