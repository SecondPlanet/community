#!/usr/bin/env bash
#
# deploy/backup.sh — back up the database and the object storage of the local
# Compose stack.
#
#   bash deploy/backup.sh [backup-dir]
#
# The backup is written to <backup-dir>/<UTC timestamp>/ and contains
#   mysql.sql          a consistent dump of the database
#   objects/           a copy of the public object storage bucket
#   manifest.txt       the image digests and the schema version of the backup
#
# Restore with:
#   mysql -u <user> -p <database> < mysql.sql
#   rc mirror --overwrite objects/ local/<bucket>     (see deploy/README.md)
set -euo pipefail

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file=${ENV_FILE:-"$repo_root/.env"}
backup_root=${1:-"$repo_root/backups"}
compose_file="$repo_root/docker-compose.yml"

if [ ! -f "$env_file" ]; then
  printf 'env file not found: %s\n' "$env_file" >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || {
  printf 'docker is required\n' >&2
  exit 1
}

docker compose version >/dev/null 2>&1 || {
  printf 'docker compose v2 is required\n' >&2
  exit 1
}

compose() {
  docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

running=$(compose ps --services --status running)
for service in mysql minio; do
  if ! printf '%s\n' "$running" | grep -qx "$service"; then
    printf 'service is not running: %s (start the stack first)\n' "$service" >&2
    exit 1
  fi
done

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$backup_root/$timestamp"
mkdir -p "$target/objects"
chmod 700 "$target"

printf 'dumping the database to %s/mysql.sql\n' "$target"
compose exec -T mysql sh -ec \
  'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump --single-transaction --routines --events --triggers -u"$MYSQL_USER" "$MYSQL_DATABASE"' \
  > "$target/mysql.sql"
test -s "$target/mysql.sql"

printf 'copying the object storage bucket to %s/objects\n' "$target"
compose run --rm --no-deps -T -v "$target/objects:/backup" --entrypoint /bin/sh minio-init -ec '
  rc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
  rc mirror --overwrite "local/$MINIO_BUCKET" /backup
'

{
  printf 'created: %s\n' "$timestamp"
  printf 'compose file: %s\n' "$compose_file"
  printf 'images:\n'
  compose images --format json 2>/dev/null || compose images
} > "$target/manifest.txt"

printf '\nbackup written to %s\n' "$target"
