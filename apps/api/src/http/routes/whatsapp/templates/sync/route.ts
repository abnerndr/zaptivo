import { NextResponse } from 'next/server'

/** Meta sync removed — templates are local only. */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Meta sync removed. Templates are managed locally.',
      code: 'gone',
    },
    { status: 410 }
  )
}
