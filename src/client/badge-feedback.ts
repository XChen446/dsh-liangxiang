import { BADGE_SIZE, type BadgePoint, type Viewport } from './badge-position.ts'

export interface FeedbackRect extends BadgePoint { width: number, height: number }
export interface FeedbackPlacement extends BadgePoint { align: 'start' | 'center' | 'end' }
const GAP = 10
const MARGIN = 8

function overlaps(a: FeedbackRect, b: FeedbackRect): boolean {
  return a.x < b.x + b.width + GAP && a.x + a.width + GAP > b.x
    && a.y < b.y + b.height + GAP && a.y + a.height + GAP > b.y
}

/** Center by default; clamp only at a real edge, then seek space outside the panel. */
export function placeBadgeFeedback(
  badge: BadgePoint,
  viewport: Viewport,
  width: number,
  height: number,
  panel: FeedbackRect | null = null,
): FeedbackPlacement | null {
  const centered = badge.x + BADGE_SIZE / 2 - width / 2
  const x = Math.max(MARGIN, Math.min(viewport.width - MARGIN - width, centered))
  const besideY = Math.max(MARGIN, Math.min(viewport.height - MARGIN - height, badge.y + BADGE_SIZE / 2 - height / 2))
  const candidates: BadgePoint[] = [
    { x, y: badge.y + BADGE_SIZE + GAP },
    { x, y: badge.y - GAP - height },
  ]
  if (panel !== null) candidates.push(
    { x: panel.x + panel.width + GAP, y: besideY },
    { x: panel.x - width - GAP, y: besideY },
    { x, y: panel.y - height - GAP },
    { x, y: panel.y + panel.height + GAP },
  )
  const point = candidates.find(candidate => {
    const rect = { ...candidate, width, height }
    return candidate.x >= MARGIN && candidate.y >= MARGIN
      && candidate.x + width <= viewport.width - MARGIN
      && candidate.y + height <= viewport.height - MARGIN
      && !overlaps(rect, { ...badge, width: BADGE_SIZE, height: BADGE_SIZE })
      && (panel === null || !overlaps(rect, panel))
  })
  if (point === undefined) return null
  return { ...point, align: point.x > centered ? 'start' : point.x < centered ? 'end' : 'center' }
}
