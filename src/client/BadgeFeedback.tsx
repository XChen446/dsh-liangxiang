import { useLayoutEffect, useRef, useState } from 'react'
import { HOVER_TEXT } from '../shared/index.ts'
import type { BadgePoint, Viewport } from './badge-position.ts'
import { placeBadgeFeedback, type FeedbackRect } from './badge-feedback.ts'
import { SQUISH_LABEL_LINGER_MS } from './badge-squish.ts'
import { color, font } from './theme.ts'

export interface BadgeComment { id: number, text: string, createdAt: number }
interface Props {
  position: BadgePoint
  viewport: Viewport
  open: boolean
  comments: BadgeComment[]
  suppressed: boolean
  reducedMotion: boolean
}
const css = `
[data-liangxiang-badge-tooltip], [data-liangxiang-danmu-line] {
  width: max-content; max-width: 100%; box-sizing: border-box;
  padding: 5px 9px; border: 1px solid ${color.border}; border-radius: 10px;
  background: ${color.bgLayer}; color: ${color.textPrimary};
  font: 600 11px/16px ${font.family};
  overflow-wrap: anywhere;
}
[data-liangxiang-badge-tooltip] { opacity: 0; transition: opacity 100ms ease; }
[data-liangxiang-root]:has([data-liangxiang-badge]:hover, [data-liangxiang-badge]:focus-visible) [data-liangxiang-badge-tooltip][data-suppressed="false"] {
  opacity: 1; transition-delay: 280ms;
}
[data-liangxiang-root]:has([data-squish-pressed="true"]) [data-liangxiang-badge-tooltip] { opacity: 0 !important; transition-delay: 0ms; }
[data-liangxiang-danmu-row] { position: absolute; top: 0; width: 100%; transition: transform 220ms cubic-bezier(.2,.8,.2,1); }
[data-liangxiang-danmu-line] { max-width: calc(100vw - 16px); animation: liangxiang-danmu ${SQUISH_LABEL_LINGER_MS}ms both; }
@keyframes liangxiang-danmu {
  0% { opacity: 0; transform: translateY(-6px); }
  8%, 78% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(8px); }
}
[data-liangxiang-feedback][data-reduced-motion="true"] * { animation: none !important; transition: none !important; }
`

/** Cosmetic lane measured against the actual panel, including welcome/update dialogs. */
export function BadgeFeedback({ position, viewport, open, comments, suppressed, reducedMotion }: Props) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState<FeedbackRect | null>(null)
  const [tooltipWidth, setTooltipWidth] = useState(66)
  const [laneWidth, setLaneWidth] = useState(216)
  useLayoutEffect(() => {
    const root = tooltipRef.current?.closest('[data-liangxiang-root]')
    const element = open ? root?.querySelector<HTMLElement>('[data-liangxiang-panel]') : null
    const measure = (): void => {
      setPanel(element?.getBoundingClientRect() ?? null)
      const label = tooltipRef.current?.getBoundingClientRect()
      if (label) setTooltipWidth(label.width)
      const widths = Array.from(root?.querySelectorAll<HTMLElement>('[data-liangxiang-danmu-line]') ?? [], line => line.getBoundingClientRect().width)
      if (widths.length) setLaneWidth(Math.max(...widths))
    }
    measure()
    element?.addEventListener('animationend', measure)
    const observer = new ResizeObserver(measure)
    if (element) observer.observe(element)
    if (tooltipRef.current) observer.observe(tooltipRef.current)
    return () => { observer.disconnect(); element?.removeEventListener('animationend', measure) }
  }, [open, position.x, position.y, viewport.width, viewport.height, comments])
  const tooltip = placeBadgeFeedback(position, viewport, tooltipWidth, 28, panel)
  const width = Math.min(laneWidth, viewport.width - 16)
  const lane = placeBadgeFeedback(position, viewport, width, 96, panel)
  return (
    <div aria-hidden="true" data-liangxiang-feedback="" data-reduced-motion={reducedMotion} style={{ pointerEvents: 'none' }}>
      <style>{css}</style>
      <div ref={tooltipRef} data-liangxiang-badge-tooltip="" data-suppressed={suppressed || tooltip === null}
        data-align={tooltip?.align} style={{ position: 'fixed', left: tooltip?.x ?? 8, top: tooltip?.y ?? 8 }}>{HOVER_TEXT}</div>
      {comments.length > 0 && (
        <div data-liangxiang-danmu="" data-align={lane?.align} style={{ position: 'fixed', left: lane?.x ?? 8, top: lane?.y ?? 8, width, height: 96, visibility: lane ? 'visible' : 'hidden' }}>
          {comments.map((comment, index) => (
            <div key={comment.id} data-liangxiang-danmu-row={comment.id} style={{ transform: `translateY(${index * 30}px)` }}>
              <div data-liangxiang-danmu-line="" style={{ marginInline: lane?.align === 'center' ? 'auto' : lane?.align === 'end' ? 'auto 0' : '0 auto' }}>{comment.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
