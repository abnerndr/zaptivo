-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "type_id" UUID;

-- CreateTable
CREATE TABLE "contact_types" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_types_account_id_idx" ON "contact_types"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_types_account_id_name_key" ON "contact_types"("account_id", "name");

-- CreateIndex
CREATE INDEX "contacts_account_id_type_id_idx" ON "contacts"("account_id", "type_id");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "contact_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_types" ADD CONSTRAINT "contact_types_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

