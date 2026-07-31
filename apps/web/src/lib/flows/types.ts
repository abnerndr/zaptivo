
export type FlowRow = {
  id: string
  account_id: string
  name: string
  description?: string | null
  status: string
  trigger_type: "keyword" | "first_inbound_message" | "manual" | string
  trigger_config: Record<string, unknown>
  entry_node_id: string | null
  execution_count?: number
  last_executed_at?: string | null
}

export type FlowNodeRow = {
  id: string
  flow_id: string
  node_key: string
  node_type: string
  config: Record<string, unknown>
  position_x: number
  position_y: number
}

export type NodeType = string

export type FlowFallbackPolicy = {
  on_unknown_reply?: string
  max_reprompts?: number
  on_timeout_hours?: number
  on_exhaust?: string
  [key: string]: unknown
}
export const DEFAULT_FALLBACK_POLICY: FlowFallbackPolicy = {
  on_unknown_reply: "reprompt",
  max_reprompts: 2,
  on_timeout_hours: 24,
  on_exhaust: "handoff",
}
export type CollectInputNodeConfig = Record<string, unknown>
export type ConditionNodeConfig = Record<string, unknown>
export type HandoffNodeConfig = Record<string, unknown>
export type KeywordTriggerConfig = Record<string, unknown>
export type SendButtonsNodeConfig = Record<string, unknown>
export type SendListNodeConfig = Record<string, unknown>
export type SendMessageNodeConfig = Record<string, unknown>
export type StartNodeConfig = Record<string, unknown>
