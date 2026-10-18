/** Decorative badge feedback; never changes incense, votes or Liangzi state. */
export const SQUISH_LABELS = [
  '梁子已扁平化',
  '轻点，梁子还要上班',
  '今日含梁量有点高',
  '拍一拍，梁子弹回来',
  '香火照常，梁子稍扁',
] as const

export const SQUISH_COMBO_COUNT = 3
export const SQUISH_COMBO_RELEASE_MS = 900
export const SQUISH_LABEL_LINGER_MS = 2_600
/** Shared by the CSS duration and the attribute cleanup timer. */
export const SQUISH_ANIM_MS = 680

export function pickSquishLabel(): string {
  return SQUISH_LABELS[Math.floor(Math.random() * SQUISH_LABELS.length)]!
}

export type SquishAction = 'toggle' | 'silent' | 'label'

/** First two pointer taps toggle; later taps play, with a label every third. */
export function squishAction(tapCount: number): SquishAction {
  if (!Number.isFinite(tapCount) || tapCount < SQUISH_COMBO_COUNT) return 'toggle'
  return tapCount % SQUISH_COMBO_COUNT === 0 ? 'label' : 'silent'
}
