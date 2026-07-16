#!/usr/bin/env bash
# Aplica as SQL adaptadas (supabase/migrations) no Postgres puro.
# Uso:
#   export DATABASE_URL=postgresql://wacrm:wacrm@localhost:5432/wacrm
#   ./scripts/apply-sql-migrations.sh
#
# Para o app WACRM atual, o caminho recomendado continua sendo:
#   npx prisma migrate deploy

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/supabase/migrations"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f "$ROOT/.env" ]]; then
    # shellcheck disable=SC1091
    set -a
    # load only DATABASE_URL line safely
    DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | head -1 | cut -d= -f2-)"
    set +a
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

echo "Aplicando migrations em: $DIR"
echo "Database: $DATABASE_URL"

for f in $(ls -1 "$DIR"/*.sql | sort); do
  echo "→ $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "OK — SQL migrations aplicadas."
