/** Decorative feedback only; never changes incense, votes or Liangzi state. */
export const SQUISH_LABELS = [
  '好好好，梁子已读',
  '别拍了，已经很 Q 了',
  '是谁在给梁子打节拍',
  '这班上得有点弹性',
  '收到，正在假装很忙',
  '你拍的是梁子的倔强',
  '再拍就要弹回去了',
  '梁子：申请原地躺平',
] as const

/** Immediate squash, then a short window to distinguish open/close from play. */
export const SQUISH_TAP_WINDOW_MS = 400
export const SQUISH_IDLE_MS = 750
export const SQUISH_COMMENT_GAP_MS = 140
export const SQUISH_LABEL_LINGER_MS = 2_600
export const SQUISH_MAX_ROWS = 3
export const SQUISH_ANIM_MS = 680

export function pickSquishLabel(previous = ''): string {
  const pool = SQUISH_LABELS.filter(label => label !== previous)
  return pool[Math.floor(Math.random() * pool.length)]!
}
