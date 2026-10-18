import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { DshSessionRef } from '../../src/compat/dsh/host-services.ts'
import type { DshUsageEvent } from '../../src/compat/dsh/settled-usage.ts'
import type { DshTokenUsageBuckets } from '../../src/compat/dsh/token-usage.ts'

// Resolve the exact in-box packages belonging to the pinned DSH installation.
// No additional dependency or handwritten copy of its usage fold is involved.
const require = createRequire(import.meta.url)
const dshRequire = createRequire(require.resolve('@deepseek-ai/dsh/package.json'))

interface DshManifest { version: string }
const dshManifest = JSON.parse(
  readFileSync(dshRequire.resolve('@deepseek-ai/dsh/package.json'), 'utf8'),
) as DshManifest

export const dshVersion = dshManifest.version

/**
 * 0.2 deletes the standalone `assistant/chunk` event and embeds each attempt's provider
 * stream in `assistant/attempt` / `assistant/message` instead. Which one a seed has to
 * speak is decided by the DSH actually installed, not by this repo's pin: the same specs
 * run against both, and a seed in the other shape is silently ignored by the fold.
 */
const [dshMajor = 0, dshMinor = 0] = dshVersion.split('.').map(part => Number.parseInt(part, 10))
export const embedsAttemptStream = dshMajor > 0 || dshMinor >= 2

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

export function finalMessage(
  usage: ReturnType<typeof sample> | undefined,
  model = 'deepseek-flash',
  provider = 'deepseek-official',
  step = 1,
  stream: readonly unknown[] = [],
) {
  return {
    turn: 1, step,
    message: { id: `liangxiang-message-${step}`, role: 'assistant', content: [{ type: 'text', text: 'mock' }], source: { kind: 'model', provider, model } },
    ...(usage === undefined ? {} : { usage }),
    // 0.2 requires the embedded stream on every seeded assistant message and reads the
    // provider sample out of it; 0.1 permits the extra field and ignores it.
    stream,
  }
}

/** One raw usage record as 0.2 embeds it inside an attempt stream. */
function usageRecord(tokens: ReturnType<typeof sample>) {
  return { type: 'chunk', time: Date.now(), chunk: { type: 'usage', usage: tokens } }
}

/**
 * A provider sample taken during an attempt that ends with no message (retry / cancel).
 * 0.1 logs it as a standalone `assistant/chunk`; 0.2 logs it inside `assistant/attempt`.
 * Spread the result into the feed: `f.append(session, ...attemptUsageEvent(...))`.
 */
export function attemptUsageEvent(turn: number, step: number, tokens: ReturnType<typeof sample>): [string, unknown] {
  if (embedsAttemptStream) return ['assistant/attempt', { turn, step, stream: [usageRecord(tokens)] }]
  return ['assistant/chunk', { turn, step, chunk: { type: 'usage', usage: tokens } }]
}

/**
 * The attempt stream of a message that supersedes an earlier sample, e.g. a prompt
 * estimate followed by the provider's final lower figure. Empty on 0.1, where that
 * earlier sample is a standalone chunk instead.
 */
export function messageStream(tokens: ReturnType<typeof sample>): readonly unknown[] {
  return embedsAttemptStream ? [usageRecord(tokens)] : []
}
