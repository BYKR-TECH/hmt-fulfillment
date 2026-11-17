// Browser auth uses the public gateway while server auth uses the private
// Supabase address. A fixed storage key lets both clients share one session.
export const SUPABASE_AUTH_COOKIE_OPTIONS = Object.freeze({
  name: 'sb-hmt-ops-auth-token'
});
