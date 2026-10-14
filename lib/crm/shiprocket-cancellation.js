export function shiprocketOrderId(shipment) {
  return shipment.carrier_response?.order_id || shipment.carrier_response?.create_response?.order_id || null;
}

export function canCancelShiprocket(shipment) {
  return String(shipment.courier_code).toLowerCase() === 'shiprocket'
    && Boolean(shiprocketOrderId(shipment))
    && Boolean(shipment.waybill)
    && ['booked', 'shipment_booked', 'pickup_pending'].includes(String(shipment.status).toLowerCase());
}
