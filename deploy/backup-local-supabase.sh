#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly backup_dir="${LOCAL_SUPABASE_BACKUP_DIR:-/home/saipi/wixdelhivery-shared/local-supabase-backups}"
readonly stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
scratch="$(mktemp -d "$backup_dir/.pending.XXXXXX")"
trap 'rm -rf -- "$scratch"' EXIT

docker exec supabase-db pg_dumpall --username postgres --roles-only > "$scratch/roles.sql"
docker exec supabase-db pg_dump --username postgres --dbname postgres --format custom > "$scratch/database.dump"
gzip -9 "$scratch/roles.sql"
mv "$scratch" "$backup_dir/$stamp"
trap - EXIT

find "$backup_dir" -mindepth 1 -maxdepth 1 -type d -name '20????????T??????Z' -mtime +14 -print0 |
  xargs -0r rm -rf --
echo "Local Supabase backup completed: $backup_dir/$stamp"
