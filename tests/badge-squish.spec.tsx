import { describe, expect, it } from 'vitest'
import { SQUISH_LABELS, pickSquishLabel } from '../src/client/badge-squish.ts'
import { placeBadgeFeedback } from '../src/client/badge-feedback.ts'

describe('badge feedback geometry', () => {
  const viewport = { width: 1200, height: 800 }
  it('centers when there is room and only aligns to an edge when needed', () => {
    expect(placeBadgeFeedback({ x: 500, y: 400 }, viewport, 180, 28)).toEqual({ x: 434, y: 458, align: 'center' })
    expect(placeBadgeFeedback({ x: 12, y: 400 }, viewport, 180, 28)).toEqual({ x: 8, y: 458, align: 'start' })
    expect(placeBadgeFeedback({ x: 1140, y: 400 }, viewport, 180, 28)).toEqual({ x: 1012, y: 458, align: 'end' })
  })
  it('sinks inside the viewport even at the bottom edge', () => {
    const result = placeBadgeFeedback({ x: 12, y: 740 }, viewport, 216, 96)!
    expect(result.y + 96).toBeLessThanOrEqual(740 - 10)
  })
  it('uses a side lane beside an open panel, or space above it on narrow screens', () => {
    const badge = { x: 12, y: 702 }
    const panel = { x: 12, y: 342, width: 256, height: 350 }
    expect(placeBadgeFeedback(badge, viewport, 216, 96, panel)).toEqual({ x: 278, y: 678, align: 'start' })
    const narrow = placeBadgeFeedback(badge, { width: 480, height: 800 }, 216, 96, panel)!
    expect(narrow.y + 96).toBeLessThanOrEqual(panel.y - 10)
  })
  it('does not put feedback over the badge/panel when no space remains', () => {
    expect(placeBadgeFeedback({ x: 12, y: 12 }, { width: 90, height: 70 }, 66, 28)).toBeNull()
  })
})

describe('badge comment copy', () => {
  it('chooses a short line without immediately repeating it', () => {
    let previous = ''
    for (let i = 0; i < 200; i += 1) {
      const line = pickSquishLabel(previous)
      expect(SQUISH_LABELS).toContain(line)
      expect(line).not.toBe(previous)
      expect(line.length).toBeLessThanOrEqual(18)
      previous = line
    }
  })
})
