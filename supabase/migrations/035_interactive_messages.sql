-- ADAPTED FOR PLAIN POSTGRESQL (no Supabase auth/storage/RLS)
-- Source: docs/legacy/supabase-migrations/035_interactive_messages.sql
-- Prefer app schema via: npx prisma migrate deploy

-- ============================================================
-- 035_interactive_messages.sql
--
-- Full support for WhatsApp interactive messages (reply buttons +
-- list messages) beyond the Flows subsystem.
--
--   1. messages.interactive_payload — the structured payload of an
--      OUTBOUND interactive message (buttons / list) so it round-trips:
--      the thread can re-render the buttons/rows we sent, not just the
--      body text. Migration 010 already added 'interactive' to the
--      content_type CHECK and the inbound `interactive_reply_id`
--      column, so no CHECK change is needed here.
--
--   2. quick_replies — reusable snippets (plain text OR a saved
--      interactive message) an agent can insert from the inbox
--      composer. Account-scoped, same tenancy model as automations.
-- ============================================================

-- 1. Outbound interactive payload -----------------------------
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS interactive_payload JSONB;

-- 2. Quick replies --------------------------------------------
CREATE TABLE IF NOT EXISTS quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Tenancy. Every member of the account shares its quick replies.
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Author / audit only — never used for tenancy isolation.
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  -- 'text' snippets carry `content_text`; 'interactive' snippets carry
  -- `interactive_payload` (validated app-side against Meta's limits).
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'interactive')),
  content_text TEXT,
  interactive_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_account ON quick_replies(account_id);
-- [removed] ENABLE ROW LEVEL SECURITY

-- Account-scoped policies mirroring automations (see 017): any member
-- can read; agent+ can create / edit / delete.




-- [removed] CREATE POLICY

-- [removed] CREATE POLICY

-- [removed] CREATE POLICY

-- [removed] CREATE POLICY


DROP TRIGGER IF EXISTS set_updated_at ON quick_replies;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON quick_replies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
