CREATE INDEX CONCURRENTLY "conversations_account_id_last_message_at_id_idx" ON "conversations"("account_id", "last_message_at", "id");
