# CRM Tabs Functional — Design Spec

**Date:** 2026-07-29  
**Status:** Approved in conversation (pipelines → broadcasts → automations → flows)  
**Approach:** Lean UIs (lists/forms); restore Prisma session APIs in contacts style. Flows only get end-to-end runtime.

## Context

After the Prisma/WAHA migration, `/pipelines`, `/broadcasts`, `/automations`, and `/flows` are placeholder shells (“Em migração”). Schema Prisma and some components/libs remain; most page + API handlers are stubs; flow/automation engines return no-ops. Contacts/Inbox already show the target pattern: client page → `/api/*` + `requireSessionAccount` → Prisma → snake_case JSON.

## Goals

| Area | Level | Meaning |
|------|-------|---------|
| Pipelines | A | CRUD + kanban usable |
| Broadcasts | A | CRUD drafts + audience materialization; **no** WAHA send |
| Automations | A | CRUD + activate flag + templates; **no** engine on webhook |
| Flows | B | Lean editor + activate + **runtime** on inbound + cron stale |

**Implementation order:** pipelines → broadcasts → automations → flows.

## Non-goals (this cycle)

- Automations engine / Wait cron drain / Condition tree builder
- Broadcast `deliverBroadcast` / schedule cron / public `/api/v1/broadcasts` expansion
- Flows canvas (React Flow), buttons/list/collect UI, condition/set_tag editors
- AI tabs, Meta template sync

---

## Architecture

```
Dashboard pages (lean client UI)
    → Session APIs (/api/pipelines|deals|broadcasts|automations|flows)
        → requireSessionAccount()
        → Prisma (account-scoped)
        → snake_case JSON

WAHA webhook → inbound persist
    → dispatchInboundToFlows()   // only flows in this cycle
    → (automations NOT hooked)

GET /api/flows/cron (+ secret) → stale FlowRun sweep
```

Shared conventions:

- Auth: `requireSessionAccount` for dashboard APIs; flows cron authenticates with `AUTOMATION_CRON_SECRET` (already in `.env.local.example`; same secret historically reused for flow cron).
- Payload shape: snake_case field names in JSON responses (match contacts).
- Errors: `400` validation, `401/403` auth, `404` missing/wrong account, `500` unexpected; never leak other tenants’ rows.
- Deal `status` values: `active` | `won` | `lost` (align TS types with Prisma string column).

---

## 1. Pipelines

### APIs

- `GET/POST /api/pipelines` — list with stages; create with default stages (e.g. Lead / Qualified / Proposal / Won).
- `PATCH/DELETE /api/pipelines/[id]` — rename / delete (cascade stages+deals via schema).
- `GET/POST /api/deals?pipeline_id=` — list / create (contact_id, title, value, currency, stage_id, notes?, expected_close_date?).
- `PATCH/DELETE /api/deals/[id]` — move stage, edit fields, set status, delete.

### UI (`/pipelines`)

- Pipeline selector + “Novo pipeline”.
- Reuse `pipeline-board` + `deal-card`.
- Simple modal for create/edit deal (contact picker, title, value, stage).
- Skip `pipeline-analytics` and advanced stage settings UI.

### Data / edge cases

- Creating first pipeline for empty account should seed default stages.
- Moving deal: optimistic UI optional; always persist `stage_id` server-side and verify stage belongs to same pipeline + account.
- Contact must belong to same `accountId`.

---

## 2. Broadcasts

### APIs

- `GET/POST /api/broadcasts` — list / create draft.
- `GET/PATCH/DELETE /api/broadcasts/[id]` — detail (with recipient counts) / edit draft-only / delete.
- On create: resolve audience (`all` or `tagIds[]`), insert `BroadcastRecipient` rows (`pending`), set `total_recipients`.
- Send endpoint: **omit** or return `501` with clear message — not in scope.

### UI

- `/broadcasts` — table (name, template, status, recipients, dates) + Nova.
- `/broadcasts/new` — single form (not 4-step wizard): name, local template select, audience (all | tags), optional `scheduled_at` stored only.
- `/broadcasts/[id]` — summary + counts; send CTA disabled or absent (“em breve”).

### Data / edge cases

- Templates: list `MessageTemplate` rows for the account; store `template_name` + language on the broadcast. Empty list → empty-state pointing to WhatsApp settings / templates.
- Editing audience after create: only while `status === draft`; either replace recipients or forbid PATCH of audience (prefer forbid for simplicity).
- Leave `broadcast-core.deliverBroadcast` as no-op / unused.

---

## 3. Automations

### APIs

- `GET/POST /api/automations` — list / create (name, trigger_type, trigger_config, linear steps).
- `GET/PUT/DELETE /api/automations/[id]` — detail+steps / replace steps / delete.
- `POST /api/automations/[id]/duplicate` — clone inactive copy.
- Activate via PUT `is_active` + existing `validate.ts` (reject active without steps).
- `GET /api/automations/[id]/logs` — list logs (empty until engine exists).

### UI

- `/automations` — list with trigger pills (`trigger-meta`), active toggle, edit/duplicate/delete.
- `/automations/new` and `/[id]/edit` — form: pick template from `AUTOMATION_TEMPLATES` **or** manual trigger + linear steps (`send_message`, `wait` only in MVP form).
- `/automations/[id]/logs` — simple empty-capable table.

### Data / edge cases

- Steps stored as `AutomationStep` with `position`; no Condition parent/branch UI.
- Engine + cron remain stubs; toggling active only persists config for a future cycle.
- Do not call `runAutomationsForTrigger` from inbound yet.

---

## 4. Flows (end-to-end MVP)

### APIs

- `GET/POST /api/flows` — list / create (blank or `template_slug`).
- `GET/PUT/DELETE /api/flows/[id]` — detail+nodes / save / delete.
- `POST /api/flows/[id]/activate` — run validate subset → `status=active` (deactivate → draft/archived as today).
- `GET /api/flows/[id]/runs` — runs + events.
- `GET /api/flows/templates` — from `lib/flows/templates.ts`.
- `GET /api/flows/cron` — secret-guarded; mark active runs past `fallback_policy.on_timeout_hours` as timed out.

### Engine (`lib/flows/engine.ts`)

Reimplement enough to satisfy `engine.test.ts` helpers and runtime:

- `matchesKeywordTrigger`, `matchReplyId`, `isAutoAdvancing`, `isSuspending`, `isTerminal`, condition helper if tests require.
- `dispatchInboundToFlows(accountId, { contactId, conversationId, text, … })` after successful inbound persist.
- Start path: match `status=active` flows by trigger (`keyword` / `first_inbound_message`); create `FlowRun`; `advanceFlow` auto-walks `start` → `send_message` (via `engineSendText`) → `end`.
- If graph contains suspending nodes: minimal behavior (suspend run waiting for reply, or end/handoff) — UI will not author these in MVP.
- Persist `FlowRunEvent` for advances/sends/errors; bump `execution_count` / `last_executed_at` on flow.

### UI (lean, no canvas)

- `/flows` — list + status + Novo (blank or template).
- `/flows/[id]` — linear editor: trigger keywords / first_inbound; ordered `send_message` steps; implicit start/end on save; Save + Activate.
- `/flows/[id]/runs` — runs table.

### Data / edge cases

- One active run per contact+flow (or conversation): if already active, either advance on reply or ignore new keyword start — prefer: if active run exists for contact on that flow, do not start duplicate; if suspending, try `matchReplyId` / collect; else ignore.
- Rate-limit: reuse existing inbound auto-reply budgets if present; fail soft (log event, don’t crash webhook).
- WhatsApp missing config: mark run failed with error event; webhook still returns 200.

---

## Error handling

| Case | Behavior |
|------|----------|
| Cross-account id | 404 |
| Invalid body | 400 + field message |
| Activate invalid flow | 400 with validate issues array |
| WAHA send failure mid-flow | run → failed / event error; no throw to webhook |
| Cron without secret | 401 |

## Testing

- **Pipelines/Broadcasts/Automations APIs:** route-level or lib tests for account scoping + happy path create/list (follow contacts test style if any; otherwise vitest on pure helpers).
- **Flows:** restore `engine.test.ts` green; add dispatch/advance integration-style unit tests with mocked `engineSendText` + prisma test doubles or focused pure functions.
- Manual: create pipeline+deal drag; create broadcast draft with tags; create automation from template + toggle; create keyword flow, activate, send WAHA inbound matching keyword → outbound text + run row.

## Rollout / docs

- Update `docs/runbook-local.md` status table for the four areas.
- Env: document cron secret for `/api/flows/cron` if not already.

## Success criteria

1. All four sidebar routes show real UIs (not “Em migração”).
2. Pipelines: create pipeline, create/move/edit deals end-to-end against Postgres.
3. Broadcasts: create draft with recipients counted; no send required.
4. Automations: CRUD + template + `is_active` persisted; no inbound side effects yet.
5. Flows: activate keyword flow; inbound matching keyword sends WAHA text and creates a completed (or progressed) `FlowRun`.
