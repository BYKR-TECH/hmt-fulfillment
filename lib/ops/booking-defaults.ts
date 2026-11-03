import 'server-only';
import { createServiceClient } from '@/lib/supabase/server';
import type { BookingDefaults } from '@/components/ops/client';

// Pickup locations registered with Delhivery (names are case-sensitive).
const PICKUP_LOCATIONS = ['Sis Vars', 'HSR GDP', 'HSR BYKR'];

/** Pre-fill for manual booking: the saved auto-booking package/pickup, else the historical defaults. */
export async function bookingDefaults(): Promise<BookingDefaults> {
  const fallback: BookingDefaults = { pickupLocations: PICKUP_LOCATIONS, pickupLocation: 'Sis Vars', weightGrams: 400, lengthCm: 23, widthCm: 14, heightCm: 6 };
  const client = createServiceClient();
  if (!client) return fallback;
  const { data } = await client.from('crm_settings').select('value').eq('key', 'auto_booking').maybeSingle();
  const saved = (data?.value ?? {}) as { pickupLocation?: string; package?: { weightGrams?: number; lengthCm?: number; widthCm?: number; heightCm?: number } };
  return {
    pickupLocations: PICKUP_LOCATIONS,
    pickupLocation: saved.pickupLocation && PICKUP_LOCATIONS.includes(saved.pickupLocation) ? saved.pickupLocation : fallback.pickupLocation,
    weightGrams: Number(saved.package?.weightGrams) || fallback.weightGrams,
    lengthCm: Number(saved.package?.lengthCm) || fallback.lengthCm,
    widthCm: Number(saved.package?.widthCm) || fallback.widthCm,
    heightCm: Number(saved.package?.heightCm) || fallback.heightCm
  };
}
