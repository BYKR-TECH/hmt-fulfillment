#!/usr/bin/env bash
# Install the pinned, official self-hosted Supabase stack on saipi.
set -Eeuo pipefail
umask 077

readonly install_dir="${LOCAL_SUPABASE_DIR:-/home/saipi/hmt-local-supabase}"
readonly public_origin="${HMT_PUBLIC_ORIGIN:-https://ops.holdmythrottle.com}"
readonly public_path="${HMT_SUPABASE_PUBLIC_PATH:-/local-supabase}"
readonly upstream_commit="189adda99d1b56da55fc5a6ee3f849354aaea92a"

command -v docker >/dev/null
command -v git >/dev/null
command -v openssl >/dev/null
command -v node >/dev/null
docker compose version >/dev/null

if [[ -e "$install_dir" ]]; then
  [[ -f "$install_dir/.hmt-upstream-commit" ]] || {
    echo "Refusing to replace unrecognized directory: $install_dir" >&2
    exit 1
  }
  [[ "$(<"$install_dir/.hmt-upstream-commit")" == "$upstream_commit" ]] || {
    echo "Existing local Supabase version differs; use the documented update procedure." >&2
    exit 1
  }
else
  scratch="$(mktemp -d)"
  trap 'rm -rf -- "$scratch"' EXIT
  git -C "$scratch" init --quiet
  git -C "$scratch" remote add origin https://github.com/supabase/supabase.git
  git -C "$scratch" fetch --quiet --depth 1 origin "$upstream_commit"
  [[ "$(git -C "$scratch" rev-parse FETCH_HEAD)" == "$upstream_commit" ]]
  git -C "$scratch" sparse-checkout init --cone
  git -C "$scratch" sparse-checkout set docker
  git -C "$scratch" checkout --quiet FETCH_HEAD
  mkdir -p "$install_dir"
  cp -a "$scratch/docker/." "$install_dir/"
  printf '%s\n' "$upstream_commit" > "$install_dir/.hmt-upstream-commit"
  cp "$install_dir/.env.example" "$install_dir/.env"

  cd "$install_dir"
  sh utils/generate-keys.sh --update-env > /dev/null
  sh utils/add-new-auth-keys.sh --update-env > /dev/null
  rm -f .env.old docker-compose.yml.old
fi

set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$install_dir/.env"; then
    sed -i "s|^${key}=.*$|${key}=${value}|" "$install_dir/.env"
  else
    printf '%s=%s\n' "$key" "$value" >> "$install_dir/.env"
  fi
}

set_env API_GW_HTTP_PORT 127.0.0.1:8001
set_env KONG_HTTPS_PORT 127.0.0.1:8445
set_env COMPOSE_FILE docker-compose.yml:docker-compose.kong.yml:docker-compose.hmt.yml
set_env SUPABASE_PUBLIC_URL "${public_origin}${public_path}"
set_env API_EXTERNAL_URL "${public_origin}${public_path}/auth/v1"
set_env SITE_URL "$public_origin"
set_env ADDITIONAL_REDIRECT_URLS "${public_origin}/reset-password"
set_env DISABLE_SIGNUP true
set_env ENABLE_EMAIL_AUTOCONFIRM true
set_env ENABLE_PHONE_SIGNUP false
set_env ENABLE_PHONE_AUTOCONFIRM false
set_env STUDIO_DEFAULT_ORGANIZATION 'Hold My Throttle'
set_env STUDIO_DEFAULT_PROJECT 'Operations CRM'
set_env POOLER_TENANT_ID hmt-ops

# Raspberry Pi uses a 39-bit virtual address space, which is incompatible with
# the current Envoy build's TCMalloc assumptions. Use Supabase's official Kong
# override and disable optional image transformations (the imgproxy image also
# requires newer ARM instructions than the Pi 4 provides).
cat > "$install_dir/docker-compose.hmt.yml" <<'YAML'
services:
  storage:
    depends_on: !override
      db:
        condition: service_healthy
      rest:
        condition: service_started
    environment:
      ENABLE_IMAGE_TRANSFORMATION: "false"
YAML

# Git honors the installer's restrictive umask during checkout. Containers use
# non-root users, so shipped configuration and initialization SQL must remain
# readable. Never relax permissions on secrets or persisted customer data.
find "$install_dir" \
  \( -path "$install_dir/volumes/db/data" -o -path "$install_dir/volumes/storage" \) -prune -o \
  -type d -exec chmod 755 {} +
find "$install_dir" \
  \( -path "$install_dir/volumes/db/data" -o -path "$install_dir/volumes/storage" \) -prune -o \
  -type f ! -name .env -exec chmod u+rw,go+r {} +
chmod 755 "$install_dir/volumes/storage"
chmod 600 "$install_dir/.env"
cd "$install_dir"
docker compose pull --quiet db auth rest studio api-gw
docker compose up -d --wait db auth rest studio api-gw

anon_key="$(sed -n 's/^ANON_KEY=//p' .env | tail -n 1)"
service_key="$(sed -n 's/^SERVICE_ROLE_KEY=//p' .env | tail -n 1)"
curl --fail --silent --show-error --max-time 10 -H "apikey: $anon_key" http://127.0.0.1:8001/auth/v1/health >/dev/null
curl --fail --silent --show-error --max-time 10 -H "apikey: $service_key" -H "Authorization: Bearer $service_key" http://127.0.0.1:8001/rest/v1/ >/dev/null
echo 'Local Supabase is installed and healthy on 127.0.0.1:8001.'
