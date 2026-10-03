'use client'

export type BuilderStep = {
  id: string
  type: string
  cid?: string
  step_type?: string
  step_config?: Record<string, unknown>
  config?: Record<string, unknown>
  branches?: { yes: BuilderStep[]; no: BuilderStep[] }
}

export type BuilderInitial = {
  name?: string
  steps?: BuilderStep[]
}

export type ServerStepNode = {
  id: string
  step_type: string
  step_config?: unknown
  position?: number
  parent_step_id?: string | null
  branch?: string | null
}

export function fromServerSteps(_steps: ServerStepNode[]): BuilderStep[] {
  return []
}

export function AutomationBuilder(_props: { initial?: BuilderInitial }) {
  return (
    <p className="text-sm text-muted-foreground p-4">
      Automation builder em migração.
    </p>
  )
}

export default AutomationBuilder
