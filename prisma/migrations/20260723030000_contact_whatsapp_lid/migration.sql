-- AlterTable
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "whatsapp_lid" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contacts_account_id_whatsapp_lid_idx" ON "contacts"("account_id", "whatsapp_lid");
