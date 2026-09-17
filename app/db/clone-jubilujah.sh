#!/usr/bin/env bash
# ============================================================================
# Clone the `jubilujah` PostgreSQL database — schema AND data — into a new
# `jubileepraise` database owned by its own role, then apply the JubileePraise
# data migration (0035) so the copy carries the new brand.
#
# Owner direction, 2026-09-17: "Clone the database schema and data from
# Jubilujah DB. Create new database tables/references to fit JubileePraise.
# Connect this new database to the provided codebase."
#
#   sudo -u postgres bash db/clone-jubilujah.sh --password '<strong>'      # on the VPS
#   PGSUPER=postgres://postgres:<pw>@localhost:5432/postgres \
#       bash db/clone-jubilujah.sh --password '<dev>'                     # workstation
#
# Options
#   --from <db>        source database          (default jubilujah)
#   --to <db>          new database             (default jubileepraise)
#   --role <role>      owner/login role for it  (default jubileepraise_app)
#   --password <pw>    password for that role   (required unless the role exists)
#   --migrate <file>   migration file(s) under db/migrations to apply after the
#                      restore, recorded in public._migrations
#                                              (default 0035_jubileepraise_rebrand.sql)
#   --force            drop an existing target database first (DESTRUCTIVE)
#   --dry-run          print the plan, touch nothing
#
# How the copy is made
#   pg_dump -Fc (a consistent snapshot; the source keeps serving) piped into
#   pg_restore --role=<new role>, so EVERY object in the new database is owned by
#   the new role. That also retires the landmine PUBLISH.md records for the old
#   database (jubilujah_app owned only some tables, so ALTERs needed the
#   superuser). Extensions are created first as the superuser.
#
# Connection: uses $PGSUPER (a superuser URL) when set; otherwise the libpq
# defaults, which is what `sudo -u postgres` gives on the VPS (peer auth).
# Idempotent for the role and for --migrate; the database itself is created
# once and refused thereafter unless --force.
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FROM=jubilujah
TO=jubileepraise
ROLE=jubileepraise_app
PASSWORD=""
FORCE=0
DRY=0
MIGRATE=()

while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM="$2"; shift 2 ;;
    --to) TO="$2"; shift 2 ;;
    --role) ROLE="$2"; shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    --migrate) MIGRATE+=("$2"); shift 2 ;;
    --force) FORCE=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[ ${#MIGRATE[@]} -eq 0 ] && MIGRATE=(0035_jubileepraise_rebrand.sql)

for f in "${MIGRATE[@]}"; do
  [ -f "$HERE/migrations/$f" ] || { echo "migration not found: $HERE/migrations/$f" >&2; exit 2; }
done
for tool in psql pg_dump pg_restore; do
  command -v "$tool" >/dev/null || { echo "$tool not on PATH" >&2; exit 2; }
done

# psql against the maintenance DB / a named DB, as the superuser.
PSQL_BASE=(psql -v ON_ERROR_STOP=1 -X -q -A -t)
if [ -n "${PGSUPER:-}" ]; then
  su_psql()  { "${PSQL_BASE[@]}" "${PGSUPER}" "$@"; }
  db_psql()  { "${PSQL_BASE[@]}" "${PGSUPER%/*}/$1" "${@:2}"; }
  DUMP_URL="${PGSUPER%/*}/$FROM"
  RESTORE_URL="${PGSUPER%/*}/$TO"
else
  su_psql()  { "${PSQL_BASE[@]}" -d postgres "$@"; }
  db_psql()  { "${PSQL_BASE[@]}" -d "$1" "${@:2}"; }
  DUMP_URL="$FROM"
  RESTORE_URL="$TO"
fi

sql_lit() { printf "%s" "$1" | sed "s/'/''/g"; }   # single-quote escape

echo "== clone $FROM -> $TO (owner $ROLE) =="
su_psql -c "SELECT 'server ' || version()" | head -1

src_exists=$(su_psql -c "SELECT 1 FROM pg_database WHERE datname = '$(sql_lit "$FROM")'")
[ "$src_exists" = "1" ] || { echo "source database '$FROM' does not exist" >&2; exit 1; }
src_size=$(su_psql -c "SELECT pg_size_pretty(pg_database_size('$(sql_lit "$FROM")'))")
echo "source  : $FROM ($src_size)"

role_exists=$(su_psql -c "SELECT 1 FROM pg_roles WHERE rolname = '$(sql_lit "$ROLE")'")
tgt_exists=$(su_psql -c "SELECT 1 FROM pg_database WHERE datname = '$(sql_lit "$TO")'")
# An existing target with NO tables (e.g. the shell left by an earlier failed
# restore) is reused as-is; one with tables is refused unless --force.
tgt_empty=0
if [ "$tgt_exists" = "1" ]; then
  tgt_tables=$(db_psql "$TO" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')")
  [ "$tgt_tables" = "0" ] && tgt_empty=1
fi
echo "role    : $ROLE $([ "$role_exists" = 1 ] && echo '(exists)' || echo '(will be created)')"
echo "target  : $TO $([ "$tgt_exists" = 1 ] && { [ "$tgt_empty" = 1 ] && echo '(exists, EMPTY — will be reused)' || echo '(EXISTS, has tables)'; } || echo '(will be created)')"
echo "migrate : ${MIGRATE[*]}"

if [ "$tgt_exists" = "1" ] && [ "$tgt_empty" != "1" ] && [ "$FORCE" != "1" ]; then
  echo "target database '$TO' already exists and has tables — refusing to touch it (use --force to DROP and re-clone)" >&2
  exit 1
fi
if [ "$role_exists" != "1" ] && [ -z "$PASSWORD" ]; then
  echo "--password is required to create role '$ROLE'" >&2
  exit 2
fi
[ "$DRY" = "1" ] && { echo "(dry run — nothing done)"; exit 0; }

# 1. Role (password only set on creation; an existing role is left alone).
if [ "$role_exists" != "1" ]; then
  su_psql -c "CREATE ROLE \"$ROLE\" LOGIN PASSWORD '$(sql_lit "$PASSWORD")'"
  echo "created role $ROLE"
fi

# 2. Database.
if [ "$tgt_exists" = "1" ] && [ "$tgt_empty" = "1" ]; then
  echo "reusing empty database $TO"
  # A failed earlier restore may have left table-less schemas behind; clear them
  # so the restore's CREATE SCHEMA statements succeed. (Verified table-less above.)
  while IFS='|' read -r ns; do
    [ -n "$ns" ] || continue
    db_psql "$TO" -c "DROP SCHEMA IF EXISTS \"$ns\" CASCADE"
    echo "dropped empty schema $ns"
  done < <(db_psql "$TO" -c "SELECT nspname FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg\_%'")
else
  if [ "$tgt_exists" = "1" ]; then
    echo "DROPPING existing $TO (--force)"
    su_psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$(sql_lit "$TO")' AND pid <> pg_backend_pid()" >/dev/null
    su_psql -c "DROP DATABASE \"$TO\""
  fi
  su_psql -c "CREATE DATABASE \"$TO\" OWNER \"$ROLE\" TEMPLATE template0 ENCODING 'UTF8'"
  echo "created database $TO"
fi

# 3. Extensions first, as the superuser (pg_restore runs SET ROLE $ROLE).
while IFS='|' read -r ext; do
  [ -n "$ext" ] || continue
  [ "$ext" = "plpgsql" ] && continue
  db_psql "$TO" -c "CREATE EXTENSION IF NOT EXISTS \"$ext\""
  echo "extension $ext"
done < <(db_psql "$FROM" -c "SELECT extname FROM pg_extension")

# 4. Schema + data. --no-owner/--no-acl + --role: everything lands owned by $ROLE.
# The extensions were created by the superuser in step 3, so their COMMENT
# entries would fail under SET ROLE ("must be owner of extension"); the TOC
# list drops exactly those entries and nothing else.
DUMP="$(mktemp -t "clone-$FROM.XXXXXX.dump")"
trap 'rm -f "$DUMP" "$DUMP.toc"' EXIT
echo "dumping $FROM ..."
pg_dump -Fc --no-owner --no-acl -f "$DUMP" "$DUMP_URL"
pg_restore -l "$DUMP" | grep -v ' COMMENT - EXTENSION ' > "$DUMP.toc"
echo "restoring into $TO ($(du -h "$DUMP" | cut -f1) dump, $(grep -c '^[0-9]' "$DUMP.toc") TOC entries) ..."
pg_restore --no-owner --no-acl --role="$ROLE" --exit-on-error -L "$DUMP.toc" -d "$RESTORE_URL" "$DUMP"
echo "restore complete"

# 5. Post-restore migrations, recorded the way db/run-migrations.js records them.
db_psql "$TO" -c "CREATE TABLE IF NOT EXISTS public._migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
for f in "${MIGRATE[@]}"; do
  key="migrations/$f"
  done_already=$(db_psql "$TO" -c "SELECT 1 FROM public._migrations WHERE name = '$(sql_lit "$key")'")
  if [ "$done_already" = "1" ]; then echo "skip   $key (already applied)"; continue; fi
  echo "apply  $key"
  db_psql "$TO" -1 -f "$HERE/migrations/$f" \
    -c "INSERT INTO public._migrations (name) VALUES ('$(sql_lit "$key")')"
done

su_psql -c "COMMENT ON DATABASE \"$TO\" IS 'JubileePraise.com — cloned from $(sql_lit "$FROM") on $(date -u +%Y-%m-%dT%H:%MZ) by db/clone-jubilujah.sh; brand data rewritten by 0035.'"

# 6. Verify: same tables, same row counts on the tables that matter.
echo "== verify =="
counts() {
  db_psql "$1" -c "
    SELECT 'tables=' || count(*) FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_type = 'BASE TABLE'
    UNION ALL SELECT 'users=' || count(*) FROM identity.users
    UNION ALL SELECT 'credentials=' || count(*) FROM identity.credentials
    UNION ALL SELECT 'albums=' || count(*) FROM catalog.albums
    UNION ALL SELECT 'songs=' || count(*) FROM catalog.songs
    UNION ALL SELECT 'redirector_tokens=' || count(*) FROM redirector.tokens
    UNION ALL SELECT 'subscriptions=' || count(*) FROM production.subscriptions" | tr '\n' ' '
}
echo "$FROM : $(counts "$FROM")"
echo "$TO : $(counts "$TO")"
echo "$TO owner check: $(db_psql "$TO" -c "SELECT count(*) || ' tables owned by ' || '$(sql_lit "$ROLE")' FROM pg_tables t JOIN pg_roles r ON r.rolname = t.tableowner WHERE r.rolname = '$(sql_lit "$ROLE")' AND schemaname NOT IN ('pg_catalog','information_schema')")"
echo "$TO brand residue: $(db_psql "$TO" -c "SELECT count(*) || ' users still tagged jubilujah|' FROM identity.users WHERE external_subject LIKE 'jubilujah|%'")"
echo
echo "DATABASE_URL=postgres://$ROLE:<password>@localhost:5432/$TO"
echo "done."
