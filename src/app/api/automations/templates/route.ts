import { NextResponse } from 'next/server'
import { requireSessionAccount } from '@/lib/auth/context'
import { AUTOMATION_TEMPLATES } from '@/lib/automations/templates'

export async function GET() {
  try {
    await requireSessionAccount()
    const templates = Object.values(AUTOMATION_TEMPLATES).map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      trigger_type: t.trigger_type,
    }))
    return NextResponse.json({ templates })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
