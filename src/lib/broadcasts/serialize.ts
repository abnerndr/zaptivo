import type { Broadcast } from '@prisma/client'

export function serializeBroadcast(b: Broadcast) {
  return {
    id: b.id,
    user_id: b.userId ?? '',
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
  }
}
