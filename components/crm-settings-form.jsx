'use client';

import { useState } from 'react';

export function CrmSettingsForm({ settings, supabaseConfigured }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeSection, setActiveSection] = useState('packaging');
  const [feedback, setFeedback] = useState('');
  const sections = [['packaging', 'Packaging'], ['pickup', 'Pickup & tax'], ['export', 'International export'], ['automation', 'Automation']];

  function revealInvalidField(event) {
    event.preventDefault();
    const field = event.currentTarget.querySelector('input:invalid, select:invalid, textarea:invalid');
    if (!field) return;
    const section = field.closest('section');
    if (section) setActiveSection(section.id.replace('settings-', ''));
    setFeedback('error');
    setMessage(`Check the highlighted field: ${field.validationMessage}`);
    requestAnimationFrame(() => field.focus());
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (body.whatsapp_order_confirmation_enabled_at) {
      body.whatsapp_order_confirmation_enabled_at = new Date(body.whatsapp_order_confirmation_enabled_at).toISOString();
    }
    for (const key of ['whatsapp_delivery_confirmation_enabled_at', 'whatsapp_abandoned_cart_enabled_at']) {
      if (body[key]) body[key] = new Date(body[key]).toISOString();
    }
    try {
      const response = await fetch('/api/crm/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      setFeedback(!response.ok ? 'error' : data.demo ? 'demo' : 'success');
      setMessage(!response.ok ? data.error || 'Settings update failed. Please try again.' : data.demo ? 'Settings validated in demo mode. Configure Supabase to persist.' : 'All settings saved successfully.');
    } catch {
      setFeedback('error');
      setMessage('Unable to save settings. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const shipment = settings.shipment_defaults;
  const pickup = settings.pickup_defaults;
  const international = settings.international_export_defaults;
  const automation = settings.automation_defaults;

  return (
    <form onSubmit={submit} className="settingsForm" onInvalidCapture={revealInvalidField} onChange={() => { setFeedback('unsaved'); setMessage('You have unsaved changes. Save applies to all sections.'); }}>
      <nav className="pageTabs settingsTabs" aria-label="Settings sections">
        {sections.map(([id, label]) => <button type="button" key={id} className={activeSection === id ? 'active' : ''} aria-pressed={activeSection === id} aria-controls={`settings-${id}`} onClick={() => setActiveSection(id)}>{label}</button>)}
      </nav>
      {!supabaseConfigured ? <p className="muted">Supabase is not configured, so changes will validate but not persist.</p> : null}

      <section className="panel" id="settings-packaging" hidden={activeSection !== 'packaging'}>
        <div className="panelHeader">
          <div>
            <h2>Default packaging</h2>
            <p className="muted settingsHint">Pre-filled whenever an operator books a new shipment.</p>
          </div>
        </div>
        <div className="panelBody formGrid">
          <h3 className="formSection">Domestic shipments</h3>
          <label>
            <span>Domestic weight (grams)</span>
            <input name="domestic_weight_grams" type="number" defaultValue={shipment.domestic.weightGrams} />
          </label>
          <label>
            <span>Domestic length (cm)</span>
            <input name="domestic_length_cm" type="number" defaultValue={shipment.domestic.lengthCm} />
          </label>
          <label>
            <span>Domestic width (cm)</span>
            <input name="domestic_width_cm" type="number" defaultValue={shipment.domestic.widthCm} />
          </label>
          <label>
            <span>Domestic height (cm)</span>
            <input name="domestic_height_cm" type="number" min="0.1" step="0.1" defaultValue={shipment.domestic.heightCm} />
          </label>
          <h3 className="formSection">International shipments</h3>
          <label>
            <span>International weight (grams)</span>
            <input name="international_weight_grams" type="number" defaultValue={shipment.international.weightGrams} />
          </label>
          <label>
            <span>International length (cm)</span>
            <input name="international_length_cm" type="number" defaultValue={shipment.international.lengthCm} />
          </label>
          <label>
            <span>International width (cm)</span>
            <input name="international_width_cm" type="number" defaultValue={shipment.international.widthCm} />
          </label>
          <label>
            <span>International height (cm)</span>
            <input name="international_height_cm" type="number" defaultValue={shipment.international.heightCm} />
          </label>
          <label>
            <span>Default payment mode</span>
            <select name="payment_mode" defaultValue={shipment.paymentMode}>
              <option>Prepaid</option>
              <option>COD</option>
            </select>
          </label>
          <label>
            <span>Domestic service</span>
            <select name="domestic_service_code" defaultValue={shipment.domesticServiceCode}>
              <option value="express">Express</option>
              <option value="surface">Surface</option>
              <option value="reverse_pickup">Reverse pickup</option>
            </select>
          </label>
          <label>
            <span>International service</span>
            <select name="international_service_code" defaultValue={shipment.internationalServiceCode}>
              <option value="dlv_saver">DLV Saver</option>
              <option value="deferred_express">Deferred Express</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel" id="settings-pickup" hidden={activeSection !== 'pickup'}>
        <div className="panelHeader"><h2>Pickup and tax</h2></div>
        <div className="panelBody formGrid">
          <label>
            <span>Pickup location</span>
            <input name="pickup_location" defaultValue={pickup.pickupLocation} />
          </label>
          <label>
            <span>Pickup pincode</span>
            <input name="pickup_pincode" defaultValue={pickup.pickupPincode} />
          </label>
          <label>
            <span>GSTIN</span>
            <input name="seller_gst_tin" defaultValue={pickup.sellerGstTin} />
          </label>
          <label>
            <span>HSN code</span>
            <input name="hsn_code" defaultValue={pickup.hsnCode} />
          </label>
          <label>
            <span>Return name</span>
            <input name="return_name" defaultValue={pickup.returnName} />
          </label>
          <label>
            <span>Return phone</span>
            <input name="return_phone" defaultValue={pickup.returnPhone} />
          </label>
          <label className="full">
            <span>Return address</span>
            <input name="return_address" defaultValue={pickup.returnAddress} />
          </label>
          <label>
            <span>Return city</span>
            <input name="return_city" defaultValue={pickup.returnCity} />
          </label>
          <label>
            <span>Return state</span>
            <input name="return_state" defaultValue={pickup.returnState} />
          </label>
          <label>
            <span>Return pincode</span>
            <input name="return_pincode" defaultValue={pickup.returnPincode} />
          </label>
        </div>
      </section>

      <section className="panel" id="settings-export" hidden={activeSection !== 'export'}>
        <div className="panelHeader"><h2>International export</h2></div>
        <div className="panelBody formGrid">
          <label>
            <span>Shipment type</span>
            <input name="international_shipment_type" defaultValue={international.shipmentType} />
          </label>
          <label>
            <span>Purpose of booking</span>
            <input name="international_purpose_of_booking" defaultValue={international.purposeOfBooking} />
          </label>
          <label>
            <span>Invoice terms</span>
            <input name="invoice_terms" defaultValue={international.invoiceTerms} />
          </label>
          <label>
            <span>Product category</span>
            <input name="international_product_category" defaultValue={international.productCategory} />
          </label>
          <label>
            <span>HTS code</span>
            <input name="hts_code" defaultValue={international.htsCode} />
          </label>
          <label className="full">
            <span>Product description</span>
            <input name="international_product_description" defaultValue={international.productDescription} />
          </label>
        </div>
      </section>

      <section className="panel" id="settings-automation" hidden={activeSection !== 'automation'}>
        <div className="panelHeader"><h2>Automation</h2></div>
        <div className="panelBody formGrid">
          <label className="checkItem">
            <input type="checkbox" name="wix_fulfillment_sync_enabled" defaultChecked={automation.wixFulfillmentSyncEnabled} />
            <span>Update Wix fulfillment after pickup</span>
          </label>
          <label className="checkItem">
            <input type="checkbox" name="tracking_enabled" defaultChecked={automation.trackingEnabled} />
            <span>Enable Delhivery tracking polling</span>
          </label>
          <label>
            <span>Tracking interval (minutes)</span>
            <input name="tracking_interval_minutes" type="number" defaultValue={automation.trackingIntervalMinutes} />
          </label>
          <label>
            <span>Tracking batch size</span>
            <input name="tracking_batch_size" type="number" defaultValue={automation.trackingBatchSize} />
          </label>
          <h3 className="formSection">WhatsApp order confirmations</h3>
          <label className="checkItem full">
            <input type="checkbox" name="whatsapp_order_confirmation_enabled" defaultChecked={automation.whatsappOrderConfirmationEnabled} />
            <span>Send the approved WhatsApp template once for each new paid order</span>
          </label>
          <label>
            <span>Start sending from</span>
            <input name="whatsapp_order_confirmation_enabled_at" type="datetime-local" defaultValue={dateTimeLocal(automation.whatsappOrderConfirmationEnabledAt)} />
          </label>
          <label>
            <span>Chatwoot WhatsApp inbox ID</span>
            <input name="whatsapp_inbox_id" inputMode="numeric" defaultValue={automation.whatsappInboxId} />
          </label>
          <label>
            <span>Meta template name</span>
            <input name="whatsapp_order_template_name" defaultValue={automation.whatsappOrderTemplateName} />
          </label>
          <label>
            <span>Template language</span>
            <input name="whatsapp_order_template_language" defaultValue={automation.whatsappOrderTemplateLanguage} />
          </label>
          <label>
            <span>Template category</span>
            <select name="whatsapp_order_template_category" defaultValue={automation.whatsappOrderTemplateCategory}>
              <option value="UTILITY">Utility</option>
              <option value="MARKETING">Marketing</option>
              <option value="AUTHENTICATION">Authentication</option>
            </select>
          </label>
          <p className="muted full">Variables: customer name, order number, then the ordered product. The start time prevents accidental messages to historical orders.</p>
          <h3 className="formSection">WhatsApp shipment confirmations</h3>
          <label className="checkItem full">
            <input type="checkbox" name="whatsapp_shipment_confirmation_enabled" defaultChecked={automation.whatsappShipmentConfirmationEnabled} />
            <span>Send the approved shipment template when a booked package is picked up</span>
          </label>
          <label>
            <span>Shipment template name</span>
            <input name="whatsapp_shipment_template_name" defaultValue={automation.whatsappShipmentTemplateName} />
          </label>
          <label>
            <span>Shipment template language</span>
            <input name="whatsapp_shipment_template_language" defaultValue={automation.whatsappShipmentTemplateLanguage} />
          </label>
          <label>
            <span>Shipment template category</span>
            <select name="whatsapp_shipment_template_category" defaultValue={automation.whatsappShipmentTemplateCategory}>
              <option value="UTILITY">Utility</option>
              <option value="MARKETING">Marketing</option>
              <option value="AUTHENTICATION">Authentication</option>
            </select>
          </label>
          <label>
            <span>Tracking button URL</span>
            <input name="whatsapp_shipment_tracking_button_url" defaultValue={automation.whatsappShipmentTrackingButtonUrl} />
          </label>
          <p className="muted full">Template variables: customer name, order number, and AWB. The manual send action remains available after booking and uses the same duplicate guard.</p>
          <h3 className="formSection">WhatsApp delivery confirmations</h3>
          <label className="checkItem full">
            <input type="checkbox" name="whatsapp_delivery_confirmation_enabled" defaultChecked={automation.whatsappDeliveryConfirmationEnabled} />
            <span>Send the approved delivery template when carrier tracking reaches delivered</span>
          </label>
          <label>
            <span>Start sending from</span>
            <input name="whatsapp_delivery_confirmation_enabled_at" type="datetime-local" defaultValue={dateTimeLocal(automation.whatsappDeliveryConfirmationEnabledAt)} />
          </label>
          <label><span>Delivery template name</span><input name="whatsapp_delivery_template_name" defaultValue={automation.whatsappDeliveryTemplateName} /></label>
          <label><span>Template language</span><input name="whatsapp_delivery_template_language" defaultValue={automation.whatsappDeliveryTemplateLanguage} /></label>
          <label><span>Template category</span><select name="whatsapp_delivery_template_category" defaultValue={automation.whatsappDeliveryTemplateCategory}><option value="UTILITY">Utility</option><option value="MARKETING">Marketing</option></select></label>
          <p className="muted full">A direct jump from booked to delivered sends only the delivery confirmation, not a stale shipment message.</p>
          <h3 className="formSection">WhatsApp abandoned-cart reminders</h3>
          <label className="checkItem full">
            <input type="checkbox" name="whatsapp_abandoned_cart_enabled" defaultChecked={automation.whatsappAbandonedCartEnabled} />
            <span>Send the approved abandoned-cart template once after the delay</span>
          </label>
          <label><span>Start sending from</span><input name="whatsapp_abandoned_cart_enabled_at" type="datetime-local" defaultValue={dateTimeLocal(automation.whatsappAbandonedCartEnabledAt)} /></label>
          <label><span>Delay after abandonment (minutes)</span><input name="whatsapp_abandoned_cart_delay_minutes" type="number" min="15" defaultValue={automation.whatsappAbandonedCartDelayMinutes} /></label>
          <label><span>Abandoned-cart template name</span><input name="whatsapp_abandoned_cart_template_name" defaultValue={automation.whatsappAbandonedCartTemplateName} /></label>
          <label><span>Template language</span><input name="whatsapp_abandoned_cart_template_language" defaultValue={automation.whatsappAbandonedCartTemplateLanguage} /></label>
          <label><span>Template category</span><select name="whatsapp_abandoned_cart_template_category" defaultValue={automation.whatsappAbandonedCartTemplateCategory}><option value="MARKETING">Marketing</option><option value="UTILITY">Utility</option></select></label>
          <p className="muted full">Recovered carts, old carts before the start time, and carts without a WhatsApp number or product link are skipped.</p>
        </div>
      </section>

      <div className="toolbar settingsSave">
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save all settings'}</button>
        <span role="status" aria-live="polite" className={`saveFeedback ${feedback}`}>{busy ? 'Saving all sections…' : message || 'Changes apply to all sections.'}</span>
      </div>
    </form>
  );
}

function dateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
