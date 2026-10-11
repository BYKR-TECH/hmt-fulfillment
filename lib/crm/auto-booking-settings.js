// No saved row means legacy routing; these are the defaults for the first save.
export const DEFAULT_AUTO_BOOKING_SETTINGS = Object.freeze({
  enabled: true, dryRun: false, pickupLocation: 'Sis Vars', pickupExplicitlyChosen: false,
  domestic: { courier: 'delhivery', serviceMode: 'express' },
  international: { courier: 'delhivery', serviceMode: 'dlv_premium' },
  package: { weightGrams: 400, lengthCm: 23, widthCm: 14, heightCm: 6 },
  allowedSources: ['woocommerce', 'wix', 'manual'], requirePaid: true,
  skipAutomationHold: true, requirePacked: false, allowedCountries: [], maxOrderValue: null,
  runTime: '', cutoffTime: '', timezone: 'Asia/Kolkata'
});

export function validateAutoBookingSettings(value = {}) {
  const defaults = DEFAULT_AUTO_BOOKING_SETTINGS;
  const settings = { ...structuredClone(defaults), ...value,
    domestic: { ...defaults.domestic, ...value.domestic },
    international: { ...defaults.international, ...value.international },
    package: { ...defaults.package, ...value.package } };
  if (String(settings.pickupLocation || '').trim().toLowerCase() === 'sid vars') settings.pickupLocation = 'Sis Vars'; // early saves used the Delhivery One display name
  for (const key of ['enabled', 'dryRun', 'pickupExplicitlyChosen', 'requirePaid', 'skipAutomationHold', 'requirePacked']) {
    if (typeof settings[key] !== 'boolean') throw new Error(`${key} must be on or off.`);
  }
  if (!['Sis Vars', 'HSR GDP', 'HSR BYKR'].includes(settings.pickupLocation)) throw new Error('Choose a supported pickup location.');
  if (settings.pickupLocation.startsWith('HSR') && !settings.pickupExplicitlyChosen) throw new Error('HSR pickup requires explicit confirmation.');
  if (settings.domestic.courier !== 'delhivery' || !['express', 'surface'].includes(settings.domestic.serviceMode)) throw new Error('Domestic booking supports Delhivery Express or Surface.');
  if (!['delhivery', 'fedex'].includes(settings.international.courier)) throw new Error('Choose Delhivery or FedEx internationally.');
  if (settings.international.serviceMode !== (settings.international.courier === 'delhivery' ? 'dlv_premium' : 'international_express')) throw new Error('International Delhivery must use DLV Premium, never Saver; FedEx must use International Express.');
  for (const key of Object.keys(defaults.package)) {
    const number = Number(settings.package[key]);
    if (!Number.isFinite(number) || number <= 0) throw new Error(`${key} must be positive.`);
    settings.package[key] = number;
  }
  if (!Array.isArray(settings.allowedSources) || settings.allowedSources.some(source => !defaults.allowedSources.includes(source))) throw new Error('Invalid allowed sources.');
  if (!Array.isArray(settings.allowedCountries) || settings.allowedCountries.some(country => !/^[A-Z]{2}$/.test(country))) throw new Error('Use two-letter uppercase country codes.');
  if (settings.maxOrderValue === '' || settings.maxOrderValue === null) settings.maxOrderValue = null;
  else {
    settings.maxOrderValue = Number(settings.maxOrderValue);
    if (!Number.isFinite(settings.maxOrderValue) || settings.maxOrderValue <= 0) throw new Error('Maximum order value must be positive or blank.');
  }
  for (const key of ['runTime', 'cutoffTime']) {
    if (settings[key] !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings[key])) throw new Error(`${key} must be HH:mm or blank.`);
  }
  if (settings.runTime && settings.cutoffTime && settings.runTime > settings.cutoffTime) throw new Error('Run time must be before cutoff time.');
  if (settings.timezone !== 'Asia/Kolkata') throw new Error('Booking timezone must be Asia/Kolkata.');
  return settings;
}

export function autoBookingSettingsFromForm(payload) {
  const on = key => payload[`auto_booking_${key}`] === 'on' || payload[`auto_booking_${key}`] === true;
  const list = key => String(payload[`auto_booking_${key}`] || '').split(',').map(value => value.trim()).filter(Boolean);
  return validateAutoBookingSettings({
    enabled: on('enabled'), dryRun: on('dry_run'), pickupLocation: payload.auto_booking_pickup_location,
    pickupExplicitlyChosen: on('pickup_explicitly_chosen'),
    domestic: { courier: 'delhivery', serviceMode: payload.auto_booking_domestic_mode },
    international: { courier: payload.auto_booking_international_courier, serviceMode: payload.auto_booking_international_mode },
    package: Object.fromEntries(Object.keys(DEFAULT_AUTO_BOOKING_SETTINGS.package).map(key => [key, payload[`auto_booking_${key}`]])),
    allowedSources: list('sources'), requirePaid: on('require_paid'), skipAutomationHold: on('skip_hold'), requirePacked: on('require_packed'),
    allowedCountries: list('countries').map(country => country.toUpperCase()), maxOrderValue: payload.auto_booking_max_value,
    runTime: payload.auto_booking_run_time || '', cutoffTime: payload.auto_booking_cutoff_time || ''
  });
}

export function autoBookingSkipReason(order, settings, now = new Date()) {
  if (!settings.enabled) return 'booking-disabled';
  if (!settings.allowedSources.includes(order.source || 'wix')) return 'source-not-allowed';
  if (settings.requirePaid && !['paid', 'approved'].includes(String(order.payment_status || '').toLowerCase())) return 'unpaid';
  if (settings.skipAutomationHold && order.automation_hold) return 'automation-hold';
  if (settings.requirePacked && order.internal_status !== 'packed' && !(order.pick_pack_tasks || []).some(task => task.status === 'packed')) return 'not-packed';
  const country = String(order.shipping_address?.country || order.raw_order?.shippingInfo?.logistics?.shippingDestination?.address?.country || order.raw_order?.billingInfo?.address?.country || 'IN').toUpperCase();
  if (settings.allowedCountries.length && !settings.allowedCountries.includes(country)) return 'country-not-allowed';
  if (settings.maxOrderValue !== null && (!Number.isFinite(Number(order.total_amount)) || order.total_amount == null || Number(order.total_amount) > settings.maxOrderValue)) return 'order-value-limit';
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  if (settings.runTime && time < settings.runTime) return 'before-run-time';
  if (settings.cutoffTime && time > settings.cutoffTime) return 'after-cutoff';
  return '';
}

export function autoBookingConfig(config, settings) {
  if (!settings) return config;
  const pkg = settings.package;
  return { ...config, delhivery: { ...config.delhivery, pickupLocation: settings.pickupLocation }, defaults: {
    ...config.defaults, ...pkg, internationalWeightGrams: pkg.weightGrams,
    internationalLengthCm: pkg.lengthCm, internationalWidthCm: pkg.widthCm, internationalHeightCm: pkg.heightCm
  } };
}
