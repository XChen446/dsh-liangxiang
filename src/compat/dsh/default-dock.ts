/**
 * One initial geometry read, never a layout observer or a panel repositioner.
 * DSH's account trigger has data-collapsed + aria-haspopup=menu in both
 * 0.2.0-rc.2 (639ed01539) and 0.2.1-rc.2 (687f282e86), at
 * packages/client/ui-settings-account/src/client/AccountMenu.tsx.
 * The default 0.2.0 Web App instead uses ui-settings-general's localized
 * Settings/设置 button. Its rendered height varies with the shell and state.
 * This internal DOM seam is cosmetic, bounded and safe to miss.
 */
export function initialDshDockClearance(height: number, document: Pick<Document, 'querySelectorAll'>): number | null {
  let footerTop: number | null = null
  for (const button of document.querySelectorAll<HTMLElement>(
    'button[data-collapsed][aria-haspopup="menu"],button[aria-label="Settings"],button[aria-label="设置"]',
  )) {
    const box = button.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0 || box.left < 0 || box.left >= 280
      || box.bottom > height || box.top < Math.max(height / 2, height - 160)) continue
    if (footerTop === null || box.top > footerTop) footerTop = box.top
  }
  return footerTop === null ? null : height - footerTop + 8
}
