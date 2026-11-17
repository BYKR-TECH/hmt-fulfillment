#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const email = process.argv[2]?.trim().toLowerCase();
const fullName = process.argv[3]?.trim() || 'Local Administrator';
if (!email || !email.includes('@')) {
  console.error('Usage: create-local-supabase-admin.mjs <email> [full name]');
  process.exit(2);
}

const installDir = process.env.LOCAL_SUPABASE_DIR || '/home/saipi/hmt-local-supabase';
const envText = await readFile(`${installDir}/.env`, 'utf8');
const values = Object.fromEntries(
  envText.split(/\r?\n/).filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
);
const serviceKey = values.SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error('Local Supabase service key is missing.');

const baseUrl = process.env.LOCAL_SUPABASE_URL || 'http://127.0.0.1:8001';
const generatedPassword = !process.env.HMT_LOCAL_ADMIN_PASSWORD;
const password = process.env.HMT_LOCAL_ADMIN_PASSWORD || `${randomBytes(18).toString('base64url')}A1!`;
if (password.length < 12) throw new Error('HMT_LOCAL_ADMIN_PASSWORD must be at least 12 characters.');

const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json'
};
const authResponse = await fetch(`${baseUrl}/auth/v1/admin/users`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName } })
});
const authBody = await authResponse.json();
if (!authResponse.ok) throw new Error(`Could not create local Auth user (${authResponse.status}): ${authBody.message || authBody.error || 'unknown error'}`);

const profileResponse = await fetch(`${baseUrl}/rest/v1/users?on_conflict=email`, {
  method: 'POST',
  headers: { ...headers, prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify({
    auth_user_id: authBody.id,
    email,
    full_name: fullName,
    role: 'admin',
    active: true,
    custom_permissions: {}
  })
});
if (!profileResponse.ok) {
  const detail = await profileResponse.text();
  throw new Error(`Auth user was created, but the admin profile failed (${profileResponse.status}): ${detail}`);
}

console.log(`Local admin created for ${email}.`);
if (generatedPassword) console.log(`Temporary password: ${password}`);
