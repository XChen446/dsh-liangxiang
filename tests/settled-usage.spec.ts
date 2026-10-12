import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachUsageObservation } from '../src/compat/dsh/usage-observer.ts'
import { RequestUsageSettler, isSettledUsageBatch, type DshUsageEvent, type SettledUsageBatch } from '../src/compat/dsh/settled-usage.ts'
import type { DshSessionEventSource, DshSessionProjections, DshSessionRef } from '../src/compat/dsh/host-services.ts'
import { UsageProjection } from '../src/host/usage-projection.ts'
import { createBusinessDateProvider } from '../src/shared/business-date.ts'
import { DEFAULT_INCENSE_WEIGHT_POLICY, incenseWeightRows } from '../src/domain/index.ts'
import { nativeUsageSession, nativeUsageFold, sample, finalMessage } from './helpers/dsh-usage.ts'

const now = Date.UTC(2026, 9, 12, 4)
const date = '2026-10-12'
const clock = { now: () => now }
const sink = { putWatermark: () => undefined, putDailyUsage: () => undefined, deleteDailyUsage: () => undefined }
const projection = () => new UsageProjection({ clock, dates: createBusinessDateProvider('Asia/Shanghai'), warn: () => undefined })
const projections: DshSessionProjections = { snapshot: () => ({ asOfSeq: -1, values: {} }), onChanged: () => () => undefined }
beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(now) })
afterEach(() => { vi.restoreAllMocks() })

function feed(initial: readonly DshSessionRef[] = [], usage = projection()) {
  let listener: ((session: DshSessionRef, event: DshUsageEvent) => void) | null = null
  const source: DshSessionEventSource = { on: (_name, callback) => {
    listener = callback
    return () => { listener = null }
  } }
  const batches: SettledUsageBatch[] = []
  const dispose = attachUsageObservation(projections, { list: () => [...initial] }, (id, batch, origin) => {
    expect(isSettledUsageBatch(batch)).toBe(true)
    batches.push(batch as SettledUsageBatch)
    usage.observe(id, batch, origin)
  }, source)
  return { usage, batches, dispose, append(session: ReturnType<typeof nativeUsageSession>, type: string, data: unknown) {
    const event = type === 'assistant/message' ? session.append(type, data, { surfaceOp: 'append' }) : session.append(type, data)
    listener?.(session, event)
    return event
  } }
}

describe('real pinned DSH request settlement', () => {
  it('does not mint a high chunk; final lower usage and all cache buckets match the real tokenUsage fold', () => {
    const session = nativeUsageSession()
    const f = feed([session])
    f.append(session, 'step/start', { turn: 1, step: 1 })
    f.append(session, 'request/context', { provider: 'deepseek-official', model: 'deepseek-flash' })
    f.append(session, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'usage', usage: sample(100_000, 20_000) } })
    expect(f.usage.effectiveTokensFor(date)).toBe(0)
    f.append(session, 'assistant/message', finalMessage(sample(10_000, 15_000, 20_000, 5_000)))
    expect(f.usage.effectiveTokensFor(date)).toBe(50_000) // tools need not finish first
    f.append(session, 'step/end', { turn: 1, step: 1 })
    expect(nativeUsageFold(session.snapshotEvents())).toEqual({ uncachedInputTokens: 10_000, outputTokens: 15_000, cacheReadTokens: 20_000, cacheWriteTokens: 5_000 })
    expect(f.usage.effectiveTokensFor(date)).toBe(50_000)
    f.dispose()
  })

  it('keeps each billed retry once and does not invent a cancelled scheduled retry', () => {
    const session = nativeUsageSession()
    const f = feed([session])
    f.append(session, 'step/start', { turn: 1, step: 1 })
    f.append(session, 'request/context', { provider: 'deepseek-official', model: 'deepseek-flash' })
    f.append(session, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'usage', usage: sample(50_000) } })
    f.append(session, 'llm/retry', { turn: 1, step: 1 })
    expect(f.usage.effectiveTokensFor(date)).toBe(50_000)
    f.append(session, 'llm/retry-started', { turn: 1, step: 1, retry: 1 })
    f.append(session, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'usage', usage: sample(100_000) } })
    f.append(session, 'assistant/message', finalMessage(sample(40_000)))
    f.append(session, 'step/end', { turn: 1, step: 1 })
    expect(nativeUsageFold(session.snapshotEvents()).uncachedInputTokens).toBe(90_000)
    expect(f.usage.effectiveTokensFor(date)).toBe(90_000)
    const once = f.batches.at(-1)
    f.usage.observe(session.id, once, { kind: 'live', firstLiveSeq: 0 })
    expect(f.usage.effectiveTokensFor(date)).toBe(90_000)
    f.dispose()
  })

  it('attributes mixed requests to their own source even if the latest route changes', () => {
    const session = nativeUsageSession()
    const f = feed([session])
    f.append(session, 'step/start', { turn: 1, step: 1 })
    f.append(session, 'request/context', { provider: 'third-party', model: 'deepseek-v4-flash' })
    f.append(session, 'assistant/message', finalMessage(sample(100_000), 'deepseek-v4-flash', 'third-party'))
    f.append(session, 'request/context', { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    f.append(session, 'step/end', { turn: 1, step: 1 })
    f.append(session, 'step/start', { turn: 1, step: 2 })
    f.append(session, 'assistant/message', finalMessage(sample(50_000), 'deepseek-v4-pro', 'deepseek-official', 2))
    f.append(session, 'step/end', { turn: 1, step: 2 })
    expect(f.usage.effectiveTokensFor(date)).toBe(100_000)
    f.dispose()
  })

  it('baselines legacy history and an in-flight attempt, then credits only new work', () => {
    const session = nativeUsageSession()
    session.append('step/start', { turn: 1, step: 1 })
    session.append('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'usage', usage: sample(100_000) } })
    const f = feed([session])
    f.append(session, 'assistant/message', finalMessage(sample(80_000)))
    f.append(session, 'step/end', { turn: 1, step: 1 })
    expect(f.usage.effectiveTokensFor(date)).toBe(0)
    f.append(session, 'step/start', { turn: 1, step: 2 })
    f.append(session, 'assistant/message', finalMessage(sample(50_000), 'deepseek-flash', 'deepseek-official', 2))
    f.append(session, 'step/end', { turn: 1, step: 2 })
    expect(f.usage.effectiveTokensFor(date)).toBe(50_000)
    f.dispose()
  })

  it('resumes from the persisted settlement cursor without repricing or replaying credit', () => {
    const session = nativeUsageSession()
    const usage = projection()
    const watermarks = new Map()
    const daily = new Map()
    usage.hydrate(watermarks, daily, { ...sink, putWatermark: (id, row) => watermarks.set(id, row), putDailyUsage: (day, row) => daily.set(day, row) })
    const f = feed([session], usage)
    f.append(session, 'step/start', { turn: 1, step: 1 })
    f.append(session, 'assistant/message', finalMessage(sample(50_000)))
    f.append(session, 'step/end', { turn: 1, step: 1 })
    f.dispose()
    const restored = projection()
    restored.hydrate(watermarks, daily, sink)
    const resumed = feed([session], restored)
    expect(restored.effectiveTokensFor(date)).toBe(50_000)
    resumed.append(session, 'step/start', { turn: 1, step: 2 })
    resumed.append(session, 'assistant/message', finalMessage(sample(50_000), 'deepseek-flash', 'deepseek-official', 2))
    resumed.append(session, 'step/end', { turn: 1, step: 2 })
    expect(restored.effectiveTokensFor(date)).toBe(100_000)
    resumed.dispose()
  })

  it('does not count an unmatched final sample without a request lifecycle', () => {
    const fold = new RequestUsageSettler()
    expect(fold.consume({ seq: 0, time: now, type: 'assistant/message', data: finalMessage(sample(50_000)) })).toBeNull()
    expect(fold.consume({ seq: 1, time: now, type: 'step/end', data: { turn: 1, step: 1 } })).toBeNull()
  })

  it('does not mint an inherited fork prefix, but credits its own new request', () => {
    const parent = nativeUsageSession('parent')
    parent.append('step/start', { turn: 1, step: 1 })
    parent.append('assistant/message', finalMessage(sample(50_000)), { surfaceOp: 'append' })
    parent.append('step/end', { turn: 1, step: 1 })
    const fork = nativeUsageSession('fork', parent.snapshotEvents())
    const f = feed()
    f.append(fork, 'step/start', { turn: 1, step: 2 })
    f.append(fork, 'assistant/message', finalMessage(sample(50_000), 'deepseek-flash', 'deepseek-official', 2))
    expect(f.usage.effectiveTokensFor(date)).toBe(50_000)
    f.dispose()
  })

  it('does not mint a scheduled retry that never starts, and keeps final usage when cancelled', () => {
    const session = nativeUsageSession()
    const f = feed([session])
    f.append(session, 'step/start', { turn: 1, step: 1 })
    f.append(session, 'request/context', { provider: 'deepseek-official', model: 'deepseek-flash' })
    f.append(session, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'usage', usage: sample(50_000) } })
    f.append(session, 'llm/retry', { turn: 1, step: 1 })
    f.append(session, 'step/end', { turn: 1, step: 1 })
    expect(f.usage.effectiveTokensFor(date)).toBe(50_000)
    f.dispose()
  })

  it('keeps the last provider sample when the final message has no new usage', () => {
    const session = nativeUsageSession()
    const f = feed([session])
    f.append(session, 'step/start', { turn: 1, step: 1 })
    f.append(session, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'usage', usage: sample(50_000) } })
    f.append(session, 'assistant/message', finalMessage(undefined))
    expect(f.usage.effectiveTokensFor(date)).toBe(50_000)
    expect(nativeUsageFold(session.snapshotEvents()).uncachedInputTokens).toBe(50_000)
    f.dispose()
  })
})

describe('remote rules and pinned daily accounting', () => {
  const batch = (startOffset: number, endOffset: number): SettledUsageBatch => ({ kind: 'settled-requests', throughOffset: endOffset, requests: [{ startOffset, endOffset, endedAt: now, provider: 'deepseek-official', model: 'deepseek-v4.2-flash', inputTokens: 50_000, outputTokens: 0 }] })

  it('receives a new model rule as data, keeps the same-day policy, and derives the tooltip from it', () => {
    const usage = projection()
    usage.observe('s', batch(1, 4), { kind: 'live', firstLiveSeq: 0 })
    expect(usage.effectiveTokensFor(date)).toBe(50_000)
    usage.adoptWeightPolicy({ ...DEFAULT_INCENSE_WEIGHT_POLICY, revision: 4, version: 'operator-v4', rules: [{ label: 'Flash 调整', model: 'deepseek-*-flash', weightBps: 5_000 }] })
    usage.observe('s', batch(5, 8), { kind: 'live', firstLiveSeq: 0 })
    expect(usage.effectiveTokensFor(date)).toBe(100_000)
    expect(usage.weightPolicyFor(date).revision).toBe(3)
    expect(usage.weightPolicyFor('2026-10-13').revision).toBe(4)
    expect(incenseWeightRows(usage.weightPolicyFor('2026-10-13'), 50_000)).toContainEqual({ model: 'Flash 调整', weight: '×0.5', stick: '100,000 Token = 1 炷' })
  })

  it('keeps valid cached rules after a reused revision or malformed rule', () => {
    const usage = projection()
    usage.adoptWeightPolicy({ ...DEFAULT_INCENSE_WEIGHT_POLICY, rules: [] })
    usage.adoptWeightPolicy({ revision: 99, rules: 'bad' })
    expect(usage.weightPolicyFor(date)).toEqual(DEFAULT_INCENSE_WEIGHT_POLICY)
  })

  it('does not credit the same attempt on both sides of a mode switch', () => {
    const watermarks = new Map()
    const online = projection()
    online.hydrate(watermarks, new Map(), { ...sink, putWatermark: (id, row) => watermarks.set(id, row) })
    online.observe('shared', batch(1, 4), { kind: 'live', firstLiveSeq: 0 })
    const offline = projection()
    offline.hydrate(watermarks, new Map(), sink)
    offline.observe('shared', batch(1, 4), { kind: 'catchup' })
    expect(offline.effectiveTokensFor(date)).toBe(0)
    offline.observe('shared', batch(5, 8), { kind: 'live', firstLiveSeq: 0 })
    expect(offline.effectiveTokensFor(date)).toBe(50_000)
    expect(online.effectiveTokensFor(date)).toBe(50_000)
  })

  it('does not put missed yesterday usage into today during restart catch-up', () => {
    const usage = projection()
    usage.hydrate(new Map([['s', { inputHwm: 0, outputHwm: 0, settledOffset: 0, baselineOffset: 0 }]]), new Map(), sink)
    const missed = batch(1, 4)
    missed.requests = missed.requests.map(request => ({ ...request, endedAt: now - 86_400_000 }))
    usage.observe('s', missed, { kind: 'catchup' })
    expect(usage.effectiveTokensFor(date)).toBe(0)
    usage.observe('s', missed, { kind: 'live', firstLiveSeq: 0 })
    expect(usage.effectiveTokensFor(date)).toBe(0)
  })

  it('uses the backend business timezone for replay dates even when the Host started in another timezone', () => {
    const usage = projection()
    usage.setBusinessDates(createBusinessDateProvider('UTC'))
    usage.hydrate(new Map([['s', { inputHwm: 0, outputHwm: 0, settledOffset: 0, baselineOffset: 0 }]]), new Map(), sink)
    const request = batch(1, 4)
    request.requests = request.requests.map(row => ({ ...row, endedAt: Date.UTC(2026, 9, 12, 17) }))
    usage.setBusinessDates(createBusinessDateProvider('Asia/Shanghai'))
    usage.observe('s', request, { kind: 'catchup' }, undefined, '2026-10-13')
    expect(usage.effectiveTokensFor('2026-10-13')).toBe(50_000)
  })

  it('persists a future rule without activating early and restores it offline', () => {
    const saved: unknown[] = []
    const usage = projection()
    usage.hydrate(new Map(), new Map(), { ...sink, putWeightPolicies: rows => { saved.push(rows) } })
    usage.adoptWeightPolicy({ ...DEFAULT_INCENSE_WEIGHT_POLICY, revision: 4, version: 'future-rule', effectiveFrom: '2026-10-13' })
    expect(usage.weightPolicyFor(date).revision).toBe(3)
    const restored = projection()
    restored.hydrate(new Map(), new Map(), sink, saved.at(-1) as typeof DEFAULT_INCENSE_WEIGHT_POLICY[])
    expect(restored.weightPolicyFor('2026-10-13').revision).toBe(4)
  })

  it('restores an operator active rule even when the persisted cache lists a future revision first', () => {
    const usage = projection()
    const active = { ...DEFAULT_INCENSE_WEIGHT_POLICY, revision: 4, version: 'active-rule' }
    const future = { ...DEFAULT_INCENSE_WEIGHT_POLICY, revision: 5, version: 'future-rule', effectiveFrom: '2026-10-13' }
    usage.adoptWeightPolicy(future) // bootstrap can beat storage hydration
    usage.hydrate(new Map(), new Map(), sink, [future, active])
    expect(usage.weightPolicyFor(date).version).toBe('active-rule')
    expect(usage.weightPolicyFor('2026-10-13').version).toBe('future-rule')
  })
})
