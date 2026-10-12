import type { DshSessionEventSource, DshSessionProjections, DshSessionRef, DshSessions } from './host-services.ts'
import { RequestUsageSettler, type SettledRequestUsage } from './settled-usage.ts'

/** Seed history baselines; new work settles only after its attempt closes. */
export type UsageObservationOrigin =
  | { kind: 'catchup' }
  | { kind: 'live', firstLiveSeq: number }

/**
 * Public session/event + snapshotEvents seam, alpha.5 db6bdc3576.
 * History is scanned once on attachment; normal work folds one event.
 * Logged provider usage has tokenUsage's bucket/replacement semantics, but
 * provisional samples never reach the incense ledger. Missing APIs fail closed.
 */
export function attachUsageObservation(
  _projections: DshSessionProjections,
  sessions: DshSessions,
  onUsage: (sessionId: string, value: unknown, origin: UsageObservationOrigin, modelId: string | null) => void,
  events: DshSessionEventSource,
  warn: (message: string) => void = () => undefined,
): () => void {
  const folds = new WeakMap<DshSessionRef, RequestUsageSettler>()
  const replay = (session: DshSessionRef, initial: boolean): RequestUsageSettler | null => {
    if (session.snapshotEvents === undefined) {
      warn('[dsh-liangxiang] final usage unavailable: DSH session lifecycle API is missing')
      return null
    }
    const fold = new RequestUsageSettler()
    const requests: SettledRequestUsage[] = []
    for (const event of session.snapshotEvents()) {
      const closed = fold.consume(event)
      if (closed !== null) requests.push(closed)
    }
    folds.set(session, fold)
    if (initial) {
      onUsage(session.id, { kind: 'settled-requests', throughOffset: fold.throughOffset, requests }, { kind: 'catchup' }, null)
    } else {
      onUsage(session.id, { kind: 'settled-requests', throughOffset: session.firstLiveSeq, requests: [] }, { kind: 'catchup' }, null)
      onUsage(session.id, { kind: 'settled-requests', throughOffset: fold.throughOffset, requests }, { kind: 'live', firstLiveSeq: session.firstLiveSeq }, null)
    }
    return fold
  }
  for (const session of sessions.list()) replay(session, true)
  return events.on('session/event', (session, event) => {
    const fold = folds.get(session)
    if (fold === undefined) {
      replay(session, false)
      return
    }
    const closed = fold.consume(event)
    if (closed !== null) onUsage(session.id, {
      kind: 'settled-requests', throughOffset: fold.throughOffset, requests: [closed],
    }, { kind: 'live', firstLiveSeq: session.firstLiveSeq }, null)
  })
}
