import { describe, expect, it } from 'vitest'
import { initialDshDockClearance } from '../src/compat/dsh/default-dock.ts'
import { BADGE_SIZE, defaultBadgePosition, hasSavedBadgePosition, loadBadgePosition } from '../src/client/badge-position.ts'

function documentWith(...boxes: Array<{ top: number, height: number, left?: number, width?: number }>): Document {
  return { querySelectorAll: () => boxes.map(({ top, height, left = 12, width = 256 }) => ({
    getBoundingClientRect: () => ({ top, height, left, width, bottom: top + height }),
  })) } as unknown as Document
}

describe('initial default dock compatibility', () => {
  it.each([32, 36, 44, 46])('keeps an 8px gap above a %ipx visible account control', height => {
    const top = 720 - 6 - height
    const inset = initialDshDockClearance(720, documentWith({ top, height }))!
    const point = defaultBadgePosition({ width: 1280, height: 720 }, inset)
    expect(top - point.y - BADGE_SIZE).toBe(8)
  })

  it('ignores hidden, off-frame and header controls and uses the lowest visible footer', () => {
    expect(initialDshDockClearance(720, documentWith(
      { top: 12, height: 36 }, { top: 678, height: 0 }, { top: 668, height: 46, left: -280 },
      { top: 650, height: 20 }, { top: 678, height: 36 },
    ))).toBe(50)
    expect(initialDshDockClearance(720, documentWith())).toBeNull()
  })

  it('uses measured geometry only for a fresh or corrupt point, preserving a saved user position', () => {
    const frame = { width: 1280, height: 720 }
    expect(loadBadgePosition(frame, null, 60)).toEqual(defaultBadgePosition(frame, 60))
    expect(loadBadgePosition(frame, { getItem: () => 'bad-json' }, 60)).toEqual(defaultBadgePosition(frame, 60))
    expect(loadBadgePosition(frame, { getItem: () => '{"x":40,"y":60}' }, 60)).toEqual({ x: 40, y: 60 })
    expect(hasSavedBadgePosition({ getItem: () => JSON.stringify(defaultBadgePosition(frame)) })).toBe(true)
    expect(hasSavedBadgePosition({ getItem: () => 'bad-json' })).toBe(false)
    expect(hasSavedBadgePosition(null)).toBe(false)
  })
})
