import { createHmac } from 'node:crypto'
import { appendFile } from 'node:fs/promises'

export const metrics = ['click_to_local_bubble', 'send_to_provider_accept', 'webhook_to_second_screen', 'accept_to_phone_receipt', 'audio_upload', 'audio_convert', 'audio_clip_duration']
export const targets = { click_to_local_bubble: 100, send_to_provider_accept: 2000, webhook_to_second_screen: 500 }
const fields = new Set(['metric', 'kind', 'account', 'localId', 'remoteId', 'attempt', 'outcome', 'durationMs', 'clipDurationMs'])
const hash = /^[a-f0-9]{64}$/

// Hash identifiers before they reach the collector. Keep the random key outside logs and data files.
export function opaqueId(value, key) {
  if (typeof value !== 'string' || !value || typeof key !== 'string' || key.length < 32) throw new Error('opaqueId requires an identifier and a secret key of at least 32 characters')
  return createHmac('sha256', key).update(value).digest('hex')
}
export function validate(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || Object.keys(record).some(k => !fields.has(k))) throw new Error('Invalid measurement fields')
  if (!metrics.includes(record.metric) || !['text', 'audio'].includes(record.kind) || !['success', 'failure'].includes(record.outcome)) throw new Error('Invalid measurement category')
  if (!hash.test(record.account || '') || !hash.test(record.localId || '') || (record.remoteId != null && !hash.test(record.remoteId))) throw new Error('Identifiers must be opaque HMAC-SHA256 values')
  if (!Number.isSafeInteger(record.attempt) || record.attempt < 1) throw new Error('Invalid attempt')
  if (record.outcome === 'success' && (!Number.isFinite(record.durationMs) || record.durationMs < 0)) throw new Error('Successful measurements require a non-negative durationMs')
  if (record.durationMs != null && (!Number.isFinite(record.durationMs) || record.durationMs < 0)) throw new Error('Invalid durationMs')
  if (record.metric.startsWith('audio_') && record.kind !== 'audio') throw new Error('Audio metrics require audio kind')
  if (record.clipDurationMs != null && (!Number.isFinite(record.clipDurationMs) || record.clipDurationMs < 0 || record.kind !== 'audio')) throw new Error('Invalid clipDurationMs')
  return record
}
export async function recordMeasurement(path, record) {
  validate(record)
  await appendFile(path, JSON.stringify(record) + '\n', { mode: 0o600 })
}
function percentile(values, percentile) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(percentile * sorted.length) - 1]
}
export function summarize(records) {
  const seen = new Set()
  const groups = new Map()
  for (const record of records) {
    validate(record)
    const key = [record.account, record.localId, record.attempt, record.metric].join(':')
    if (seen.has(key)) throw new Error('Duplicate measurement for account/local ID/attempt/metric')
    seen.add(key)
    const group = `${record.kind}/${record.metric}`
    const entries = groups.get(group) || []
    entries.push(record)
    groups.set(group, entries)
  }
  return Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, entries]) => {
    const successful = entries.filter(x => x.outcome === 'success').map(x => x.durationMs)
    const failures = entries.length - successful.length
    const [kind, metric] = name.split('/')
    const targetMs = kind === 'text' || metric === 'click_to_local_bubble' ? targets[metric] ?? null : null
    const p95Ms = percentile(successful, .95)
    return [name, { attempts: entries.length, successes: successful.length, failures, failureRate: failures / entries.length, p50Ms: percentile(successful, .5), p95Ms, targetP95Ms: targetMs, meetsTarget: targetMs !== null && p95Ms !== null ? p95Ms <= targetMs : null }]
  }))
}
