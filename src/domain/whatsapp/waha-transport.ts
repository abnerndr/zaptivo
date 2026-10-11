export function classifyWahaTransport(sample: {
  eventsContentType: string | null
  eventsStatus: number
}): 'sse' | 'websocket' {
  if (
    sample.eventsStatus === 200 &&
    (sample.eventsContentType ?? '').includes('text/event-stream')
  ) {
    return 'sse'
  }
  return 'websocket'
}

export function wahaEventsUrl(baseUrl: string, session: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return `${base}/api/${encodeURIComponent(session)}/events`
}

export function wahaWebSocketUrl(baseUrl: string, session: string): string {
  const base = baseUrl.replace(/\/$/, '').replace(/^http/i, 'ws')
  const events = 'message,message.any,message.ack,session.status'
  return `${base}/ws?session=${encodeURIComponent(session)}&events=${events}`
}
