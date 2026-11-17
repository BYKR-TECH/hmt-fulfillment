// Loaded by `npm test` (node --import). Tests must never reach Supabase, Woo,
// couriers, Chatwoot or any other real service: every outbound request fails
// loudly instead. Tests that need HTTP pass their own fetchImpl / client fakes.
import http from 'node:http';
import https from 'node:https';

function blocked(target) {
  return new Error(`Network access is blocked in tests (${target}). Inject a fake instead.`);
}

globalThis.fetch = async input => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  throw blocked(url.split('?')[0]);
};

for (const mod of [http, https]) {
  const refuse = options => {
    const target = typeof options === 'string' ? options : options?.href || options?.hostname || options?.host || 'request';
    throw blocked(target);
  };
  mod.request = refuse;
  mod.get = refuse;
}
