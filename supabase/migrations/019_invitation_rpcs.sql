-- ADAPTED FOR PLAIN POSTGRESQL (no Supabase auth/storage/RLS)
-- Source: docs/legacy/supabase-migrations/019_invitation_rpcs.sql
-- Prefer app schema via: npx prisma migrate deploy
--
-- No-op: peek/redeem invitation RPCs dependiam de auth.uid() + RLS.
-- Convites ficam no app (Auth.js + Prisma).

SELECT 1;
