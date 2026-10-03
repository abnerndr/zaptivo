import { NextResponse } from 'next/server'
import { requireSessionAccount } from '@/domain/auth/context'
import { listFlowTemplates } from '@/domain/flows/templates'

export async function GET() {
  try {
    await requireSessionAccount()
    const templates = listFlowTemplates().map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      icon: t.icon,
      trigger_type: t.trigger_type,
    }))
    return NextResponse.json({ templates })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
