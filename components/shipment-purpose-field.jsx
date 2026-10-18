export function ShipmentPurposeField({ value, onChange }) {
  return <label><span>Shipment purpose</span><select name="shipment_type" value={value} onChange={onChange}><option value="original">Original order</option><option value="replacement">Replacement outbound</option><option value="reverse">Reverse pickup</option><option value="rto">RTO movement</option></select></label>;
}
