#!/usr/bin/env bash
# Apply the committed application migrations to a fresh local Supabase database.
set -Eeuo pipefail
umask 077

readonly install_dir="${LOCAL_SUPABASE_DIR:-/home/saipi/hmt-local-supabase}"
readonly source_dir="${HMT_RELEASE_DIR:-/home/saipi/wixdelhivery}"
readonly marker="$install_dir/.hmt-schema-applied"

[[ -f "$install_dir/.env" ]]
[[ -d "$source_dir/supabase/migrations" ]]
[[ ! -e "$marker" ]] || { echo 'Application schema is already marked as applied.' >&2; exit 1; }

mapfile -t migrations < <(find "$source_dir/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -print | sort)
[[ "${#migrations[@]}" -gt 0 ]]

for migration in "${migrations[@]}"; do
  echo "Applying $(basename "$migration")"
  docker exec -i supabase-db psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 < "$migration"
done

printf 'release=%s\napplied_at=%s\n' \
  "$(cat "$source_dir/.release-sha" 2>/dev/null || echo unknown)" \
  "$(date --iso-8601=seconds)" > "$marker"
echo 'Local Supabase application schema applied.'
