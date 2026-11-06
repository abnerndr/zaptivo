-- PostgreSQL 11+ adds a column with a constant default without rewriting the
-- table. Existing and concurrently inserted rows therefore read as EVOLUTION.
CREATE TYPE "WhatsappProvider" AS ENUM ('EVOLUTION', 'WUZAPI');

ALTER TABLE "whatsapp_config"
  ADD COLUMN "provider" "WhatsappProvider" NOT NULL DEFAULT 'EVOLUTION',
  ADD COLUMN "provider_session_id" TEXT,
  ADD COLUMN "encrypted_credential" TEXT;

