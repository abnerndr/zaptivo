import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { opaqueId, summarize, validate } from './measure.mjs'
const id = opaqueId('example', 'x'.repeat(32))
const row = (metric, attempt, durationMs, outcome = 'success') => ({ metric, kind: 'text', account: id, localId: id, attempt, outcome, ...(durationMs == null ? {} : { durationMs }) })
test('computes nearest-rank percentiles and failure rate by metric', () => {
  const rows = Array.from({ length: 20 }, (_, i) => row('click_to_local_bubble', i + 1, i + 1))
  rows.push(row('click_to_local_bubble', 21, null, 'failure'))
  assert.deepEqual(summarize(rows)['text/click_to_local_bubble'], { attempts: 21, successes: 20, failures: 1, failureRate: 1 / 21, p50Ms: 10, p95Ms: 19, targetP95Ms: 100, meetsTarget: true })
})
test('rejects raw IDs, extra sensitive fields, duplicate measurements and invalid durations', () => {
  assert.throws(() => validate({ ...row('audio_upload', 1, 1), account: 'raw' }))
  assert.throws(() => validate({ ...row('send_to_provider_accept', 1, 1), content: 'secret' }))
  assert.throws(() => validate(row('send_to_provider_accept', 1, -1)))
  assert.throws(() => summarize([row('send_to_provider_accept', 1, 1), row('send_to_provider_accept', 1, 2)]))
})
test('does not apply the text provider target to audio', () => {
  const result = summarize([{ ...row('send_to_provider_accept', 1, 5000), kind: 'audio', clipDurationMs: 60000 }])['audio/send_to_provider_accept']
  assert.equal(result.targetP95Ms, null)
})
