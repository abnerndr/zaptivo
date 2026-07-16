# Migrations SQL (PostgreSQL puro)

As migrations deste diretório foram **adaptadas** a partir do Supabase legado:

| Removido / trocado | Motivo |
|--------------------|--------|
| `auth.users` → `users` | Auth.js + Prisma |
| `auth.uid()`, RLS, `CREATE POLICY` | Autorização na aplicação |
| `storage.*` buckets | Cloudflare R2 |
| Grants `authenticated` / `service_role` | Roles do Supabase |

Originais: `docs/legacy/supabase-migrations/`

## Como aplicar depois (psql)

```bash
# Postgres no ar (docker compose up -d)
export DATABASE_URL=postgresql://wacrm:wacrm@localhost:5432/wacrm
chmod +x scripts/apply-sql-migrations.sh
./scripts/apply-sql-migrations.sh
```

Ou:

```bash
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```

## Preferência do app atual

O schema **canônico** do WACRM pós-migração é o **Prisma**:

```bash
npx prisma migrate deploy
npx prisma generate
```

Use as SQL deste pasta se quiser inspecionar/aplicar o histórico legado adaptado.  
Não misture à toa com `prisma migrate` no mesmo banco sem conferir colunas (ex.: `whatsapp_config` legado Meta vs `waha_session` WAHA).
