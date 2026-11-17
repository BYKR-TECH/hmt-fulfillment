import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_AUTH_COOKIE_OPTIONS } from './auth-config.js';

export function createBrowserAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createBrowserClient(url, anonKey, {
    cookieOptions: SUPABASE_AUTH_COOKIE_OPTIONS
  });
}
