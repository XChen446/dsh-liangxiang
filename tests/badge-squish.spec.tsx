/**
 * 敲扁 toy: the tap-burst arithmetic and the label pool. The squash itself is
 * CSS, but `squishAction` is what decides whether a tap opens the panel, so the
 * "third tap and beyond is silent" contract is pinned here rather than left to
 * a browser-only visual check.
 */
import { describe, expect, it } from 'vitest'
import {
  SQUISH_COMBO_COUNT,
  SQUISH_LABELS,
  pickSquishLabel,
  squishAction,
} from '../src/client/badge-squish.ts'

describe('敲扁 tap burst', () => {
  it('keeps the panel toggle for the first taps of a burst', () => {
    expect(squishAction(1)).toBe('toggle')
    expect(squishAction(SQUISH_COMBO_COUNT - 1)).toBe('toggle')
  })

  it('swallows the toggle from the threshold tap onwards', () => {
    expect(squishAction(SQUISH_COMBO_COUNT)).toBe('label')
    expect(squishAction(SQUISH_COMBO_COUNT + 1)).toBe('silent')
    expect(squishAction(SQUISH_COMBO_COUNT + 2)).toBe('silent')
  })

  it('rotates the label on every nth tap, not only once per burst', () => {
    for (let tap = SQUISH_COMBO_COUNT; tap <= SQUISH_COMBO_COUNT * 6; tap += 1) {
      const expected = tap % SQUISH_COMBO_COUNT === 0 ? 'label' : 'silent'
      expect(squishAction(tap)).toBe(expected)
    }
  })

  it('never opens the panel once a burst has reached the threshold', () => {
    for (let tap = SQUISH_COMBO_COUNT; tap <= 60; tap += 1) {
      expect(squishAction(tap)).not.toBe('toggle')
    }
  })

  it('treats a degenerate counter as the first tap of a burst', () => {
    // A cleared burst counter arrives as 0, and a hostile/NaN value must not
    // silently wedge the toggle shut.
    expect(squishAction(0)).toBe('toggle')
    expect(squishAction(-1)).toBe('toggle')
    expect(squishAction(Number.NaN)).toBe('toggle')
  })
})

describe('敲扁 labels', () => {
  it('always returns a member of the pool', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(SQUISH_LABELS).toContain(pickSquishLabel())
    }
  })

  it('stays non-empty and short enough for a nowrap tooltip', () => {
    expect(SQUISH_LABELS.length).toBeGreaterThan(1)
    for (const label of SQUISH_LABELS) expect(label.length).toBeLessThanOrEqual(20)
  })
})
