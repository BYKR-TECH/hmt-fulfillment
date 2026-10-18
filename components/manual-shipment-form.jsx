'use client';

import { useState } from 'react';
import { ReplacementPartField } from './replacement-part-field';
import { ShipmentPurposeField } from './shipment-purpose-field';

export function ManualShipmentForm() {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [shipmentType, setShipmentType] = useState('original');
  const [replacementPart, setReplacementPart] = useState('');
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/crm/shipments/manual', { method: 'POST', body: new FormData(form) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setMessage(result.error || result.validation?.join(', ') || 'Could not save shipment.');
        return;
      }
      const result = await response.json();
      form.reset(); setMessage(result.demo ? 'Manual shipment validated in demo mode.' : 'Manual shipment saved.');
    } finally {
      setBusy(false);
    }
  }
  return <form className="formGrid" onSubmit={submit}>
    <Field name="awb_number" label="AWB / tracking number" required /><Field name="order_number" label="Order number" required /><Field name="customer_name" label="Recipient name" required /><Field name="phone" label="Recipient phone" required />
    <Field name="address_line1" label="Address" required /><Field name="city" label="City" /><Field name="state" label="State" /><Field name="pincode" label="Pincode" required /><Field name="product_value" label="Product value" type="number" value="1" required />
    <label><span>Courier</span><select name="courier" defaultValue="delhivery"><option value="delhivery">Delhivery</option><option value="fedex">FedEx</option><option value="shiprocket">Shiprocket</option><option value="other">Other</option></select></label>
    <ShipmentPurposeField value={shipmentType} onChange={event => setShipmentType(event.target.value)} />
    {shipmentType === 'replacement' ? <ReplacementPartField value={replacementPart} onChange={event => setReplacementPart(event.target.value)} /> : null}
    <label><span>Payment mode</span><select name="payment_mode" defaultValue="Prepaid"><option>Prepaid</option><option>COD</option></select></label><Field name="weight_grams" label="Weight (grams)" type="number" value="400" /><Field name="length_cm" label="Length (cm)" type="number" value="23" /><Field name="width_cm" label="Width (cm)" type="number" value="14" /><Field name="height_cm" label="Height (cm)" type="number" value="6" />
    <label className="full"><span>Label URL (optional)</span><input name="label_url" type="url" /></label><label className="full"><span>Upload shipping label (optional)</span><input name="label_file" type="file" accept="application/pdf,image/png,image/jpeg" /><small className="muted">PDF, PNG, or JPEG; maximum 10 MB. Stored securely with this shipment.</small></label><div className="toolbar full"><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save manual shipment'}</button>{message ? <span className="muted">{message}</span> : null}</div>
  </form>;
}
function Field({ name, label, type = 'text', value = '', required = false }) { return <label><span>{label}</span><input name={name} type={type} defaultValue={value} required={required} /></label>; }
