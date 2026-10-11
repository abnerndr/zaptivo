-- CreateTable
CREATE TABLE "template_dispatches" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "run_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_dispatch_recipients" (
    "id" UUID NOT NULL,
    "dispatch_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,

    CONSTRAINT "template_dispatch_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "template_dispatches_status_run_at_idx" ON "template_dispatches"("status", "run_at");

-- CreateIndex
CREATE UNIQUE INDEX "template_dispatch_recipients_dispatch_id_contact_id_key" ON "template_dispatch_recipients"("dispatch_id", "contact_id");

-- AddForeignKey
ALTER TABLE "template_dispatches" ADD CONSTRAINT "template_dispatches_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_dispatches" ADD CONSTRAINT "template_dispatches_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_dispatch_recipients" ADD CONSTRAINT "template_dispatch_recipients_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "template_dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_dispatch_recipients" ADD CONSTRAINT "template_dispatch_recipients_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

