import type { Contact, Deal, Pipeline, PipelineStage } from '@prisma/client'

type StageRow = PipelineStage
type DealRow = Deal & {
  contact?: Contact | null
  stage?: PipelineStage | null
}
type PipelineRow = Pipeline & { stages: StageRow[] }

export function serializeStage(s: StageRow) {
  return {
    id: s.id,
    pipeline_id: s.pipelineId,
    name: s.name,
    position: s.position,
    color: s.color,
    created_at: s.createdAt.toISOString(),
  }
}

export function serializeDeal(d: DealRow) {
  return {
    id: d.id,
    user_id: d.userId ?? '',
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
    status: (d.status === 'active' ? 'open' : d.status) as
      | 'open'
      | 'won'
      | 'lost',
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
  }
}

export function serializePipeline(p: PipelineRow) {
  return {
    id: p.id,
    user_id: p.userId ?? '',
    account_id: p.accountId,
    name: p.name,
    created_at: p.createdAt.toISOString(),
    stages: [...p.stages]
      .sort((a, b) => a.position - b.position)
      .map(serializeStage),
  }
}
