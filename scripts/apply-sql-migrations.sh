#!/usr/bin/env bash
# LEGADO — NÃO use no app WACRM atual (Prisma + WAHA).
#
# Estas SQLs são do schema Supabase/Meta e CORROMPEM o banco Prisma
# (ex.: esperam whatsapp_config.phone_number_id; o app usa waha_session).
#
# Caminho correto:
#   npx prisma migrate deploy
#
# Só rode se souber o que está fazendo:
#   ALLOW_LEGACY_SQL_MIGRATIONS=1 ./scripts/apply-sql-migrations.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/supabase/migrations"

if [[ "${ALLOW_LEGACY_SQL_MIGRATIONS:-}" != "1" ]]; then
  cat >&2 <<'EOF'
ERRO: db:migrate:sql está bloqueado.

O schema canônico do app é Prisma (WAHA). As migrations em
supabase/migrations são legado Supabase/Meta e quebram o banco
(ex.: phone_number_id vs waha_session).

Use:
  npx prisma migrate deploy

Se realmente precisar do SQL legado (banco vazio só para referência):
  ALLOW_LEGACY_SQL_MIGRATIONS=1 yarn db:migrate:sql
EOF
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f "$ROOT/.env" ]]; then
    DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | head -1 | cut -d= -f2-)"
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL não definido (.env ou export)" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql não encontrado. Instale o client PostgreSQL." >&2
  exit 1
fi

echo "AVISO: aplicando SQL LEGADO em: $DIR" >&2
echo "Database: $DATABASE_URL"

for f in $(ls -1 "$DIR"/*.sql | sort); do
  echo "→ $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "OK — SQL migrations aplicadas."
