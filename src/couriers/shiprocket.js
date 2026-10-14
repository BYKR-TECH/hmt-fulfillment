import { createShiprocketShipment, getShiprocketRates, mapOrderToShiprocket } from '../shiprocket.js';

export const shiprocketAdapter = {
  code: 'shiprocket',
  name: 'Shiprocket',

  getServices() {
    return [
      { code: 'shiprocket_forward', displayName: 'Choose from estimate', direction: 'forward', flow: 'domestic' },
      { code: 'shiprocket_return', displayName: 'Return pickup', direction: 'reverse', flow: 'domestic' }
    ];
  },

  mapOrder(order, config, options) {
    return mapOrderToShiprocket(order, config, options);
  },

  async getRates(params, config) {
    return getShiprocketRates(params, config);
  },

  async createShipment(payload, config) {
    return createShiprocketShipment(payload, config);
  },

  normalizeStatus(rawStatus) {
    return String(rawStatus || 'unknown').toLowerCase();
  }
};
