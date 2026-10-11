export function isDue(status: string, runAt: Date, now: Date): boolean {
  if (status !== 'queued' && status !== 'scheduled') return false
  return runAt.getTime() <= now.getTime()
}
