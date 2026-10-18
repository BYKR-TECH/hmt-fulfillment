'use client';

import { useState } from 'react';
import { BOOKING_COURIERS, COURIERS } from '@/lib/crm/constants';
import { ReplacementPartField } from './replacement-part-field';
import { ShipmentPurposeField } from './shipment-purpose-field';

export function ShipmentForm({ order, shipments = [], packageDefaults = {}, pickupLocation = '' }) {
  const initial = getInitialFormValues(order, pickupLocation);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const [rateBusy, setRateBusy] = useState(false);
  const [fedexRate, setFedexRate] = useState(null);
  const [shiprocketQuotes, setShiprocketQuotes] = useState([]);
  const [shiprocketCourierId, setShiprocketCourierId] = useState('');
  const [courier, setCourier] = useState(initial.courier);
  const [serviceCode, setServiceCode] = useState('');
  const [shipmentType, setShipmentType] = useState('original');
  const [replacementPart, setReplacementPart] = useState('');
  const [selectedPickupLocation, setSelectedPickupLocation] = useState(initial.pickupLocation);
  const [labelUrl, setLabelUrl] = useState(initial.labelUrl);
  const [awbNumber, setAwbNumber] = useState(initial.awbNumber);
  const [trackingUrl, setTrackingUrl] = useState(initial.trackingUrl);
  const [deliveryDetails, setDeliveryDetails] = useState(initial.deliveryDetails);
  const [needsDeliveryFix, setNeedsDeliveryFix] = useState(false);
  const { selectedBookingCourier, services, canGenerateLabel, hasExistingShipment, wixShipmentAvailable } = getFormMeta({ order, shipments, courier, labelUrl, awbNumber });

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setNeedsDeliveryFix(false);
    const submitter = event.nativeEvent.submitter;
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    if (submitter?.name) body[submitter.name] = submitter.value;
    if (body.booking_action === 'book_courier' && hasExistingShipment && shipmentType === 'original') {
      const confirmed = window.confirm(
        `This order already has a shipment${order.awb_number ? ` (${order.awb_number})` : ''}. Book a new outbound shipment with a new reference?`
      );
      if (!confirmed) return;
      body.allow_multiple_shipments = 'true';
    }
    if (shipmentType !== 'original') body.allow_multiple_shipments = 'true';
    if (['reverse', 'rto'].includes(shipmentType)) body.service_code = courier === 'shiprocket' ? 'shiprocket_return' : 'reverse_pickup';
    setBusy(true);
    try {
      const response = await fetch(`/api/crm/orders/${order.id}/shipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const error = (data.validation || [data.error || 'Shipment booking failed']).join(', ');
        setMessage(error);
        setNeedsDeliveryFix(/pincode|phone|address/i.test(error));
        return;
      }
      const data = await response.json();
      if (data.label_url) setLabelUrl(data.label_url);
      if (data.awb_number) setAwbNumber(data.awb_number);
      if (data.tracking_url) setTrackingUrl(data.tracking_url);
      setMessage(data.demo ? 'Validated in demo mode. Configure courier credentials and Supabase to persist.' : data.message || 'Shipment saved.');
    } catch {
      setMessage('Shipment booking could not be completed. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function openOrGenerateLabel(event) {
    event?.preventDefault();
    setMessage('');
    if (labelUrl) {
      window.open(labelUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!awbNumber) {
      setMessage('AWB is required before generating a shipping label.');
      return;
    }
    // Open synchronously so browsers do not block the label as a popup. The tab
    // is navigated only after the carrier confirms a usable label URL.
    const labelWindow = window.open('', '_blank');
    if (labelWindow) labelWindow.opener = null;
    setLabelBusy(true);
    try {
      const response = await fetch(`/api/crm/orders/${order.id}/label`, { method: 'POST' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        labelWindow?.close();
        setMessage(data.error || 'Label generation failed.');
        return;
      }
      const data = await response.json();
      if (data.label_url) {
        setLabelUrl(data.label_url);
        if (labelWindow) labelWindow.location.replace(data.label_url);
        else window.open(data.label_url, '_blank', 'noopener,noreferrer');
        setMessage('Label opened in a new tab.');
      } else {
        labelWindow?.close();
        setMessage('No label URL was returned by the courier.');
      }
    } catch {
      labelWindow?.close();
      setMessage('Label generation could not be completed. Please try again.');
    } finally {
      setLabelBusy(false);
    }
  }

  function downloadFedexTemplate(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget.form);
    const params = new URLSearchParams();
    for (const key of ['weight_grams', 'length_cm', 'width_cm', 'height_cm', 'product_value']) {
      const value = form.get(key);
      if (value) params.set(key, value);
    }
    params.set('_', String(Date.now()));
    window.location.href = `/api/crm/orders/${order.id}/fedex-template?${params.toString()}`;
  }

  async function getFedexEstimate(event) {
    event.preventDefault();
    setMessage('');
    setFedexRate(null);
    const form = new FormData(event.currentTarget.form);
    const body = Object.fromEntries(['weight_grams', 'length_cm', 'width_cm', 'height_cm', 'product_value'].map(key => [key, form.get(key)]));
    setRateBusy(true);
    try {
      const response = await fetch(`/api/crm/orders/${order.id}/fedex-rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setMessage(data.error || 'FedEx estimate failed.');
        return;
      }
      const data = await response.json();
      if (!data.ok) {
        setMessage(data.error || 'FedEx estimate failed.');
        return;
      }
      const quote = data.quotes?.[0] || null;
      setFedexRate(quote);
      setMessage(quote ? 'FedEx estimate loaded.' : 'FedEx returned no rate quotes for this shipment.');
    } finally {
      setRateBusy(false);
    }
  }

  async function getShiprocketEstimates(event) {
    const body = Object.fromEntries(new FormData(event.currentTarget.form).entries());
    setMessage(''); setShiprocketQuotes([]); setShiprocketCourierId(''); setRateBusy(true);
    try {
      const response = await fetch(`/api/crm/orders/${order.id}/shipping-estimate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, courier: 'shiprocket' }) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Estimates failed');
      }
      const data = await response.json();
      setShiprocketQuotes(data.quotes || []);
      setMessage(data.quotes?.length ? `${data.quotes.length} courier services available. Select one to book.` : 'No couriers available for this route.');
    } catch (error) { setMessage(error.message); } finally { setRateBusy(false); }
  }

  return (
    <form id="replacement-booking" className="formGrid shipmentBookingForm" action={`/api/crm/orders/${order.id}/shipment`} method="post" onSubmit={submit}>
      <input type="hidden" name="shiprocket_courier_id" value={shiprocketCourierId} />
      <DeliveryDetailsFields needsFix={needsDeliveryFix} details={deliveryDetails} setDetails={setDeliveryDetails} country={order.country || 'IN'} />
      <ShipmentSource order={order} available={wixShipmentAvailable} />
      <ShipmentOptions order={order} shipmentType={shipmentType} setShipmentType={setShipmentType} replacementPart={replacementPart} setReplacementPart={setReplacementPart} pickup={selectedPickupLocation} setPickup={setSelectedPickupLocation} courier={courier} setCourier={setCourier} services={services} serviceCode={serviceCode} setServiceCode={setServiceCode} resetQuotes={() => { setShiprocketQuotes([]); setShiprocketCourierId(''); }} />
      <PackageAndTrackingFields order={order} packageDefaults={packageDefaults} courier={courier} awbNumber={awbNumber} setAwbNumber={setAwbNumber} trackingUrl={trackingUrl} setTrackingUrl={setTrackingUrl} labelUrl={labelUrl} setLabelUrl={setLabelUrl} selectedBookingCourier={selectedBookingCourier} />
      <ShipmentFormActions busy={busy} courier={courier} shipmentType={shipmentType} shiprocketCourierId={shiprocketCourierId} labelBusy={labelBusy} canGenerateLabel={canGenerateLabel} labelUrl={labelUrl} rateBusy={rateBusy} message={message} onLabel={openOrGenerateLabel} onFedexEstimate={getFedexEstimate} onFedexTemplate={downloadFedexTemplate} onShiprocketEstimates={getShiprocketEstimates} />
      <QuoteResults courier={courier} quotes={shiprocketQuotes} selectedCourierId={shiprocketCourierId} setSelectedCourierId={setShiprocketCourierId} busy={busy} fedexRate={fedexRate} />
    </form>
  );
}

function DeliveryDetailsFields({ needsFix, details, setDetails, country }) {
  if (!needsFix) return <><input type="hidden" name="phone" value={details.phone} /><input type="hidden" name="pincode" value={details.pincode} /><input type="hidden" name="address_line1" value={details.addressLine1} /><input type="hidden" name="country" value={country} /></>;
  return <><div className="shipmentSource full" role="alert"><div><strong>Fix the delivery details, then retry booking</strong><p className="muted">The courier rejected one or more delivery fields. Your entered values stay in this form for the retry.</p></div></div><label><span>Recipient phone</span><input name="phone" value={details.phone} onChange={event => setDetails(current => ({ ...current, phone: event.target.value }))} required /></label><label><span>Delivery pincode</span><input name="pincode" value={details.pincode} onChange={event => setDetails(current => ({ ...current, pincode: event.target.value }))} inputMode="numeric" required /></label><label className="full"><span>Delivery address</span><input name="address_line1" value={details.addressLine1} onChange={event => setDetails(current => ({ ...current, addressLine1: event.target.value }))} required /></label><input type="hidden" name="country" value={country} /></>;
}

function ShipmentSource({ order, available }) {
  return <div className="shipmentSource full"><div><strong>{available ? 'Wix shipment data found' : 'No Wix shipment found'}</strong><p className="muted">{available ? [order.courier, order.awb_number, order.wix_fulfillment_id].filter(Boolean).join(' · ') : 'Book a new shipment or save a manual AWB below.'}</p>{order.selected_shipping_title ? <p className="muted">Wix delivery option: <strong>{order.selected_shipping_title}</strong></p> : null}</div>{order.tracking_url ? <a className="button secondary" href={order.tracking_url} target="_blank" rel="noreferrer">Open Wix tracking</a> : null}</div>;
}

function ShipmentOptions({ order, shipmentType, setShipmentType, replacementPart, setReplacementPart, pickup, setPickup, courier, setCourier, services, serviceCode, setServiceCode, resetQuotes }) {
  const reverse = ['reverse', 'rto'].includes(shipmentType);
  function changeCourier(event) { setCourier(event.target.value); setServiceCode(''); resetQuotes(); }
  return <><ShipmentPurposeField value={shipmentType} onChange={event => setShipmentType(event.target.value)} />{shipmentType === 'replacement' ? <ReplacementPartField value={replacementPart} onChange={event => setReplacementPart(event.target.value)} /> : null}<label><span>Pickup location</span><select name="pickup_location" value={pickup} onChange={event => setPickup(event.target.value)}>{!['Sis Vars', 'HSR GDP', 'Hold My Throttle HQ', 'Sai Preetham'].includes(pickup) ? <option value={pickup}>{pickup}</option> : null}<option value="Sis Vars">Sis Vars</option><option value="HSR GDP">HSR GDP</option><option value="Hold My Throttle HQ">Hold My Throttle HQ</option><option value="Sai Preetham">Sai Preetham</option></select></label><label><span>Courier</span><select name="courier" value={courier} onChange={changeCourier}>{Array.from(new Set([order.courier, ...COURIERS].filter(Boolean))).map(option => <option value={option} key={option}>{option.replaceAll('_', ' ')}</option>)}</select></label><label><span>Service</span><select name="service_code" value={reverse ? 'reverse_pickup' : serviceCode || services[0]?.code || 'manual'} onChange={event => setServiceCode(event.target.value)} disabled={!services.length || reverse}>{services.length ? services.map(service => <option value={service.code} key={service.code}>{service.name}</option>) : <option value="manual">Manual / not configured</option>}</select></label></>;
}

function PackageAndTrackingFields({ order, packageDefaults, courier, awbNumber, setAwbNumber, trackingUrl, setTrackingUrl, labelUrl, setLabelUrl, selectedBookingCourier }) {
  const directCourier = ['delhivery', 'fedex', 'shiprocket'].includes(courier);
  return <><label><span>Package weight (grams)</span><input name="weight_grams" type="number" min="1" step="1" defaultValue={packageDefaults.weightGrams || 400} /></label><label><span>Product value ({order.currency || 'INR'})</span><input name="product_value" type="number" step="0.01" defaultValue={order.order_value || ''} /></label><label><span>Length (cm)</span><input name="length_cm" type="number" min="0.1" step="0.1" defaultValue={packageDefaults.lengthCm || 23} /></label><label><span>Width (cm)</span><input name="width_cm" type="number" min="0.1" step="0.1" defaultValue={packageDefaults.widthCm || 14} /></label><label><span>Height (cm)</span><input name="height_cm" type="number" min="0.1" step="0.1" defaultValue={packageDefaults.heightCm || 6} /></label><label><span>Payment mode</span><select name="payment_mode" defaultValue="Prepaid"><option>Prepaid</option><option>COD</option></select></label><label><span>AWB/manual override</span><input name="awb_number" value={awbNumber} onChange={event => setAwbNumber(event.target.value)} placeholder="Optional when courier API returns AWB" /></label><label><span>Direct tracking link{directCourier ? ' (optional)' : ''}</span><input name="tracking_url" type="url" value={trackingUrl} onChange={event => setTrackingUrl(event.target.value)} placeholder="https://carrier.example/track/..." required={!directCourier} /></label><label><span>Label URL</span><input name="label_url" value={labelUrl} onChange={event => setLabelUrl(event.target.value)} placeholder="Supabase Storage or courier label URL" /></label>{courier !== 'shiprocket' ? <label className="checkItem full"><input type="checkbox" name="insurance" /><span>Insurance option requested</span></label> : <p className="muted full">Secure opt-in is off. Turn off Auto Secure in Shiprocket account settings too to prevent automatic cover.</p>}{selectedBookingCourier && !selectedBookingCourier.enabled ? <p className="muted full">Direct API booking for {selectedBookingCourier.name} is not configured yet. Save the shipment with a manual AWB for now.</p> : null}</>;
}

function ShipmentFormActions({ busy, courier, shipmentType, shiprocketCourierId, labelBusy, canGenerateLabel, labelUrl, rateBusy, message, onLabel, onFedexEstimate, onFedexTemplate, onShiprocketEstimates }) {
  return <div className="toolbar full"><BookingButtons busy={busy} courier={courier} shipmentType={shipmentType} shiprocketCourierId={shiprocketCourierId} /><LabelButtons busy={labelBusy} canGenerate={canGenerateLabel} labelUrl={labelUrl} onLabel={onLabel} /><CourierEstimateButtons courier={courier} busy={rateBusy} onFedexEstimate={onFedexEstimate} onFedexTemplate={onFedexTemplate} onShiprocketEstimates={onShiprocketEstimates} /><ActionMessage message={message} /></div>;
}

function BookingButtons({ busy, courier, shipmentType, shiprocketCourierId }) {
  const needsQuote = courier === 'shiprocket' && !shiprocketCourierId;
  const bookingLabel = shipmentType === 'original' ? 'shipment' : shipmentType;
  return <><button type="submit" name="booking_action" value="book_courier" disabled={busy || needsQuote} aria-busy={busy}>{busy ? <><span className="buttonSpinner" aria-hidden="true" />Booking shipment…</> : `Book ${bookingLabel}`}</button><button type="submit" name="booking_action" value="save_manual_awb" className="secondary" disabled={busy}>Save manual AWB</button></>;
}

function LabelButtons({ busy, canGenerate, labelUrl, onLabel }) {
  const buttonLabel = busy ? 'Generating...' : labelUrl ? 'Open label' : 'Generate label';
  return <><button type="button" className="secondary" onClick={onLabel} disabled={busy || !canGenerate}>{buttonLabel}</button>{labelUrl ? <a className="button secondary" href={labelUrl} target="_blank" rel="noreferrer">Download label</a> : null}</>;
}

function CourierEstimateButtons({ courier, busy, onFedexEstimate, onFedexTemplate, onShiprocketEstimates }) {
  if (courier === 'fedex') return <><button type="button" className="secondary" onClick={onFedexEstimate} disabled={busy}>{busy ? 'Checking FedEx...' : 'Get FedEx estimate'}</button><button type="button" className="secondary" onClick={onFedexTemplate}>Generate FedEx Excel</button></>;
  if (courier === 'shiprocket') return <button type="button" className="secondary" onClick={onShiprocketEstimates} disabled={busy}>{busy ? 'Loading couriers…' : 'Get Shiprocket estimates'}</button>;
  return null;
}

function ActionMessage({ message }) { return message ? <span className="muted" role="status">{message}</span> : null; }

function QuoteResults({ courier, quotes, selectedCourierId, setSelectedCourierId, busy, fedexRate }) {
  if (courier === 'shiprocket' && quotes.length) return <fieldset className="full shiprocketQuotes"><legend>Choose a courier</legend>{quotes.map(quote => <label className="shiprocketQuote" key={quote.courierId}><input type="radio" name="shiprocket_quote" checked={selectedCourierId === String(quote.courierId)} onChange={() => setSelectedCourierId(String(quote.courierId))} /><span><strong>{quote.courierName}</strong><small>{quote.estimatedDeliveryDate || quote.estimatedDeliveryDays} · {quote.mode}</small></span><strong>{quote.currency} {quote.rate?.toFixed(2)}</strong></label>)}<p className="muted">Booking requests pickup automatically. The confirmation will show whether pickup succeeded.</p><button type="submit" name="booking_action" value="book_courier" disabled={busy || !selectedCourierId}>{busy ? 'Booking…' : 'Book selected courier'}</button></fieldset>;
  if (courier === 'fedex' && fedexRate) return <div className="shipmentSource full"><div><strong>{fedexRate.currency && fedexRate.amount !== '' ? `${fedexRate.currency} ${fedexRate.amount}` : 'FedEx rate returned'}</strong><p className="muted">{[fedexRate.serviceName, fedexRate.rateType, fedexRate.transitTime, fedexRate.commitmentDate].filter(Boolean).join(' · ')}</p></div></div>;
  return null;
}

function defaultCourierForOrder(order = {}) {
  const country = String(order.shipping_country || order.country || 'IN').trim().toUpperCase();
  return country && country !== 'IN' && country !== 'INDIA' ? 'fedex' : 'delhivery';
}

function getInitialFormValues(order, pickupLocation) {
  return {
    courier: order.courier || defaultCourierForOrder(order),
    pickupLocation: pickupLocation || 'Sis Vars',
    labelUrl: order.label_url || '',
    awbNumber: order.awb_number || '',
    trackingUrl: order.tracking_url || '',
    deliveryDetails: {
      phone: order.phone || '',
      pincode: order.pincode || '',
      addressLine1: order.address_line1 || ''
    }
  };
}

function getFormMeta({ order, shipments, courier, labelUrl, awbNumber }) {
  const selectedBookingCourier = BOOKING_COURIERS.find(item => item.code === courier);
  return {
    selectedBookingCourier,
    services: selectedBookingCourier?.services || [],
    canGenerateLabel: Boolean(labelUrl || awbNumber),
    hasExistingShipment: Boolean(shipments.length || order.awb_number || order.shipment_status === 'shipment_booked'),
    wixShipmentAvailable: Boolean(order.wix_fulfillment_id || order.awb_number || order.tracking_url)
  };
}
