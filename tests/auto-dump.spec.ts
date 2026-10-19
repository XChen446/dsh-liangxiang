import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeAuthoritativeLiangService } from '../src/host/fake-service.ts'
import { AUTO_DUMP_PERIOD_MS, DayEndService } from '../src/host/day-end-service.ts'
import { VOTE_COUNT_MAX } from '../src/domain/index.ts'
import { DEFAULT_DAY_END, type DayEndState, type DayEndPersistence } from '../src/shared/day-end.ts'
import type { LiangHostService } from '../src/host/service.ts'

/** 11:00 Asia/Shanghai — mid-business-day, nowhere near the day-end window. */
const midday = Date.UTC(2026, 9, 19, 3, 0, 0)
/** 23:00 Asia/Shanghai — one hour before the 23:59 window, so both schedules run. */
const lateEvening = Date.UTC(2026, 9, 19, 15, 0, 0)
const live = new Set<DayEndService>()
afterEach(() => { for (const service of live) service.dispose(); live.clear(); vi.useRealTimers(); vi.restoreAllMocks() })

function setup(enabled = true, remaining = 0, start = midday) {
  vi.useFakeTimers()
  vi.setSystemTime(start)
  const clock = { now: () => Date.now() }
  const inner = new FakeAuthoritativeLiangService({ timezone: 'Asia/Shanghai', tokenPerIncense: 50_000,
    snapshotRefreshSeconds: 1, seed: 'empty', caseTitle: '日间自动倾炉测试', starterIncense: 0 }, clock, () => undefined)
  inner.markReadyMemoryOnly('test')
  if (remaining > 0) inner.creditSimulatedUsage(remaining * 50_000)
  let state: DayEndState = { ...structuredClone(DEFAULT_DAY_END), enabled }
  const persistence: DayEndPersistence = {
    getDayEndState: () => structuredClone(state),
    setDayEndState: vi.fn(async next => { state = structuredClone(next) }),
  }
  let changing = false
  const service = new DayEndService(inner, clock, () => changing, () => undefined)
  live.add(service)
  service.attachDayEndPersistence(persistence)
  service.startDayEnd()
  return { inner, service, persistence, state: () => state, changing: (value: boolean) => { changing = value } }
}

describe('intraday automatic dump', () => {
  it('stays off, and stays quiet below one full request, while the switch is off', async () => {
    const off = setup(false, 1_500)
    const offVote = vi.spyOn(off.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS * 3)
    expect(offVote).not.toHaveBeenCalled()
  })

  it('never fires while the balance cannot fill one whole request', async () => {
    const s = setup(true, VOTE_COUNT_MAX - 1)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS * 3)
    expect(vote).not.toHaveBeenCalled()
    expect(s.inner.getWireState().personal.remainingIncense).toBe(VOTE_COUNT_MAX - 1)
  })

  it('sends one full request per refill period instead of looping over sticks', async () => {
    const s = setup(true, 1_500)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS)
    expect(vote).toHaveBeenCalledTimes(1)
    expect(vote.mock.calls[0]?.[0]).toMatchObject({ count: VOTE_COUNT_MAX, voteType: 'up' })
    // The bucket refill period is the whole pacing rule: nothing fires earlier.
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS - 1)
    expect(vote).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(vote).toHaveBeenCalledTimes(2)
  })

  it('keeps no durable job: the authoritative balance is the queue', async () => {
    const s = setup(true, 1_500)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS * 2)
    expect(vote).toHaveBeenCalledTimes(2)
    // The day-end receipt is the only durable intent; the loop writes nothing,
    // so a restart cannot replay or double count an intraday shot.
    expect(s.state().jobs).toEqual({})
  })

  it('gives active manual work priority and honours the 2s quiet window', async () => {
    const s = setup(true, 1_500)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS - 1_000)
    expect(vote).not.toHaveBeenCalled()
    await s.service.vote({ caseId: s.inner.getWireState().activeCase.id, voteType: 'down', requestId: 'manual-one', count: 1 })
    expect(vote).toHaveBeenCalledTimes(1)
    // Due now, but the manual shot landed 1s ago: the loop must wait it out.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(vote).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_001)
    expect(vote).toHaveBeenCalledTimes(2)
    expect(vote.mock.calls[1]?.[0]).toMatchObject({ voteType: 'up' })
  })

  it('waits a whole refill period after a failed shot instead of retrying tightly', async () => {
    const s = setup(true, 1_500)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote').mockRejectedValueOnce(new Error('transport down'))
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS)
    expect(vote).toHaveBeenCalledTimes(1)
    // A 429 or a transport failure leaves the bucket no fuller than a success:
    // the reset is unconditional, so there is no separate error path to pace.
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS - 1)
    expect(vote).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(vote).toHaveBeenCalledTimes(2)
  })

  it('re-arms from a new balance after draining below one request', async () => {
    const s = setup(true, 1_500)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS * 3)
    const drained = vote.mock.calls.length
    expect(s.inner.getWireState().personal.remainingIncense).toBeLessThan(VOTE_COUNT_MAX)
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS * 2)
    expect(vote).toHaveBeenCalledTimes(drained)
    s.inner.creditSimulatedUsage(VOTE_COUNT_MAX * 50_000)
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS)
    expect(vote).toHaveBeenCalledTimes(drained + 1)
  })

  it('overlays the day-end shot: the loop drains the day, the window takes the tail', async () => {
    const s = setup(true, 1_500, lateEvening)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(AUTO_DUMP_PERIOD_MS * 3)
    expect(vote).toHaveBeenCalledTimes(3)
    expect(s.inner.getWireState().personal.remainingIncense).toBeLessThan(VOTE_COUNT_MAX)
    expect(s.state().jobs.local).toBeUndefined()
    // 59 minutes later the day-end window opens and sends what the loop left.
    await vi.advanceTimersByTimeAsync(59 * 60_000 - AUTO_DUMP_PERIOD_MS * 3)
    expect(vote).toHaveBeenCalledTimes(4)
    expect(vote.mock.calls[3]?.[0]).toMatchObject({ count: 450 })
    expect(s.state().jobs.local?.done).toBe(true)
    expect(s.inner.getWireState().personal.remainingIncense).toBe(0)
  })
})
