'use client';
import { useState } from 'react';

export function AutoBookingSettingsFields({ settings }) {
  const [pickup, setPickup] = useState(settings.pickupLocation);
  const [courier, setCourier] = useState(settings.international.courier);
  const check = (name, label, checked) => <label className="checkItem full"><input key={name === 'pickup_explicitly_chosen' ? pickup : name} type="checkbox" name={`auto_booking_${name}`} defaultChecked={name === 'pickup_explicitly_chosen' ? checked && pickup === settings.pickupLocation : checked} /><span>{label}</span></label>;
  return <section className="panel">
    <div className="panelHeader"><div><h2>Auto shipment booking</h2><p className="muted settingsHint">Booking only; fulfillment waits for pickup. Times use Asia/Kolkata.</p></div></div>
    <div className="panelBody formGrid">
      {check('enabled', 'Enable auto shipment booking', settings.enabled)}
      {check('dry_run', 'Dry run: log proposed bookings without creating shipments', settings.dryRun)}
      <label><span>Pickup location</span><select name="auto_booking_pickup_location" value={pickup} onChange={event => setPickup(event.target.value)}><option value="SID vars">Sis Vars (SID vars)</option><option>HSR GDP</option><option>HSR BYKR</option></select></label>
      {pickup.startsWith('HSR') ? <><p className="muted full" role="alert">Warning: HSR is not the default warehouse. Confirm this pickup location explicitly.</p>{check('pickup_explicitly_chosen', 'I explicitly choose the selected HSR warehouse', settings.pickupExplicitlyChosen)}</> : null}
      <label><span>Domestic courier and service</span><select name="auto_booking_domestic_mode" defaultValue={settings.domestic.serviceMode}><option value="express">Delhivery Express</option><option value="surface">Delhivery Surface</option></select></label>
      <label><span>International courier</span><select name="auto_booking_international_courier" value={courier} onChange={event => setCourier(event.target.value)}><option value="delhivery">Delhivery Express</option><option value="fedex">FedEx</option></select></label>
      <label><span>International service</span><select key={courier} name="auto_booking_international_mode" defaultValue={courier === 'delhivery' ? 'dlv_premium' : 'international_express'}>{courier === 'delhivery' ? <option value="dlv_premium">DLV Premium</option> : <option value="international_express">International Express</option>}</select></label>
      {Object.entries({ weightGrams: 'Weight (grams)', lengthCm: 'Length (cm)', widthCm: 'Breadth (cm)', heightCm: 'Height (cm)' }).map(([key, label]) => <label key={key}><span>{label}</span><input required type="number" min="0.01" step="any" name={`auto_booking_${key}`} defaultValue={settings.package[key]} /></label>)}
      <label><span>Allowed sources (comma separated)</span><input name="auto_booking_sources" defaultValue={settings.allowedSources.join(', ')} /><small>woocommerce, wix, manual. Blank disables booking for every source.</small></label>
      {check('require_paid', 'Require paid / approved payment', settings.requirePaid)}
      {check('skip_hold', 'Skip orders with automation hold', settings.skipAutomationHold)}
      {check('require_packed', 'Require packed order or completed packing task', settings.requirePacked)}
      <label><span>Allowed countries (ISO codes; blank allows all)</span><input name="auto_booking_countries" defaultValue={settings.allowedCountries.join(', ')} /></label>
      <label><span>Maximum order value (order currency; blank means unlimited)</span><input type="number" min="0.01" step="any" name="auto_booking_max_value" defaultValue={settings.maxOrderValue ?? ''} /></label>
      <label><span>Run from (IST; blank means any time)</span><input type="time" name="auto_booking_run_time" defaultValue={settings.runTime} /></label>
      <label><span>Cutoff (IST; blank means no cutoff)</span><input type="time" name="auto_booking_cutoff_time" defaultValue={settings.cutoffTime} /></label>
      <p className="muted full">Saving activates these rules, including DLV Premium for international Delhivery. Until the first save, legacy routing stays active. The existing scheduler checks this window on each cycle; this does not change the scheduler frequency. Changes are audited with operator, time, and old/new values.</p>
    </div>
  </section>;
}
