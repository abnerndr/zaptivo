import type { Flow, FlowNode, FlowRun, FlowRunEvent } from '@prisma/client'

export function serializeNode(n: FlowNode) {
  return {
    id: n.id,
    flow_id: n.flowId,
    node_key: n.nodeKey,
    node_type: n.nodeType,
    config: n.config as Record<string, unknown>,
    position_x: n.positionX,
    position_y: n.positionY,
  }
}

export function serializeFlow(f: Flow & { nodes?: FlowNode[] }) {
  return {
    id: f.id,
    account_id: f.accountId,
    user_id: f.userId ?? '',
    name: f.name,
    description: f.description,
    status: f.status,
    trigger_type: f.triggerType,
    trigger_config: f.triggerConfig as Record<string, unknown>,
    entry_node_id: f.entryNodeId,
    fallback_policy: f.fallbackPolicy,
    execution_count: f.executionCount,
    last_executed_at: f.lastExecutedAt?.toISOString() ?? null,
    created_at: f.createdAt.toISOString(),
    updated_at: f.updatedAt.toISOString(),
    nodes: f.nodes?.map(serializeNode),
  }
}

export function serializeRun(
  r: FlowRun & { events?: FlowRunEvent[] },
) {
  return {
    id: r.id,
    flow_id: r.flowId,
    contact_id: r.contactId,
    conversation_id: r.conversationId,
    status: r.status,
    current_node_key: r.currentNodeKey,
    end_reason: r.endReason,
    started_at: r.startedAt.toISOString(),
    ended_at: r.endedAt?.toISOString() ?? null,
    events: r.events?.map((e) => ({
      id: e.id,
      event_type: e.eventType,
      node_key: e.nodeKey,
      payload: e.payload,
      created_at: e.createdAt.toISOString(),
    })),
  }
}
