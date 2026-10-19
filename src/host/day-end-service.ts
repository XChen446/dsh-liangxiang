import { randomUUID } from 'node:crypto'
import { VOTE_COUNT_MAX, VOTE_REFILL_PER_MINUTE } from '../domain/index.ts'
import type { Clock } from '../shared/business-date.ts'
import { DEFAULT_DAY_END, parseDayEndPreferences, type DayEndPersistence, type DayEndPreferences, type DayEndState, type DayEndJob } from '../shared/day-end.ts'
import type { LiangxiangWireState, WireVoteRequest } from '../shared/wire.ts'
import { AuthoritySlot } from './authority-slot.ts'
import type { LiangHostService, VoteOutcome } from './service.ts'

const START_BEFORE_END_MS = 60_000
const STOP_BEFORE_END_MS = 5_000
const MANUAL_IDLE_MS = 2_000
const GESTURE_LEASE_MS = 5_000
const RETRY_MS = 5_000

/**
 * Time for the shared bucket to refill one full request after any spend.
 *
 * The bucket itself is not on the wire, so the interval is measured from the
 * last shot instead of read from the authority: every spend takes at least the
 * whole bucket the authority was willing to give, and one refill period later
 * it can serve a full request again. A node configured to refill faster only
 * makes this interval conservative; a slower one still cannot overrun the
 * bucket, because the authority clamps every request to what it has.
 */
export const AUTO_DUMP_PERIOD_MS = (VOTE_COUNT_MAX / VOTE_REFILL_PER_MINUTE) * 60_000

/**
 * Opt-in automatic incense, on one `enabled` preference and one manual queue.
 *
 * Two independent schedules drain the same balance without a per-stick queue:
 *
 * - The day-end window (`START_BEFORE_END_MS` .. `STOP_BEFORE_END_MS` before the
 *   business midnight) sends one persisted dump per business day. That intent is
 *   durable, so a restart replays the identical request id, and it covers any
 *   tail too small for the loop below.
 * - The intraday loop sends one ordinary dump per bucket refill period while the
 *   balance can still fill a whole request. Without it a large balance is
 *   clipped to a single `VOTE_COUNT_MAX` shot at the end of the day.
 *
 * Neither path enqueues one item per stick: the authority's own `remaining` is
 * the queue, and it is the only thing either schedule reads. The loop therefore
 * keeps no durable job — its guard is a balance, so it naturally empties at a
 * business rollover and cannot replay yesterday into today.
 */
export class DayEndService extends AuthoritySlot {
  private state: DayEndState = structuredClone(DEFAULT_DAY_END)
  private persistence: DayEndPersistence | null = null
  private settingsRevision = 0
  private mutations: Promise<void> = Promise.resolve()
  private votes: Promise<unknown> = Promise.resolve()
  private manualPending = 0
  private lastManualAt = Number.NEGATIVE_INFINITY
  private gestureUntil = 0
  private retryAt = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private loopTimer: ReturnType<typeof setTimeout> | null = null
  private loopReadyAt = 0
  private loopRunning = false
  private unsubscribe: (() => void) | null = null
  private stopped = false
  private running = false
  private scheduling = false

  constructor(inner: LiangHostService, private readonly clock: Clock,
    private readonly changingMode: () => boolean, private readonly warn: (message: string) => void) {
    super(inner)
  }

  attachDayEndPersistence(port: DayEndPersistence): void {
    this.persistence = port
    this.state = port.getDayEndState() ?? structuredClone(DEFAULT_DAY_END)
    this.settingsRevision += 1
    this.emit()
  }

  override getWireState(): LiangxiangWireState {
    const wire = super.getWireState()
    return { ...wire, revision: wire.revision + this.settingsRevision,
      dayEnd: { enabled: this.state.enabled, voteType: this.state.voteType, available: this.persistence !== null } }
  }

  async setDayEndPreferences(raw: DayEndPreferences): Promise<void> {
    const preferences = parseDayEndPreferences(raw)
    await this.save(s => ({ ...s, ...preferences }))
  }

  /** Cover the 1.5s hold before it becomes a vote request. Cancellation expires. */
  noteManualGesture(): void {
    this.gestureUntil = this.clock.now() + GESTURE_LEASE_MS
    this.schedule()
  }

  private save(change: (state: DayEndState) => DayEndState): Promise<void> {
    const run = this.mutations.then(async () => {
      if (this.persistence === null || this.stopped) throw new Error('日终设置尚未加载，请稍后重试')
      const next = change(this.state)
      await this.persistence.setDayEndState(next)
      this.state = next
      this.settingsRevision += 1
      this.emit()
    })
    this.mutations = run.catch(() => undefined)
    return run
  }

  override vote(intent: WireVoteRequest): Promise<VoteOutcome> {
    this.manualPending += 1
    this.lastManualAt = this.clock.now()
    const authority = this.current
    return this.enqueue(authority, async () => {
      const result = await authority.vote(intent)
      return { result: result.result, state: this.getWireState() }
    }).finally(() => {
      this.manualPending -= 1
      this.gestureUntil = 0
      this.lastManualAt = this.clock.now()
      this.schedule()
    })
  }

  private enqueue<T>(authority: LiangHostService, task: () => Promise<T>): Promise<T> {
    const run = this.votes.then(() => {
      if (this.stopped || this.current !== authority || this.changingMode()) throw new Error('上香模式已切换，请重试')
      return task()
    })
    this.votes = run.catch(() => undefined)
    return run
  }

  startDayEnd(): () => void {
    this.unsubscribe?.()
    this.unsubscribe = this.subscribe(() => this.schedule())
    this.schedule()
    return () => this.stopDayEnd()
  }

  private schedule(): void {
    if (this.scheduling) return
    this.scheduling = true
    try {
      this.updateDayEndSchedule()
      this.updateAutoDumpSchedule()
    } finally { this.scheduling = false }
  }

  private updateDayEndSchedule(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    if (this.stopped || this.running || !this.state.enabled || this.persistence === null || !this.isReady) return
    const timing = this.current.dayEndTiming?.()
    if (timing == null) return
    const wire = this.getWireState()
    const mode = wire.authorityMode === 'LOCAL_FAKE_DEV' ? 'local' : 'online'
    const done = this.state.jobs[mode]?.businessDate === timing.businessDate && this.state.jobs[mode]?.done
    let delay = Math.max(0, timing.endsAt - START_BEFORE_END_MS - timing.now)
    if (done || timing.now >= timing.endsAt - STOP_BEFORE_END_MS) delay = Math.max(RETRY_MS, timing.endsAt - timing.now + 1_000)
    else if (!wire.authorityAvailable || this.changingMode() || this.manualPending > 0) delay = Math.max(delay, RETRY_MS)
    delay = Math.max(delay, this.retryAt - this.clock.now(), this.gestureUntil - this.clock.now(), this.lastManualAt + MANUAL_IDLE_MS - this.clock.now())
    this.timer = setTimeout(() => { this.timer = null; void this.runDayEnd() }, delay)
  }

  private updateAutoDumpSchedule(): void {
    if (this.loopTimer !== null) clearTimeout(this.loopTimer)
    this.loopTimer = null
    if (this.stopped || this.loopRunning || !this.state.enabled || this.persistence === null || !this.isReady) return
    const wire = this.getWireState()
    if (!wire.authorityAvailable || this.changingMode()) return
    if (wire.personal.remainingIncense < VOTE_COUNT_MAX) {
      // Below one full request the loop has nothing worthwhile to send; the
      // day-end shot is the only schedule that runs outside that guard, so it
      // is what covers a small tail. Disarm rather than poll.
      this.loopReadyAt = 0
      return
    }
    // First time the guard holds, start measuring the refill period. Every
    // later round is re-armed from the shot itself in `runAutoDump`.
    if (this.loopReadyAt === 0) this.loopReadyAt = this.clock.now() + AUTO_DUMP_PERIOD_MS
    const idleUntil = Math.max(this.gestureUntil, this.lastManualAt + MANUAL_IDLE_MS)
    let delay = Math.max(0, this.loopReadyAt - this.clock.now(), idleUntil - this.clock.now())
    if (this.manualPending > 0) delay = Math.max(delay, RETRY_MS)
    this.loopTimer = setTimeout(() => { this.loopTimer = null; void this.runAutoDump() }, delay)
  }

  private inWindow(authority: LiangHostService): boolean {
    const timing = authority.dayEndTiming?.()
    return !this.stopped && this.state.enabled && this.current === authority && !this.changingMode()
      && timing != null && timing.now >= timing.endsAt - START_BEFORE_END_MS
      && timing.now < timing.endsAt - STOP_BEFORE_END_MS
  }

  private canPrepareVote(authority: LiangHostService): boolean {
    return this.manualPending === 0
      && this.clock.now() >= Math.max(this.gestureUntil, this.lastManualAt + MANUAL_IDLE_MS)
      && this.inWindow(authority)
  }

  /** Same manual precedence as the day-end shot, but no day boundary at all. */
  private canPrepareAutoDump(authority: LiangHostService): boolean {
    return !this.stopped && this.state.enabled && this.current === authority && !this.changingMode()
      && this.manualPending === 0
      && this.clock.now() >= Math.max(this.gestureUntil, this.lastManualAt + MANUAL_IDLE_MS)
  }

  private async runDayEnd(): Promise<void> {
    if (this.running || !this.inWindow(this.current)) { this.schedule(); return }
    this.running = true
    const authority = this.current
    try {
      await this.enqueue(authority, async () => {
        if (!this.canPrepareVote(authority)) return
        await authority.refreshNow?.()
        if (!this.canPrepareVote(authority)) return
        const wire = authority.getWireState()
        if (!wire.authorityAvailable) return
        const mode = wire.authorityMode === 'LOCAL_FAKE_DEV' ? 'local' : 'online'
        let job = this.state.jobs[mode]
        if (job?.businessDate !== wire.businessDate) {
          const count = Math.min(VOTE_COUNT_MAX, wire.personal.remainingIncense)
          if (count < 1) { this.retryAt = this.clock.now() + RETRY_MS; return }
          job = { businessDate: wire.businessDate, caseId: wire.activeCase.id,
            requestId: randomUUID(), voteType: this.state.voteType, count, done: false }
          const prepared = job
          // Persist the exact intent BEFORE sending. Restart/uncertain retry
          // reuses its ID, direction, case and count, even if preferences change.
          await this.save(s => ({ ...s, jobs: { ...s.jobs, [mode]: prepared } }))
        }
        if (job.done || !this.canPrepareVote(authority)) return
        const outcome = await authority.vote({ caseId: job.caseId, voteType: job.voteType, requestId: job.requestId, count: job.count })
        if (outcome.result.status === 'accepted' || outcome.result.status === 'rejected') {
          const completed: DayEndJob = { ...job, done: true }
          await this.save(s => ({ ...s, jobs: { ...s.jobs, [mode]: completed } }))
        }
      })
    } catch {
      // No private request/identity/transport details in diagnostics.
      this.warn('[dsh-liangxiang] day-end incense paused; the same intent may retry before day close')
      this.retryAt = this.clock.now() + RETRY_MS
    } finally {
      this.running = false
      this.schedule()
    }
  }

  /**
   * One intraday dump. No durable intent: the next round re-reads the
   * authoritative balance, so a lost response costs at most one extra shot and
   * can never replay yesterday or double-count one intent.
   */
  private async runAutoDump(): Promise<void> {
    if (this.stopped || !this.state.enabled) { this.schedule(); return }
    this.loopRunning = true
    const authority = this.current
    let attempted = false
    try {
      await this.enqueue(authority, async () => {
        if (!this.canPrepareAutoDump(authority)) return
        await authority.refreshNow?.()
        if (!this.canPrepareAutoDump(authority)) return
        const wire = authority.getWireState()
        if (!wire.authorityAvailable) return
        const count = Math.min(VOTE_COUNT_MAX, wire.personal.remainingIncense)
        if (count < 1) return
        attempted = true
        await authority.vote({ caseId: wire.activeCase.id, voteType: this.state.voteType, requestId: randomUUID(), count })
      })
    } catch {
      this.warn('[dsh-liangxiang] intraday incense paused; the next attempt waits one refill period')
    } finally {
      // Reset on the attempt, not on its outcome. Accepted, partially accepted
      // and rate-limited shots all leave the bucket empty, so the next full
      // request is one refill period away either way — no 429 special case.
      if (attempted) this.loopReadyAt = this.clock.now() + AUTO_DUMP_PERIOD_MS
      this.loopRunning = false
      this.schedule()
    }
  }

  private stopDayEnd(): void {
    this.stopped = true
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    if (this.loopTimer !== null) clearTimeout(this.loopTimer)
    this.loopTimer = null
  }

  override dispose(): void { this.stopDayEnd(); super.dispose() }
}
