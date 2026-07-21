-- ADAPTED FOR PLAIN POSTGRESQL (no Supabase auth/storage/RLS)
-- Source: docs/legacy/supabase-migrations/034_fix_profiles_update_rls.sql
-- Prefer app schema via: npx prisma migrate deploy
--
-- No-op: proteção de account_role/account_id era via RLS/trigger Supabase.
-- App Auth.js + Prisma controla esses campos no servidor.

SELECT 1;
