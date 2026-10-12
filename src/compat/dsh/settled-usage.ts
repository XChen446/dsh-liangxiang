/**
 * Final provider usage per billed request attempt. Audited: DSH alpha.5
 * db6bdc3576, token-meter/usage-projection.ts, turn-usage.ts, session/types.ts
 * and llm-retry/types.ts. No message content is copied or persisted here.
 * Chunk samples replace one another; a final message replaces the chunk;
 * A final message closes a successful attempt immediately (without waiting
 * for its tools). step/end or llm/retry closes a failed/interrupted attempt.
 */
export interface SettledRequestUsage {
  startOffset: number
  endOffset: number
  endedAt: number
  provider: string | null
  model: string | null
  inputTokens: number
  outputTokens: number
}

export interface SettledUsageBatch {
  kind: 'settled-requests'
  throughOffset: number
  requests: readonly SettledRequestUsage[]
}

export interface DshUsageEvent {
  readonly seq: number
  readonly time: number
  readonly type: string
  readonly data: unknown
}

function record(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null
}

function count(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0
}

function id(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 && raw.length <= 160 ? raw : null
}

function route(raw: unknown): { provider: string | null, model: string | null } {
  const value = record(raw)
  return { provider: id(value?.provider), model: id(value?.model) }
}

function usage(raw: unknown): { inputTokens: number, outputTokens: number } | null {
  const value = record(raw)
  if (value === null || !count(value.inputTokens) || !count(value.outputTokens)) return null
  const read = value.cacheReadTokens ?? 0
  const write = value.cacheWriteTokens ?? 0
  if (!count(read) || !count(write)) return null
  const inputTokens = value.inputTokens + read + write
  if (!count(inputTokens) || !count(inputTokens + value.outputTokens)) return null
  // reasoningTokens is already included in output, exactly like tokenUsage.
  return { inputTokens, outputTokens: value.outputTokens }
}

export function isSettledUsageBatch(raw: unknown): raw is SettledUsageBatch {
  const value = record(raw)
  if (value?.kind !== 'settled-requests' || !count(value.throughOffset) || !Array.isArray(value.requests)) return false
  let previousEnd = 0
  return value.requests.every(rawRequest => {
    const request = record(rawRequest)
    if (request === null || !count(request.startOffset) || !count(request.endOffset)
      || request.startOffset > request.endOffset || request.endOffset <= previousEnd
      || request.endOffset > (value.throughOffset as number)
      || !count(request.endedAt) || !count(request.inputTokens) || !count(request.outputTokens)
      || !count(request.inputTokens + request.outputTokens)
      || (request.provider !== null && id(request.provider) === null)
      || (request.model !== null && id(request.model) === null)) return false
    previousEnd = request.endOffset
    return true
  })
}

/** O(1) metadata per live session; never retains the log or message bodies. */
export class RequestUsageSettler {
  private currentRoute = route(null)
  private attempt: {
    turn: number, step: number, startOffset: number,
    route: { provider: string | null, model: string | null },
    sample: { inputTokens: number, outputTokens: number } | null,
    sampled: boolean,
  } | null = null
  throughOffset = 0

  consume(event: DshUsageEvent): SettledRequestUsage | null {
    if (!count(event.seq) || event.seq + 1 <= this.throughOffset) return null
    this.throughOffset = event.seq + 1
    const data = record(event.data)
    if (data === null) return null
    if (event.type === 'request/header') {
      this.currentRoute = route(record(data.header)?.config)
      if (this.attempt !== null && !this.attempt.sampled) this.attempt.route = this.currentRoute
    } else if (event.type === 'request/context') {
      this.currentRoute = route(data)
      if (this.attempt !== null && !this.attempt.sampled) this.attempt.route = this.currentRoute
    } else if ((event.type === 'step/start' || event.type === 'llm/retry-started') && count(data.turn) && count(data.step)) {
      this.attempt = {
        turn: data.turn, step: data.step, startOffset: event.seq + 1,
        route: this.currentRoute, sample: null, sampled: false,
      }
    } else if (this.attempt !== null && this.attempt.turn === data.turn && this.attempt.step === data.step) {
      if (event.type === 'assistant/chunk') {
        const chunk = record(data.chunk)
        if (chunk?.type === 'usage') {
          this.attempt.sample = usage(chunk.usage)
          this.attempt.sampled = true
        }
      } else if (event.type === 'assistant/message') {
        if (data.usage !== undefined) {
          this.attempt.sample = usage(data.usage)
          this.attempt.sampled = true
        }
        const source = route(record(data.message)?.source)
        if (source.model !== null) this.attempt.route = source
        return this.close(event)
      } else if (event.type === 'step/end' || event.type === 'llm/retry') {
        return this.close(event)
      }
    }
    return null
  }

  private close(event: DshUsageEvent): SettledRequestUsage | null {
    const closed = this.attempt
    this.attempt = null
    if (closed?.sample === null || closed === null || !count(event.time)) return null
    return {
      startOffset: closed.startOffset, endOffset: event.seq + 1,
      endedAt: event.time, ...closed.route, ...closed.sample,
    }
  }
}
