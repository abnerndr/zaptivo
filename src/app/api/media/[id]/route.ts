import { requireSessionAccount } from '@/domain/auth/context'
import { getAudio } from '../storage'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSessionAccount()
    const { id } = await params
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return new Response('Not found', { status: 404 })
    const bytes = await getAudio(ctx.accountId, id)
    if (!bytes) return new Response('Not found', { status: 404 })
    return new Response(Buffer.from(bytes), { headers: { 'Content-Type': 'audio/ogg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch (error) {
    if (error instanceof Response) return error
    console.error('[media/read]', error)
    return new Response('Media unavailable', { status: 500 })
  }
}
