import type { Automation, AutomationStep, AutomationLog } from '@prisma/client'

export function serializeStep(s: AutomationStep) {
  return {
    id: s.id,
    automation_id: s.automationId,
    parent_step_id: s.parentStepId,
    branch: s.branch,
    step_type: s.stepType,
    step_config: s.stepConfig as Record<string, unknown>,
    position: s.position,
    created_at: s.createdAt.toISOString(),
  }
}

export function serializeAutomation(
  a: Automation & { steps?: AutomationStep[] },
) {
  return {
    id: a.id,
    account_id: a.accountId,
    user_id: a.userId ?? '',
    name: a.name,
    description: a.description,
    trigger_type: a.triggerType,
    trigger_config: a.triggerConfig as Record<string, unknown>,
    is_active: a.isActive,
    execution_count: a.executionCount,
    last_executed_at: a.lastExecutedAt?.toISOString() ?? null,
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
    steps: a.steps
      ? [...a.steps].sort((x, y) => x.position - y.position).map(serializeStep)
      : undefined,
  }
}

export function serializeLog(l: AutomationLog) {
  return {
    id: l.id,
    automation_id: l.automationId,
    contact_id: l.contactId,
    trigger_event: l.triggerEvent,
    steps_executed: l.stepsExecuted,
    status: l.status,
    error_message: l.errorMessage,
    created_at: l.createdAt.toISOString(),
  }
}
