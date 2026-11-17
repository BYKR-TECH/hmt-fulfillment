#!/usr/bin/env bash
# Point the production app at the healthy local Supabase stack.
set -Eeuo pipefail
umask 077

readonly install_dir="${LOCAL_SUPABASE_DIR:-/home/saipi/hmt-local-supabase}"
readonly app_env="${HMT_APP_ENV:-/home/saipi/wixdelhivery-shared/.env}"
readonly public_origin="${HMT_PUBLIC_ORIGIN:-https://ops.holdmythrottle.com}"
readonly public_path="${HMT_SUPABASE_PUBLIC_PATH:-/local-supabase}"

[[ -f "$install_dir/.env" ]]
[[ -f "$app_env" ]]

read_secret() {
  sed -n "s/^$1=//p" "$install_dir/.env" | tail -n 1
}

anon_key="$(read_secret ANON_KEY)"
service_key="$(read_secret SERVICE_ROLE_KEY)"
[[ -n "$anon_key" && -n "$service_key" ]]
curl --fail --silent --show-error --max-time 10 -H "apikey: $anon_key" http://127.0.0.1:8001/auth/v1/health >/dev/null

backup="${app_env}.before-local-supabase-$(date +%Y%m%dT%H%M%S)"
cp -p "$app_env" "$backup"

set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$app_env"; then
    sed -i "s|^${key}=.*$|${key}=${value}|" "$app_env"
  else
    printf '%s=%s\n' "$key" "$value" >> "$app_env"
  fi
}

set_env SUPABASE_URL http://127.0.0.1:8001
set_env SUPABASE_ANON_KEY "$anon_key"
set_env SUPABASE_SERVICE_ROLE_KEY "$service_key"
set_env NEXT_PUBLIC_SUPABASE_URL "${public_origin}${public_path}"
set_env NEXT_PUBLIC_SUPABASE_ANON_KEY "$anon_key"
set_env AUTH_REQUIRED true
chmod 600 "$app_env"
echo "Production environment now targets local Supabase. Backup: $backup"
