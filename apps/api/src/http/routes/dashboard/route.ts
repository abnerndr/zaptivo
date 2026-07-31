import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { getDashboardData } from '@/lib/dashboard/queries'

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const data = await getDashboardData(ctx.accountId)
    return NextResponse.json(data)
  } catch (err) {
    return toErrorResponse(err)
  }
}
