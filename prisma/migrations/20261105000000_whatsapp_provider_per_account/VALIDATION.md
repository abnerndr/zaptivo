# Validate on an isolated database copy

Use PostgreSQL 11 or later. Restore a recent backup into an isolated database,
including `_prisma_migrations`; never point these commands at production. Give
the copy its own `DATABASE_URL` and block its access to external providers. Use
the same `ENCRYPTION_KEY` as the source only when checking credentials, and do
not print keys, ciphertext, or plaintext. Confirm that the copy is at the
previous migration and record the number of rows in `whatsapp_config`.

Run `pnpm exec prisma migrate deploy` against the copy and then
`pnpm exec prisma migrate status`. Verify the original count is unchanged and:

```sql
SELECT count(*) AS invalid_rows FROM whatsapp_config
WHERE provider <> 'EVOLUTION' OR provider IS NULL
   OR provider_session_id IS NOT NULL OR encrypted_credential IS NOT NULL;
SELECT indexrelid::regclass, indisvalid FROM pg_index
WHERE indexrelid IN (
  'whatsapp_config_provider_provider_session_id_idx'::regclass,
  'conversations_account_id_last_message_at_id_idx'::regclass,
  'messages_conversation_id_created_at_id_idx'::regclass
);
```

Expect zero invalid rows and three valid indexes. Check an existing account's
session, messages and conversations are unchanged, then exercise a new WUZAPI
row and the server-only credential helper with a disposable credential; confirm
the stored value differs from plaintext and round-trips before deleting it.
Check cursor queries use `(account_id, last_message_at, id)` and
`(conversation_id, created_at, id)` with deterministic tie-breaks. This schema
does not itself implement pagination or migrate a provider connection.

Each of the three following migrations contains one `CREATE INDEX CONCURRENTLY`
statement so Prisma can run it outside a transaction. If one fails, it can
leave an invalid index and Prisma marks that migration failed. On the copy,
inspect `pg_index`, then restore the copy and retry to test a clean deployment.
For a live failure, inspect which migration failed and follow Prisma's
failed-migration recovery procedure; remove any invalid index with
`DROP INDEX CONCURRENTLY` before retrying that migration. Do not blindly rerun the whole
sequence. Account for the brief `ALTER TABLE` lock and schedule the change
according to the table's traffic and lock budget.
