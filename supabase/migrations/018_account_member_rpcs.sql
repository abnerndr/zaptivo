-- ADAPTED FOR PLAIN POSTGRESQL (no Supabase auth/storage/RLS)
-- Source: docs/legacy/supabase-migrations/018_account_member_rpcs.sql
-- Prefer app schema via: npx prisma migrate deploy
--
-- No-op: RPCs usavam auth.uid() / SECURITY DEFINER do Supabase.
-- Membership e roles ficam no app (Auth.js + Prisma).

SELECT 1;
