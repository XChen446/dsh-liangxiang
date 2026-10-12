import { createRequire } from 'node:module'
import type { DshSessionRef } from '../../src/compat/dsh/host-services.ts'
import type { DshUsageEvent } from '../../src/compat/dsh/settled-usage.ts'
import type { DshTokenUsageBuckets } from '../../src/compat/dsh/token-usage.ts'

// Resolve the exact in-box packages belonging to the pinned DSH installation.
// No additional dependency or handwritten copy of its usage fold is involved.
const require = createRequire(import.meta.url)
const dshRequire = createRequire(require.resolve('@deepseek-ai/dsh/package.json'))

export interface NativeUsageSession extends DshSessionRef {
  append(type: string, data: unknown, opts?: { surfaceOp: 'append' }): DshUsageEvent
  snapshotEvents(): readonly DshUsageEvent[]
}

interface UsageUnit {
  key: string
  init(): unknown
  apply(state: unknown, event: DshUsageEvent): unknown
  wire: { view(state: unknown): DshTokenUsageBuckets }
}

const sessionModule = await import(dshRequire.resolve('@deepseek-ai/dsh-session')) as {
  Session: { create(id: string, seed?: readonly DshUsageEvent[]): NativeUsageSession },
}
const meterModule = await import(dshRequire.resolve('@deepseek-ai/dsh-token-meter')) as {
  TokenMeter: new (ctx: unknown) => unknown,
}
const cordisModule = await import(dshRequire.resolve('@deepseek-ai/cordis')) as {
  Context: new () => { sessionProjections: { register(unit: UsageUnit): void } },
}

export function nativeUsageSession(id = 'liangxiang-usage-test', seed?: readonly DshUsageEvent[]): NativeUsageSession {
  return sessionModule.Session.create(id, seed)
}

/** Capture the production DSH tokenUsage definition via its public registration. */
export function nativeUsageFold(events: readonly DshUsageEvent[]): DshTokenUsageBuckets {
  const ctx = new cordisModule.Context()
  const units: UsageUnit[] = []
  ctx.sessionProjections = { register: unit => { units.push(unit) } }
  new meterModule.TokenMeter(ctx)
  const unit = units.find(item => item.key === 'tokenUsage')
  if (unit === undefined) throw new Error('pinned DSH did not register tokenUsage')
  let state = unit.init()
  for (const event of events) state = unit.apply(state, event)
  return unit.wire.view(state)
}

export function sample(inputTokens: number, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0) {
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens }
}

export function finalMessage(usage: ReturnType<typeof sample> | undefined, model = 'deepseek-flash', provider = 'deepseek-official', step = 1) {
  return {
    turn: 1, step,
    message: { id: `liangxiang-message-${step}`, role: 'assistant', content: [{ type: 'text', text: 'mock' }], source: { kind: 'model', provider, model } },
    ...(usage === undefined ? {} : { usage }),
  }
}
