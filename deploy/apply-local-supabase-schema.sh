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

docker exec -i supabase-db psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 <<'SQL'
create table if not exists public.hmt_schema_migrations (
  name text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);
alter table public.hmt_schema_migrations enable row level security;
revoke all on public.hmt_schema_migrations from anon, authenticated;
SQL

for migration in "${migrations[@]}"; do
  name="$(basename "$migration")"
  [[ "$name" =~ ^[A-Za-z0-9_.-]+$ ]]
  checksum="$(sha256sum "$migration" | cut -d' ' -f1)"
  recorded="$(docker exec supabase-db psql --username postgres --dbname postgres --tuples-only --no-align --command "select checksum from public.hmt_schema_migrations where name = '$name'")"
  if [[ -n "$recorded" ]]; then
    [[ "$recorded" == "$checksum" ]] || { echo "Checksum changed for applied migration: $name" >&2; exit 1; }
    echo "Already applied $name"
    continue
  fi

  echo "Applying $name"
  # Supabase applies each migration file atomically. Preserve that behavior;
  # several committed migrations use transaction-scoped temporary tables.
  {
    cat "$migration"
    printf "\ninsert into public.hmt_schema_migrations(name, checksum) values ('%s', '%s');\n" "$name" "$checksum"
  } | docker exec -i supabase-db psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 --single-transaction
done

printf 'release=%s\napplied_at=%s\n' \
  "$(cat "$source_dir/.release-sha" 2>/dev/null || echo unknown)" \
  "$(date --iso-8601=seconds)" > "$marker"
echo 'Local Supabase application schema applied.'
