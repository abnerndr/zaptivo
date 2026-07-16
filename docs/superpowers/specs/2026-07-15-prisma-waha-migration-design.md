# Design: Postgres/Prisma + Auth.js + R2 + SSE + WAHA

**Date:** 2026-07-15  
**Status:** Approved (design sections §1–§5)  
**Scope:** Replace Supabase + Meta WhatsApp Cloud API while preserving CRM functionality.

---

## Goals

1. **Database:** PostgreSQL managed with **Prisma** (no Supabase PostgREST/RLS).
2. **Auth:** **Auth.js** with database sessions; login **CPF + password**; email optional.
3. **Storage:** **Cloudflare R2** (S3-compatible) instead of Supabase Storage.
4. **Realtime:** **SSE + Postgres LISTEN/NOTIFY** instead of Supabase Realtime.
5. **WhatsApp:** **WAHA** HTTP API instead of Meta Cloud API; keep templates/broadcasts/flows/automations adapted.

**Non-goals (this wave):** Migrating live production data from an existing Supabase project (greenfield / local reset). Dual Meta+WAHA feature flags.

---

## Decisions locked

| Topic | Choice |
|-------|--------|
| Auth | Auth.js, session in Postgres via Prisma Adapter |
| Login | CPF + password; email optional (recovery/invites) |
| ORM / DB | Prisma → PostgreSQL |
| Storage | Cloudflare R2 |
| Realtime | SSE + `LISTEN/NOTIFY` |
| WhatsApp | WAHA; 1 session per account |
| Templates/broadcasts | Keep UI; no Meta approval; local templates → WAHA send |
| Migration style | Strangler by layers (not big bang) |

---

## §1 Target architecture

```
Next.js App
├── Auth.js (Credentials: CPF + senha)
│     └── Prisma Adapter → Session / User / Account (OAuth tables)
├── Prisma Client → PostgreSQL (domain + auth)
├── Storage adapter → Cloudflare R2
│     └── prefixes: avatars/, chat-media/, flow-media/
├── Realtime → GET /api/realtime/stream (SSE)
│     └── Postgres NOTIFY channels account:{accountId}
└── WhatsApp adapter → WAHA
      ├── 1 waha_session per CRM account
      ├── webhook → POST /api/whatsapp/webhook
      └── sendText / sendMedia / … (templates = rendered free-form)
```

**Internal contracts to preserve:**
- `sendMessageToConversation` and flow/automation send helpers
- Multi-tenant `account_id` isolation (app-layer authz replaces RLS)
- Public API `/api/v1` with API keys

**Remove:** Supabase clients, Meta Graph client, RLS-dependent assumptions, `META_APP_*`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## §2 Auth.js + Prisma

### Login model

- **CPF:** stored as digits-only string, `@unique`; validated with check digits on signup/login.
- **Password:** hashed (bcrypt or argon2) in `User.passwordHash`.
- **Email:** optional `String?` `@unique` when present — password recovery + invitation emails.

### Auth.js tables (Prisma Adapter)

Standard: `User`, `Account`, `Session`, `VerificationToken`.

### Extra `User` fields

- `cpf`, `email?`, `passwordHash`, `name`, `image`, timestamps.

### Bootstrap (replaces `handle_new_user` trigger)

On signup, single Prisma transaction:

1. Create `User`
2. Create `Profile` (app profile row if kept separate, or fold into User)
3. Create tenant `Account` + membership `owner`

### Session & middleware

- Strategy: **database** sessions.
- Next.js middleware validates Auth.js session (replaces Supabase cookie refresh).
- Client hooks migrate from `useAuth` + Supabase to Auth.js `useSession` (or thin wrapper keeping existing shape).

### Authorization

- No Postgres RLS.
- Server helpers: `requireSession()`, `requireAccountMember(accountId, minRole)`.
- Former RPCs (`is_account_member`, invite redeem, role changes, transfer ownership, presence touch, counters, AI slot claim, knowledge match) become TypeScript + Prisma (raw SQL only where FTS/pgvector needs it).

### Invitations

- Token-based join flow kept.
- Email on invite optional when invitee has no email.

---

## §3 Storage (R2) + Realtime (SSE)

### R2

- Single adapter under `src/lib/storage/`: `upload`, `remove`, `publicUrl`.
- SDK: `@aws-sdk/client-s3` against R2 endpoint.
- Key prefixes:
  - `avatars/{userId}/…`
  - `chat-media/{accountId}/…`
  - `flow-media/{accountId}/…`
- Public URLs via `R2_PUBLIC_URL` (WAHA and clients fetch without auth).
- Authenticated upload API routes write to R2 then persist URL in DB.

### Realtime

- After critical writes (or via triggers), `pg_notify('account:{accountId}', payload)` with minimal JSON: `{ table, op, id, accountId }`.
- `GET /api/realtime/stream`: SSE, Auth.js session, membership-scoped.
- Client hooks (`use-realtime`, unread, presence, notifications) switch from Supabase channels to `EventSource`.
- Presence: HTTP heartbeat → update `member_presence` → NOTIFY.
- Deploy note: needs Node long-lived connection (not Edge-only). Optional phase-2 polling fallback if SSE drops.

---

## §4 WAHA WhatsApp

Reference: [WAHA + JS/TS](https://waha.devlike.pro/docs/integrations/javascript/)

### Transport

- Replace `meta-api.ts` with `waha-api.ts`.
- Keep `send-message.ts`, `broadcast-core.ts`, flow/automation `*-send` modules calling the new transport.

### Per-account config (`whatsapp_config`)

| Field | Notes |
|-------|--------|
| `waha_session` | Unique globally; WAHA session name |
| `status` | Mirror WAHA: STOPPED, STARTING, SCAN_QR_CODE, WORKING, FAILED |
| QR UX | Authenticated proxy to WAHA QR endpoint |

Remove Meta-specific: `phone_number_id`, register/subscribe WABA, Meta tokens per account (global `WAHA_API_KEY` instead).

### Global env for WAHA

- `WAHA_BASE_URL`, `WAHA_API_KEY`, `WAHA_WEBHOOK_SECRET`

### Send

- Text: `POST /api/sendText` `{ session, chatId, text }`
- Media: WAHA send image/file/voice with public R2 URLs
- `chatId`: `{e164}@c.us` using existing phone utils
- Interactive: map when engine supports; else degrade to structured text + clear log

### Webhook

- WAHA → `POST /api/whatsapp/webhook`
- Auth via `WAHA_WEBHOOK_SECRET` (replaces Meta HMAC)
- Handle `message`, `message.ack`, `session.status` (+ reactions if available)
- Same fan-out: persist → flows → automations → AI → outbound webhooks

### Templates & broadcasts

- UI kept
- No Meta submit/sync/approval — **local templates** with `{{n}}` variables
- Broadcast renders per recipient and sends via WAHA
- Delivery via `message.ack` → `messages` / `broadcast_recipients`
- CI dry-run flag: `WAHA_TEMPLATES_DRY_RUN` (renamed from Meta flag)

### Settings UI

- Session name, status, QR, start/stop, suggested webhook URL

---

## §5 Environment & implementation order

### New env (example)

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_LOCALE=pt-BR
AUTH_SECRET=
ENCRYPTION_KEY=

DATABASE_URL=postgresql://user:pass@localhost:5432/wacrm

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=wacrm
R2_PUBLIC_URL=https://cdn.example.com

WAHA_BASE_URL=http://localhost:3000
WAHA_API_KEY=
WAHA_WEBHOOK_SECRET=

# Optional
# AUTOMATION_CRON_SECRET=
# AI_REQUEST_TIMEOUT_MS=
# AI_CONTEXT_MESSAGE_LIMIT=
# ALLOWED_INVITE_HOSTS=
# WAHA_TEMPLATES_DRY_RUN=true
```

### Remove

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `META_APP_SECRET`, `META_APP_ID`, `WHATSAPP_TEMPLATES_DRY_RUN` (replaced)

### Deliverables for local run

- Update `.env.local.example`
- Create `.env.local` with placeholders / generated secrets (`AUTH_SECRET`, `ENCRYPTION_KEY`, `WAHA_WEBHOOK_SECRET`)

### Strangler order

1. Prisma schema (domain + Auth.js) + migrate + generate
2. Auth.js (CPF/password) + middleware + auth pages
3. Data access rewrite (Supabase → Prisma) + app-layer authz
4. R2 storage adapter
5. Realtime SSE + NOTIFY + hooks
6. WAHA adapter + webhook + Settings/QR
7. Local templates/broadcasts + remove Meta/Supabase code
8. Env files + smoke checklist

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| ~100+ Supabase call sites | Strangler; thin `db` helpers; migrate by domain |
| Interactive messages differ on WAHA engines | Capability check + text fallback |
| SSE on serverless | Document Node runtime; dedicated notify connection |
| CPF uniqueness / formatting | Normalize to digits; validate check digits |
| Ban risk (unofficial WAHA) | Out of product scope; document operational warning in Settings |

---

## Success criteria

- [ ] App boots with only new env vars (no Supabase/Meta)
- [ ] Signup/login with CPF + password; optional email
- [ ] CRUD CRM (contacts, inbox, pipelines) via Prisma
- [ ] Upload avatar/chat media to R2 with public URL
- [ ] Inbox updates via SSE without refresh
- [ ] WAHA session per account: QR → WORKING → send/receive text
- [ ] Broadcast/template send works as local → WAHA
- [ ] Flows/automations still dispatch outbound messages

---

## Spec self-review

- No TBD placeholders left for core decisions.
- Auth, storage, realtime, WAHA aligned with §1 architecture.
- Scope is large but ordered; implementation plan should be phased (one PR/layer).
- Explicit: greenfield DB (no Supabase data migration in this wave).
- Ambiguity resolved: one WAHA session per account; templates local; email optional.
