# CRM Tabs Functional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/pipelines`, `/broadcasts`, `/automations`, and `/flows` usable after the Prisma/WAHA migration — lean UIs + session APIs; only flows get inbound runtime.

**Architecture:** Dashboard pages call account-scoped `/api/*` routes (`requireSessionAccount` + Prisma, snake_case JSON like contacts). Pipelines/broadcasts/automations are CRUD-only. Flows reimplement `lib/flows/engine.ts` helpers + `dispatchInboundToFlows` hooked from `inbound.ts`, plus cron with `AUTOMATION_CRON_SECRET`.

**Tech Stack:** Next.js App Router, Prisma, Vitest, existing UI (`pipeline-board`, shadcn), WAHA via `lib/flows/waha-send.ts`.

**Spec:** `docs/superpowers/specs/2026-07-29-crm-tabs-functional-design.md`

**Scope note:** Four phases ship independently. Stop after any phase if needed. Execute in order: pipelines → broadcasts → automations → flows.

---

## File map

### Phase 1 — Pipelines
| Path | Role |
|------|------|
| `src/types/index.ts` | Align `DealStatus` to `active \| won \| lost` |
| `src/lib/pipelines/serialize.ts` | Map Prisma → snake_case DTO |
| `src/lib/pipelines/defaults.ts` | Default stage names/colors |
| `src/app/api/pipelines/route.ts` | GET list, POST create |
| `src/app/api/pipelines/[id]/route.ts` | PATCH, DELETE |
| `src/app/api/deals/route.ts` | GET by pipeline, POST |
| `src/app/api/deals/[id]/route.ts` | PATCH, DELETE |
| `src/lib/pipelines/defaults.test.ts` | Unit tests for defaults |
| `src/app/(dashboard)/pipelines/page.tsx` | Board UI |
| `src/components/pipelines/deal-form-dialog.tsx` | Create/edit modal |

### Phase 2 — Broadcasts
| Path | Role |
|------|------|
| `src/lib/broadcasts/audience.ts` | Resolve contacts from filter |
| `src/lib/broadcasts/serialize.ts` | DTO helpers |
| `src/app/api/broadcasts/route.ts` | GET, POST (+ materialize recipients) |
| `src/app/api/broadcasts/[id]/route.ts` | GET, PATCH (draft), DELETE |
| `src/app/api/message-templates/route.ts` | GET list for form |
| `src/app/(dashboard)/broadcasts/page.tsx` | List |
| `src/app/(dashboard)/broadcasts/new/page.tsx` | Single form |
| `src/app/(dashboard)/broadcasts/[id]/page.tsx` | Detail |

### Phase 3 — Automations
| Path | Role |
|------|------|
| `src/lib/automations/serialize.ts` | DTO + steps |
| `src/app/api/automations/route.ts` | GET, POST |
| `src/app/api/automations/[id]/route.ts` | GET, PUT, DELETE |
| `src/app/api/automations/[id]/duplicate/route.ts` | POST clone |
| `src/app/api/automations/[id]/logs/route.ts` | GET logs |
| `src/app/(dashboard)/automations/page.tsx` | List + toggle |
| `src/app/(dashboard)/automations/new/page.tsx` | Form / template |
| `src/app/(dashboard)/automations/[id]/edit/page.tsx` | Edit form |
| `src/app/(dashboard)/automations/[id]/logs/page.tsx` | Logs table |

### Phase 4 — Flows
| Path | Role |
|------|------|
| `src/lib/flows/engine.ts` | Helpers + advance + dispatch |
| `src/lib/flows/dispatch.ts` | Thin wrapper exporting `dispatchInboundToFlows` (optional split) |
| `src/lib/whatsapp/inbound.ts` | Call dispatch after persist (non-fromMe text) |
| `src/app/api/flows/route.ts` | GET, POST |
| `src/app/api/flows/[id]/route.ts` | GET, PUT, DELETE |
| `src/app/api/flows/[id]/activate/route.ts` | POST |
| `src/app/api/flows/[id]/runs/route.ts` | GET |
| `src/app/api/flows/templates/route.ts` | GET |
| `src/app/api/flows/cron/route.ts` | GET secret + stale sweep |
| `src/app/(dashboard)/flows/page.tsx` | List |
| `src/app/(dashboard)/flows/[id]/page.tsx` | Linear editor |
| `src/app/(dashboard)/flows/[id]/runs/page.tsx` | Runs |
| `docs/runbook-local.md` | Status table update |

---

## Phase 1 — Pipelines

### Task 1: Align DealStatus + default stages helper

**Files:**
- Modify: `src/types/index.ts` (`DealStatus`)
- Create: `src/lib/pipelines/defaults.ts`
- Create: `src/lib/pipelines/defaults.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/pipelines/defaults.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULT_PIPELINE_STAGES } from "./defaults";

describe("DEFAULT_PIPELINE_STAGES", () => {
  it("has four stages with unique positions starting at 0", () => {
    expect(DEFAULT_PIPELINE_STAGES).toHaveLength(4);
    expect(DEFAULT_PIPELINE_STAGES.map((s) => s.position)).toEqual([0, 1, 2, 3]);
    expect(DEFAULT_PIPELINE_STAGES.map((s) => s.name)).toEqual([
      "Lead",
      "Qualified",
      "Proposal",
      "Won",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run src/lib/pipelines/defaults.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement defaults + type fix**

```ts
// src/lib/pipelines/defaults.ts
export const DEFAULT_PIPELINE_STAGES = [
  { name: "Lead", position: 0, color: "#3b82f6" },
  { name: "Qualified", position: 1, color: "#8b5cf6" },
  { name: "Proposal", position: 2, color: "#f59e0b" },
  { name: "Won", position: 3, color: "#22c55e" },
] as const;
```

In `src/types/index.ts`, change:

```ts
export type DealStatus = "active" | "won" | "lost";
```

Update any UI that compared `status === "open"` to `"active"` (grep `DealStatus` / `'open'` in pipelines components).

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run src/lib/pipelines/defaults.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipelines/defaults.ts src/lib/pipelines/defaults.test.ts src/types/index.ts
git commit -m "$(cat <<'EOF'
## O que foi feito
Alinha DealStatus a active|won|lost e adiciona stages default de pipeline.

## Por que
Prisma usa status string com default active; board precisa de stages seed.

## Onde revisar
src/lib/pipelines/defaults.ts, src/types/index.ts

## Impacto
- [x] Frontend
- [ ] Backend
- [ ] DB

## Risco / Atenção
Componentes que ainda checam status === "open".

## Como validar
yarn vitest run src/lib/pipelines/defaults.test.ts
EOF
)"
```

---

### Task 2: Serialize helpers for pipelines/deals

**Files:**
- Create: `src/lib/pipelines/serialize.ts`

- [ ] **Step 1: Implement serialize (no separate test — pure map used by routes)**

```ts
// src/lib/pipelines/serialize.ts
import type { Deal, Pipeline, PipelineStage, Contact } from "@prisma/client";

type StageRow = PipelineStage;
type DealRow = Deal & {
  contact?: Contact | null;
  stage?: PipelineStage | null;
};
type PipelineRow = Pipeline & { stages: StageRow[] };

export function serializeStage(s: StageRow) {
  return {
    id: s.id,
    pipeline_id: s.pipelineId,
    name: s.name,
    position: s.position,
    color: s.color,
    created_at: s.createdAt.toISOString(),
  };
}

export function serializeDeal(d: DealRow) {
  return {
    id: d.id,
    user_id: d.userId ?? "",
    pipeline_id: d.pipelineId,
    stage_id: d.stageId,
    contact_id: d.contactId,
    conversation_id: d.conversationId ?? undefined,
    title: d.title,
    value: Number(d.value),
    currency: d.currency,
    notes: d.notes ?? undefined,
    expected_close_date: d.expectedCloseDate
      ? d.expectedCloseDate.toISOString().slice(0, 10)
      : undefined,
    status: d.status as "active" | "won" | "lost",
    created_at: d.createdAt.toISOString(),
    updated_at: d.updatedAt.toISOString(),
    contact: d.contact
      ? {
          id: d.contact.id,
          name: d.contact.name,
          phone: d.contact.phone,
          email: d.contact.email,
          company: d.contact.company,
          avatar_url: d.contact.avatarUrl,
          account_id: d.contact.accountId,
          created_at: d.contact.createdAt.toISOString(),
          updated_at: d.contact.updatedAt.toISOString(),
        }
      : undefined,
  };
}

export function serializePipeline(p: PipelineRow) {
  return {
    id: p.id,
    user_id: p.userId ?? "",
    account_id: p.accountId,
    name: p.name,
    created_at: p.createdAt.toISOString(),
    stages: [...p.stages]
      .sort((a, b) => a.position - b.position)
      .map(serializeStage),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pipelines/serialize.ts
git commit -m "$(cat <<'EOF'
## O que foi feito
Helpers snake_case para Pipeline/Stage/Deal.

## Por que
APIs dashboard espelham o padrão contacts.

## Onde revisar
src/lib/pipelines/serialize.ts

## Impacto
- [x] Backend

## Risco / Atenção
Nenhum.

## Como validar
Importado pelas rotas na Task 3.
EOF
)"
```

---

### Task 3: Pipelines + Deals API routes

**Files:**
- Create: `src/app/api/pipelines/route.ts` (replace if stub elsewhere — there is none yet)
- Create: `src/app/api/pipelines/[id]/route.ts`
- Create: `src/app/api/deals/route.ts`
- Create: `src/app/api/deals/[id]/route.ts`

- [ ] **Step 1: Implement `GET/POST /api/pipelines`**

```ts
// src/app/api/pipelines/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionAccount } from "@/lib/auth/context";
import { DEFAULT_PIPELINE_STAGES } from "@/lib/pipelines/defaults";
import { serializePipeline } from "@/lib/pipelines/serialize";

export async function GET() {
  try {
    const ctx = await requireSessionAccount();
    const rows = await prisma.pipeline.findMany({
      where: { accountId: ctx.accountId },
      include: { stages: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ pipelines: rows.map(serializePipeline) });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[api/pipelines]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount();
    const body = (await req.json()) as { name?: string };
    const name = body.name?.trim() || "Sales pipeline";
    const pipeline = await prisma.pipeline.create({
      data: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        name,
        stages: {
          create: DEFAULT_PIPELINE_STAGES.map((s) => ({
            name: s.name,
            position: s.position,
            color: s.color,
          })),
        },
      },
      include: { stages: true },
    });
    return NextResponse.json(
      { pipeline: serializePipeline(pipeline) },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[api/pipelines POST]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Implement `PATCH/DELETE /api/pipelines/[id]`**

```ts
// src/app/api/pipelines/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionAccount } from "@/lib/auth/context";
import { serializePipeline } from "@/lib/pipelines/serialize";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount();
    const { id } = await ctx.params;
    const body = (await req.json()) as { name?: string };
    const existing = await prisma.pipeline.findFirst({
      where: { id, accountId: session.accountId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const pipeline = await prisma.pipeline.update({
      where: { id },
      data: { name },
      include: { stages: true },
    });
    return NextResponse.json({ pipeline: serializePipeline(pipeline) });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount();
    const { id } = await ctx.params;
    const existing = await prisma.pipeline.findFirst({
      where: { id, accountId: session.accountId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.pipeline.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Implement deals routes**

```ts
// src/app/api/deals/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionAccount } from "@/lib/auth/context";
import { serializeDeal } from "@/lib/pipelines/serialize";

export async function GET(req: Request) {
  try {
    const ctx = await requireSessionAccount();
    const pipelineId = new URL(req.url).searchParams.get("pipeline_id");
    if (!pipelineId) {
      return NextResponse.json({ error: "pipeline_id required" }, { status: 400 });
    }
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: pipelineId, accountId: ctx.accountId },
    });
    if (!pipeline) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const deals = await prisma.deal.findMany({
      where: { pipelineId, accountId: ctx.accountId },
      include: { contact: true },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ deals: deals.map(serializeDeal) });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSessionAccount();
    const body = (await req.json()) as {
      pipeline_id?: string;
      stage_id?: string;
      contact_id?: string;
      title?: string;
      value?: number;
      currency?: string;
      notes?: string;
      expected_close_date?: string;
    };
    if (!body.pipeline_id || !body.stage_id || !body.contact_id || !body.title?.trim()) {
      return NextResponse.json(
        { error: "pipeline_id, stage_id, contact_id, title required" },
        { status: 400 },
      );
    }
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: body.pipeline_id, accountId: ctx.accountId },
      include: { stages: true },
    });
    if (!pipeline) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }
    if (!pipeline.stages.some((s) => s.id === body.stage_id)) {
      return NextResponse.json({ error: "Invalid stage_id" }, { status: 400 });
    }
    const contact = await prisma.contact.findFirst({
      where: { id: body.contact_id, accountId: ctx.accountId },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    const deal = await prisma.deal.create({
      data: {
        accountId: ctx.accountId,
        userId: ctx.userId,
        pipelineId: body.pipeline_id,
        stageId: body.stage_id,
        contactId: body.contact_id,
        title: body.title.trim(),
        value: body.value ?? 0,
        currency: body.currency ?? "BRL",
        notes: body.notes ?? null,
        expectedCloseDate: body.expected_close_date
          ? new Date(body.expected_close_date)
          : null,
        status: "active",
      },
      include: { contact: true },
    });
    return NextResponse.json({ deal: serializeDeal(deal) }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

```ts
// src/app/api/deals/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSessionAccount } from "@/lib/auth/context";
import { serializeDeal } from "@/lib/pipelines/serialize";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount();
    const { id } = await ctx.params;
    const existing = await prisma.deal.findFirst({
      where: { id, accountId: session.accountId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const body = (await req.json()) as {
      stage_id?: string;
      title?: string;
      value?: number;
      currency?: string;
      notes?: string | null;
      expected_close_date?: string | null;
      status?: "active" | "won" | "lost";
      contact_id?: string;
    };
    if (body.stage_id) {
      const stage = await prisma.pipelineStage.findFirst({
        where: { id: body.stage_id, pipelineId: existing.pipelineId },
      });
      if (!stage) {
        return NextResponse.json({ error: "Invalid stage_id" }, { status: 400 });
      }
    }
    if (body.contact_id) {
      const contact = await prisma.contact.findFirst({
        where: { id: body.contact_id, accountId: session.accountId },
      });
      if (!contact) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
    }
    const deal = await prisma.deal.update({
      where: { id },
      data: {
        ...(body.stage_id ? { stageId: body.stage_id } : {}),
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.value !== undefined ? { value: body.value } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.contact_id ? { contactId: body.contact_id } : {}),
        ...(body.expected_close_date !== undefined
          ? {
              expectedCloseDate: body.expected_close_date
                ? new Date(body.expected_close_date)
                : null,
            }
          : {}),
      },
      include: { contact: true },
    });
    return NextResponse.json({ deal: serializeDeal(deal) });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSessionAccount();
    const { id } = await ctx.params;
    const existing = await prisma.deal.findFirst({
      where: { id, accountId: session.accountId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.deal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Smoke-check TypeScript on new routes**

Run: `yarn typecheck`

Expected: no errors from new files (fix any `requireSessionAccount` return shape — use `ctx.userId` / `ctx.accountId` as defined in `src/lib/auth/context.ts`; adjust field names if different).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/pipelines src/app/api/deals
git commit -m "$(cat <<'EOF'
## O que foi feito
APIs CRUD de pipelines e deals no Prisma.

## Por que
Board precisa de list/create/move sem stubs.

## Onde revisar
src/app/api/pipelines/, src/app/api/deals/

## Impacto
- [x] Backend

## Risco / Atenção
Cascade delete apaga deals do pipeline.

## Como validar
curl autenticado GET /api/pipelines após login session cookie.
EOF
)"
```

---

### Task 4: Pipelines page UI + deal dialog

**Files:**
- Create: `src/components/pipelines/deal-form-dialog.tsx`
- Modify: `src/app/(dashboard)/pipelines/page.tsx`
- Leave stub: `pipeline-settings.tsx` unused

- [ ] **Step 1: Implement deal form dialog**

Create a client dialog with: contact search (`GET /api/contacts?q=`), title, value, currency select, optional notes. Props:

```ts
type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pipelineId: string;
  stageId: string | null;
  deal?: {
    id: string;
    title: string;
    value: number;
    currency?: string;
    notes?: string;
    contact_id: string | null;
    stage_id: string;
  } | null;
  onSaved: () => void;
};
```

- Create: `POST /api/deals` with `pipeline_id`, `stage_id`, `contact_id`, `title`, `value`, `currency`, `notes`.
- Edit: `PATCH /api/deals/[id]`.

Use existing shadcn `Dialog`, `Input`, `Button`, `toast` from sonner — mirror contacts page style (lean, no cards in hero).

- [ ] **Step 2: Replace pipelines page**

`page.tsx` client component that:

1. `GET /api/pipelines` on mount.
2. If empty, show button “Criar pipeline” → `POST /api/pipelines`.
3. Select pipeline; `GET /api/deals?pipeline_id=`.
4. Render `PipelineBoard` with `onDealMoved` → `PATCH /api/deals/[id]` `{ stage_id }` then reload (or optimistic update).
5. `onAddDeal` / `onEditDeal` open `DealFormDialog`.

- [ ] **Step 3: Manual verify**

Run: `yarn dev` → login → `/pipelines` → create pipeline → add deal → drag stage.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/pipelines/page.tsx src/components/pipelines/deal-form-dialog.tsx
git commit -m "$(cat <<'EOF'
## O que foi feito
UI enxuta do kanban de pipelines ligada às APIs.

## Por que
Remover shell Em migração da aba Pipelines.

## Onde revisar
src/app/(dashboard)/pipelines/page.tsx

## Impacto
- [x] Frontend

## Risco / Atenção
Nenhum.

## Como validar
Criar pipeline, deal e mover no board.
EOF
)"
```

---

## Phase 2 — Broadcasts

### Task 5: Audience resolver + tests

**Files:**
- Create: `src/lib/broadcasts/audience.ts`
- Create: `src/lib/broadcasts/audience.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseAudienceFilter } from "./audience";

describe("parseAudienceFilter", () => {
  it("defaults to all", () => {
    expect(parseAudienceFilter(undefined)).toEqual({ mode: "all", tagIds: [] });
  });
  it("reads tagIds", () => {
    expect(parseAudienceFilter({ mode: "tags", tagIds: ["a", "b"] })).toEqual({
      mode: "tags",
      tagIds: ["a", "b"],
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

`yarn vitest run src/lib/broadcasts/audience.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/broadcasts/audience.ts
import { prisma } from "@/lib/db/prisma";

export type AudienceFilter = {
  mode: "all" | "tags";
  tagIds: string[];
};

export function parseAudienceFilter(raw: unknown): AudienceFilter {
  if (!raw || typeof raw !== "object") return { mode: "all", tagIds: [] };
  const o = raw as Record<string, unknown>;
  const tagIds = Array.isArray(o.tagIds)
    ? o.tagIds.filter((x): x is string => typeof x === "string")
    : [];
  if (o.mode === "tags" && tagIds.length > 0) {
    return { mode: "tags", tagIds };
  }
  return { mode: "all", tagIds: [] };
}

export async function resolveAudienceContactIds(
  accountId: string,
  filter: AudienceFilter,
): Promise<string[]> {
  if (filter.mode === "tags") {
    const rows = await prisma.contact.findMany({
      where: {
        accountId,
        contactTags: { some: { tagId: { in: filter.tagIds } } },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  const rows = await prisma.contact.findMany({
    where: { accountId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** (template commit body as above, feat audience helper)

---

### Task 6: Broadcasts + message-templates APIs

**Files:**
- Create: `src/lib/broadcasts/serialize.ts`
- Create: `src/app/api/broadcasts/route.ts`
- Create: `src/app/api/broadcasts/[id]/route.ts`
- Create: `src/app/api/message-templates/route.ts`

- [ ] **Step 1: serialize**

```ts
export function serializeBroadcast(b: {
  id: string;
  userId: string | null;
  name: string;
  templateName: string;
  templateLanguage: string;
  templateVariables: unknown;
  audienceFilter: unknown;
  scheduledAt: Date | null;
  status: string;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  failedCount: number;
  createdAt: Date;
}) {
  return {
    id: b.id,
    user_id: b.userId ?? "",
    name: b.name,
    template_name: b.templateName,
    template_language: b.templateLanguage,
    template_variables: b.templateVariables ?? undefined,
    audience_filter: b.audienceFilter ?? undefined,
    scheduled_at: b.scheduledAt?.toISOString() ?? undefined,
    status: b.status,
    total_recipients: b.totalRecipients,
    sent_count: b.sentCount,
    delivered_count: b.deliveredCount,
    read_count: b.readCount,
    replied_count: b.repliedCount,
    failed_count: b.failedCount,
    created_at: b.createdAt.toISOString(),
  };
}
```

- [ ] **Step 2: POST create with recipients**

In `POST /api/broadcasts`:

1. Validate `name`, `template_name`.
2. `parseAudienceFilter(body.audience_filter)`.
3. `resolveAudienceContactIds`.
4. Transaction: create broadcast `status: draft` + createMany recipients `pending` + set `totalRecipients`.

`GET` lists by `accountId` orderBy `createdAt desc`.

`GET [id]` 404 if wrong account; include counts already on row.

`PATCH [id]` only if `status === "draft"`; allow `name`, `scheduled_at`; **do not** change audience.

`DELETE [id]` always (cascade recipients).

- [ ] **Step 3: `GET /api/message-templates`**

```ts
const rows = await prisma.messageTemplate.findMany({
  where: { accountId: ctx.accountId },
  orderBy: { updatedAt: "desc" },
});
return NextResponse.json({
  templates: rows.map((t) => ({
    id: t.id,
    name: t.name,
    language: t.language,
    status: t.status,
    body_text: t.bodyText,
  })),
});
```

- [ ] **Step 4: typecheck + commit**

---

### Task 7: Broadcasts UI pages

**Files:**
- Modify: `src/app/(dashboard)/broadcasts/page.tsx`
- Modify: `src/app/(dashboard)/broadcasts/new/page.tsx`
- Modify: `src/app/(dashboard)/broadcasts/[id]/page.tsx`

- [ ] **Step 1: List page** — table + link to `/broadcasts/new` and row → `/broadcasts/[id]`.

- [ ] **Step 2: New page** — form fields: name, template select (`/api/message-templates`), audience radio all/tags (+ multi tag from `/api/contacts` tags if available — or `GET /api/tags` if exists; else skip tags UI and only “all”), optional datetime-local `scheduled_at`. Submit → POST → redirect to detail.

- [ ] **Step 3: Detail** — show status badge (`broadcast-status.ts` if usable), counts, no send button (or disabled “Em breve”).

- [ ] **Step 4: Manual + commit**

---

## Phase 3 — Automations

### Task 8: Automations serialize + CRUD APIs

**Files:**
- Create: `src/lib/automations/serialize.ts`
- Replace stubs: `src/app/api/automations/route.ts`, `[id]/route.ts`, `[id]/duplicate/route.ts`
- Create: `src/app/api/automations/[id]/logs/route.ts`

- [ ] **Step 1: serialize automation + steps to snake_case** matching `Automation` / `AutomationStep` in `src/types/index.ts`.

- [ ] **Step 2: GET/POST list+create**

POST body:

```ts
{
  name: string;
  description?: string;
  trigger_type: string;
  trigger_config?: object;
  steps?: Array<{ step_type: string; step_config: object; position?: number }>;
  template_slug?: string; // if set, seed from AUTOMATION_TEMPLATES
}
```

If `template_slug`, load `AUTOMATION_TEMPLATES[slug]` and create steps from seed (ignore parent_index nesting beyond linear append for MVP — only create root steps in order; skip nested condition children or flatten welcome template linear steps only).

- [ ] **Step 3: GET/PUT/DELETE `[id]`**

PUT replaces metadata + deletes all steps and recreates from body `steps[]`. If `is_active: true`, call `validateAutomation` from `src/lib/automations/validate.ts` — on failure return 400 `{ errors }`.

Check export name in validate.ts and use it.

- [ ] **Step 4: duplicate** — clone with `isActive: false`, name suffix ` (copy)`.

- [ ] **Step 5: logs GET** — `prisma.automationLog.findMany({ where: { automationId, automation: { accountId } }, orderBy: { createdAt: "desc" }, take: 50 })`.

- [ ] **Step 6: typecheck + commit**

---

### Task 9: Automations lean UI

**Files:**
- Replace stubs under `src/app/(dashboard)/automations/**`

- [ ] **Step 1: List** — fetch GET; show `TRIGGER_META` pill; Switch for active → PUT `{ is_active }`; links edit/logs; duplicate button; delete.

- [ ] **Step 2: New/Edit form** — template buttons from `Object.values` of templates (client can hardcode slug list calling POST with `template_slug`, or GET `/api/automations` doesn’t list templates — add `GET /api/automations/templates` returning `AUTOMATION_TEMPLATES` metadata without steps, OR embed template picker that POSTs `template_slug` only).

Simplest: new page has “Usar template” cards that `POST { template_slug }` then redirect to edit; manual form: name, trigger_type select, keywords if keyword_match, steps as list of textareas (`send_message`).

- [ ] **Step 3: Logs page** — table status / trigger / created_at / error.

- [ ] **Step 4: Manual + commit**

---

## Phase 4 — Flows

### Task 10: Reimplement engine helpers (TDD against existing tests)

**Files:**
- Replace: `src/lib/flows/engine.ts`
- Existing test: `src/lib/flows/engine.test.ts` (do not gut tests)

- [ ] **Step 1: Run existing tests — expect FAIL**

`yarn vitest run src/lib/flows/engine.test.ts`

- [ ] **Step 2: Implement pure helpers in `engine.ts`**

Export exactly what tests import:

```ts
export function matchReplyId(
  node: { node_type: string; config: Record<string, unknown> },
  replyId: string,
): string | null {
  if (node.node_type === "send_buttons") {
    const buttons = (node.config.buttons as Array<{ reply_id: string; next_node_key: string }>) ?? [];
    return buttons.find((b) => b.reply_id === replyId)?.next_node_key ?? null;
  }
  if (node.node_type === "send_list") {
    const sections = (node.config.sections as Array<{ rows?: Array<{ reply_id: string; next_node_key: string }> }>) ?? [];
    for (const sec of sections) {
      for (const row of sec.rows ?? []) {
        if (row.reply_id === replyId) return row.next_node_key;
      }
    }
  }
  return null;
}

export function matchesKeywordTrigger(
  text: string,
  cfg: { keywords?: string[]; match_type?: "contains" | "exact"; case_sensitive?: boolean },
): boolean {
  if (!text) return false;
  const keywords = (cfg.keywords ?? []).filter(Boolean);
  if (!keywords.length) return false;
  const hay = cfg.case_sensitive ? text : text.toLowerCase();
  for (const kw of keywords) {
    const needle = cfg.case_sensitive ? kw : kw.toLowerCase();
    if (!needle) continue;
    if (cfg.match_type === "exact") {
      if (hay === needle) return true;
    } else if (hay.includes(needle)) {
      return true;
    }
  }
  return false;
}

export function isAutoAdvancing(t: string) {
  return ["start", "send_message", "send_media", "condition", "set_tag"].includes(t);
}
export function isSuspending(t: string) {
  return ["send_buttons", "send_list", "collect_input"].includes(t);
}
export function isTerminal(t: string) {
  return ["handoff", "end"].includes(t);
}

export function evaluateConditionPredicate(args: {
  operator: string;
  subjectValue: string | undefined;
  configValue: string | undefined;
}): boolean {
  const { operator, subjectValue, configValue } = args;
  if (operator === "present") return Boolean(subjectValue && subjectValue.length > 0);
  if (operator === "absent") return !(subjectValue && subjectValue.length > 0);
  if (operator === "equals") {
    if (subjectValue === undefined) return false;
    return subjectValue === configValue;
  }
  if (operator === "contains") {
    if (subjectValue === undefined) return false;
    return subjectValue.includes(configValue ?? "");
  }
  return false;
}
```

- [ ] **Step 3: Run tests — expect PASS**

`yarn vitest run src/lib/flows/engine.test.ts`

- [ ] **Step 4: Commit helpers**

---

### Task 11: advanceFlow + dispatchInboundToFlows

**Files:**
- Modify: `src/lib/flows/engine.ts` (add async runtime)
- Create: `src/lib/flows/engine-runtime.test.ts` (mocked prisma/send)

- [ ] **Step 1: Write runtime unit test with mocks**

Mock `engineSendText` and prisma via `vi.mock`. Test: given flow with nodes start→send_message→end and keyword match, `dispatchInboundToFlows` creates a completed run and calls send once.

Keep the test focused — if prisma mocking is too heavy, extract pure `planLinearAdvance(nodes, entryKey)` tested separately, then thin DB wrapper.

- [ ] **Step 2: Implement `advanceFlow`**

Algorithm:

1. Load run + flow nodes map by `node_key`.
2. Loop (max 20 iterations): read `currentNodeKey`; if missing, set entry from `flow.entryNodeId`.
3. If `send_message`: interpolate `{{vars}}` simply (replace `{{key}}` from `run.vars`); `engineSendText`; append event; follow `config.next_node_key`.
4. If `start`: follow `next_node_key`.
5. If `end`/`handoff`: mark run completed/handed_off; break.
6. If suspending: set status waiting; break (wait for later inbound — out of MVP UI).
7. On send error: status failed + event; break.

- [ ] **Step 3: Implement `dispatchInboundToFlows`**

```ts
export async function dispatchInboundToFlows(args: {
  accountId: string;
  contactId: string;
  conversationId: string;
  phone: string;
  text: string;
  isFirstInbound?: boolean;
}): Promise<{ started: number; advanced: number }>
```

1. Find active runs for contact (`status: active` or `waiting`) — if waiting suspending, try matchReplyId / else ignore for MVP.
2. Else find active flows for account where trigger matches keyword or first_inbound.
3. Skip if already has active run for that flow+contact.
4. Create FlowRun + advanceFlow.

- [ ] **Step 4: Tests pass + commit**

---

### Task 12: Hook inbound + flows APIs + cron

**Files:**
- Modify: `src/lib/whatsapp/inbound.ts` — after message create, if `!fromMe` and `text`, call `dispatchInboundToFlows(...).catch(log)`.
- Replace stubs: all `src/app/api/flows/**`

- [ ] **Step 1: Wire inbound** (soft-fail). Pass `phone` from resolved contact phone.

- [ ] **Step 2: Flows CRUD APIs**

Mirror automations pattern:

- POST create blank: nodes `[start, end]` linked, or `template_slug` from `FLOW_TEMPLATES` / export in `templates.ts`.
- PUT replaces nodes array; set `entry_node_id`.
- activate: validate with `validate.ts` then `status: active`; body `{ active: boolean }`.
- runs GET with events.
- templates GET maps template list.
- cron GET: header `Authorization: Bearer ${AUTOMATION_CRON_SECRET}` or `x-cron-secret`; find runs `status in (active,waiting)` where `lastAdvancedAt < now - hours`; mark timed_out.

- [ ] **Step 3: typecheck + commit**

---

### Task 13: Flows lean UI

**Files:**
- Replace: `src/app/(dashboard)/flows/page.tsx`, `[id]/page.tsx`, `[id]/runs/page.tsx`

- [ ] **Step 1: List** — status badge, new blank, new from template (fetch `/api/flows/templates`).

- [ ] **Step 2: Editor** — fields: name, trigger_type select, keywords comma-separated; dynamic list of message texts (each becomes `send_message` node with generated `node_key`); on save build nodes:

```
start (next → m1) → m1 → m2 → … → end
```

Activate button → POST activate.

- [ ] **Step 3: Runs page** — table id/status/started/ended/end_reason.

- [ ] **Step 4: Manual E2E** — activate keyword flow, send WAHA inbound with keyword, confirm outbound + run.

- [ ] **Step 5: Commit**

---

### Task 14: Runbook update

**Files:**
- Modify: `docs/runbook-local.md` status table rows for Pipelines/Broadcasts/Automations/Flows.

- [ ] **Step 1: Update table** to reflect CRUD done; Flows engine MVP keyword→send_message; automations/broadcasts engines still stub.

- [ ] **Step 2: Commit**

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Pipelines APIs + board | 1–4 |
| Broadcasts CRUD + audience, no send | 5–7 |
| Automations CRUD + templates, no engine | 8–9 |
| Flows helpers + dispatch + inbound + cron + lean UI | 10–13 |
| Runbook | 14 |
| DealStatus active | 1 |
| AUTOMATION_CRON_SECRET | 12 |
| Success criteria E2E keyword | 13 step 4 |

No TBD placeholders left in task steps. Types use snake_case API bodies consistently.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-29-crm-tabs-functional.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute in this session with executing-plans + checkpoints  

Which approach?
