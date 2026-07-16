-- ADAPTED FOR PLAIN POSTGRESQL (no Supabase auth/storage/RLS)
-- Source: docs/legacy/supabase-migrations/026_api_keys.sql
-- Prefer app schema via: npx prisma migrate deploy

-- ============================================================
-- 026_api_keys.sql — Public API credentials (groundwork)
--
-- Adds the `api_keys` table backing the public REST API
-- (`/api/v1/*`). A key authenticates a *machine* caller (a script,
-- an n8n/Zapier-style automation, a cron) against one account, the
-- same way the cookie session authenticates a *human* in the
-- dashboard.
--
-- Design notes
--   - Account-scoped, never user-scoped. A key belongs to the
--     account; `created_by` only records who minted it (audit), and
--     is ON DELETE SET NULL so removing a teammate doesn't cascade-
--     delete the keys their automations still depend on.
--   - We store only the SHA-256 *hash* of the key, never plaintext.
--     A leaked DB snapshot (backup, log, support export) therefore
--     can't be replayed against the API — the caller would need the
--     original key, which is returned exactly once at creation. Same
--     pattern as `account_invitations.token_hash` (migration 017/019).
--   - `key_prefix` is a short, non-secret display string
--     (`wacrm_live_a1b2c3d4`) so the dashboard can show "which key
--     is this" in a list without ever resurfacing the secret.
--   - Authorization is by `scopes[]` (scopes-only model), resolved
--     in the application layer (`src/lib/api-keys/scopes.ts`). The
--     DB doesn't constrain the scope vocabulary — a future scope is
--     a code change, not a migration.
--
-- RLS
--   `api_keys` is a settings-class table: any member may *read* the
--   roster of keys for their account; only admin+ may create/revoke
--   (mirrors the `tags` / `custom_fields` policies in 017). The
--   public-API auth path itself reads keys with the service-role
--   client (RLS-bypassing) because an API caller has no Supabase
--   session and therefore no `NULL /* was auth.uid() — enforce in app */` for a policy to match.
--
-- Idempotent — safe to run multiple times. Table uses IF NOT
-- EXISTS; policies are dropped before recreate (Postgres has no
-- -- [removed] CREATE POLICY


-- account_id: every "list this account's keys" query filters on it.
CREATE INDEX IF NOT EXISTS api_keys_account_id_idx ON api_keys (account_id);
-- key_hash: the hot path is the per-request auth lookup by hash. The
-- UNIQUE constraint already creates an index, but spell it out so the
-- intent (this is the lookup key) is documented and survives a future
-- drop of the UNIQUE constraint.
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys (key_hash);
-- [removed] ENABLE ROW LEVEL SECURITY

-- SELECT: any member of the account (viewer+) can see the roster.
-- key_hash is in the table but the dashboard never selects it.

-- [removed] CREATE POLICY


-- INSERT / UPDATE / DELETE: admin+ only (settings-class). Revoking a
-- key is an UPDATE that sets `revoked_at`; we keep DELETE available
-- too for operators who'd rather hard-delete.

-- [removed] CREATE POLICY


-- [removed] CREATE POLICY


-- [removed] CREATE POLICY

