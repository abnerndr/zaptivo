import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

// The staging driver performs real actions and returns observations, not expected values.
// Without a driver, every scenario remains visibly skipped rather than passing on fixtures.
type Observation = Record<string, unknown>
type Driver = { run: (scenario: string) => Promise<Observation>; close?: () => Promise<void> }
let driver: Driver
const configured = Boolean(process.env.WHATSAPP_ACCEPTANCE_DRIVER)
const scenario = async (name: string) => driver.run(name)

describe.skipIf(!configured)('WhatsApp staging acceptance', () => {
  beforeAll(async () => {
    const path = resolve(process.env.WHATSAPP_ACCEPTANCE_DRIVER!)
    const module = await import(pathToFileURL(path).href)
    driver = await module.createDriver()
    if (!driver || typeof driver.run !== 'function') throw new Error('Invalid staging driver')
  })
  afterAll(async () => { if (driver?.close) await driver.close() })
  it('creates or updates contact and conversation on inbound message', async () => {
    expect(await scenario('inbound-contact-conversation')).toMatchObject({ contactCount: 1, conversationCount: 1, messageCount: 1, lastMessageMatches: true })
  })
  it('delivers a human reply exactly once to phone and history', async () => {
    expect(await scenario('human-reply')).toMatchObject({ phoneCount: 1, historyCount: 1, sameOperation: true })
  })
  it('plays audio in both directions, including short and 60-second clips', async () => {
    expect(await scenario('audio-both-directions')).toMatchObject({ shortInboundPlayable: true, shortOutboundPlayable: true, sixtySecondInboundPlayable: true, sixtySecondOutboundPlayable: true })
  })
  it('preserves quoted message in each direction', async () => {
    expect(await scenario('quoted-replies')).toMatchObject({ inboundQuoteMatches: true, phoneQuoteMatches: true })
  })
  it('records API, template, automation and agent sends in one conversation', async () => {
    expect(await scenario('shared-history')).toMatchObject({ sameConversation: true, apiCount: 1, templateCount: 1, automationCount: 1, agentCount: 1 })
  })
  it('rechecks pause before the agent sends', async () => {
    expect(await scenario('agent-pause')).toMatchObject({ pausedBeforeSend: true, agentPhoneCount: 0, agentHistoryCount: 0 })
  })
  it('rejects a viewer send server-side', async () => {
    expect(await scenario('viewer-send')).toMatchObject({ denied: true, providerCalls: 0, messageCount: 0 })
  })
  it('isolates events and media across organizations', async () => {
    expect(await scenario('cross-org')).toMatchObject({ foreignEventCount: 0, foreignMediaDenied: true, authorizedMediaAccessible: true })
  })
  it('deduplicates the same event across both webhook URLs', async () => {
    const result = await scenario('both-webhook-urls')
    expect(result).toMatchObject({ oldUrlAccepted: true, newUrlAccepted: true, messageCount: 1, logicalUpdateCount: 1, autoReplyCount: expect.any(Number) })
    expect(result.autoReplyCount).toBeGreaterThanOrEqual(0)
    expect(result.autoReplyCount).toBeLessThanOrEqual(1)
  })
  it('deduplicates concurrent repeated events', async () => {
    const result = await scenario('duplicate-event')
    expect(result).toMatchObject({ messageCount: 1, logicalUpdateCount: 1, autoReplyCount: expect.any(Number) })
    expect(result.autoReplyCount).toBeGreaterThanOrEqual(0)
    expect(result.autoReplyCount).toBeLessThanOrEqual(1)
  })
  it('does not regress delivery on out-of-order receipts', async () => {
    expect(await scenario('out-of-order-receipt')).toMatchObject({ finalStatus: 'read', messageCount: 1 })
  })
  it('applies a receipt arriving before its message', async () => {
    expect(await scenario('early-receipt')).toMatchObject({ finalStatus: 'read', messageCount: 1 })
  })
  it('recovers after restart between persistence and publication', async () => {
    expect(await scenario('restart-after-persist')).toMatchObject({ persistedBeforeRestart: true, phoneCount: 1, historyCount: 1, secondScreenConverged: true, countersConverged: true })
  })
  it('resumes after disconnect with both authorized screens converged', async () => {
    expect(await scenario('sse-reconnect')).toMatchObject({ gapRecovered: true, duplicateCount: 0, bothScreensConverged: true, countersConverged: true })
  })
  it('migrates and rolls back after suspend and reconciliation with no loss or duplication', async () => {
    const result = await scenario('migration-rollback')
    expect(result).toMatchObject({ sendsSuspended: true, pendingReconciled: true, callbackVerified: true, singleActiveSender: true, rollbackCallbackVerified: true, pendingAfterRollback: 0, lostCount: 0, duplicateCount: 0, contactsPreserved: true, assignmentPreserved: true, countersPreserved: true })
    expect(Array.isArray(result.idsBefore)).toBe(true)
    expect((result.idsBefore as string[]).length).toBeGreaterThan(0)
    expect([...(result.idsAfter as string[])].sort()).toEqual([...(result.idsBefore as string[])].sort())
  })
})
