import { expect, test, type Page } from '@playwright/test'
import { badgeSelector, bootInstalledLiangxiang, panelSelector } from './helpers.ts'
import { SQUISH_LABELS } from '../../src/client/badge-squish.ts'

const tooltipSelector = '[data-liangxiang-badge-tooltip]'
const lineSelector = '[data-liangxiang-danmu-line]'

async function dragBadge(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator(badgeSelector).boundingBox())!
  if (Math.abs(box.x - x) + Math.abs(box.y - y) < 1) return
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(x + 24, y + 24, { steps: 8 })
  await page.mouse.up()
}

async function assertFeedbackFits(page: Page): Promise<void> {
  const panel = await page.locator(panelSelector).isVisible() ? await page.locator(panelSelector).boundingBox() : null
  const badge = (await page.locator(badgeSelector).boundingBox())!
  const viewport = page.viewportSize()!
  for (const line of await page.locator(lineSelector).all()) {
    const box = (await line.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(7)
    expect(box.y).toBeGreaterThanOrEqual(7)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 7)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 7)
    for (const obstacle of [panel, badge]) {
      if (obstacle === null) continue
      expect(box.x + box.width <= obstacle.x || box.x >= obstacle.x + obstacle.width
        || box.y + box.height <= obstacle.y || box.y >= obstacle.y + obstacle.height).toBe(true)
    }
  }
}

test('double clicks never change the panel, before/after idle or during repeated play', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  const badge = page.locator(badgeSelector)
  const panel = page.locator(panelSelector)
  const gameplayRequests: string[] = []
  page.on('request', request => {
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST' && /\/api\/(?:vote|mode|reconcile|dev\/credit|local\/cycle-case)$/.test(path)) gameplayRequests.push(path)
  })
  await badge.evaluate(element => {
    const changes: string[] = []
    Object.assign(window, { badgePanelChanges: changes })
    new MutationObserver(records => {
      if (records.some(record => record.attributeName === 'aria-expanded')) changes.push(element.getAttribute('aria-expanded')!)
    }).observe(element, { attributes: true, attributeFilter: ['aria-expanded'] })
  })
  for (const delay of [50, 50, 180]) {
    await badge.dblclick({ delay })
    await expect(page.locator(lineSelector).first()).toBeVisible()
    await expect(panel).toBeHidden()
    await page.waitForTimeout(850)
  }
  expect(await page.evaluate(() => Reflect.get(window, 'badgePanelChanges'))).toEqual([])
  await badge.press('Enter')
  await expect(panel).toBeVisible()
  await badge.evaluate(() => { Reflect.get(window, 'badgePanelChanges').length = 0 })
  await badge.dblclick({ delay: 60 })
  await badge.dblclick({ delay: 60 })
  await page.waitForTimeout(850)
  await badge.dblclick({ delay: 180 })
  await expect(panel).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, 'badgePanelChanges'))).toEqual([])
  await panel.press('Escape')
  await badge.press('Space')
  await expect(panel).toBeVisible()
  expect(gameplayRequests).toEqual([])
})

test('a double tap starts comments, further taps sink older rows, then hover and single click recover', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  const badge = page.locator(badgeSelector)
  const tooltip = page.locator(tooltipSelector)
  await badge.hover()
  await expect.poll(() => tooltip.evaluate(el => getComputedStyle(el).opacity)).toBe('1')
  await badge.dblclick({ delay: 50 })
  await expect(page.locator(lineSelector)).toHaveCount(1)
  await expect.poll(() => tooltip.evaluate(el => getComputedStyle(el).opacity)).toBe('0')
  const firstRow = await page.locator('[data-liangxiang-danmu-row]').getAttribute('data-liangxiang-danmu-row')
  await page.waitForTimeout(160)
  await badge.click()
  await expect(page.locator(lineSelector)).toHaveCount(2)
  await expect(page.locator(`[data-liangxiang-danmu-row="${firstRow}"]`)).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 30)')
  await page.waitForTimeout(160)
  await badge.click()
  await expect(page.locator(lineSelector)).toHaveCount(3)
  for (const text of await page.locator(lineSelector).allTextContents()) expect(SQUISH_LABELS).toContain(text)
  await badge.click({ clickCount: 8, delay: 20 })
  expect(await page.locator(lineSelector).count()).toBeLessThanOrEqual(3)
  await assertFeedbackFits(page)
  await expect(page.locator(lineSelector)).toHaveCount(0, { timeout: 4_000 })
  await expect(tooltip).toHaveText('今日梁相')
  await expect.poll(() => tooltip.evaluate(el => getComputedStyle(el).opacity)).toBe('1')
  await badge.click()
  await expect(page.locator(panelSelector)).toBeVisible()
  await badge.click()
  await expect(page.locator(panelSelector)).toBeHidden()
})

test('hover centers when possible and aligns only at actual left/right edges', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  const width = page.viewportSize()!.width
  const badge = page.locator(badgeSelector)
  const tooltip = page.locator(tooltipSelector)
  for (const [x, align] of [[12, 'start'], [width < 1024 ? 300 : 60, 'center'], [width - 108, 'center'], [width - 60, 'end']] as const) {
    await dragBadge(page, x, 420)
    await badge.hover()
    await expect(tooltip).toHaveAttribute('data-align', align)
    await expect.poll(() => tooltip.evaluate(el => getComputedStyle(el).opacity)).toBe('1')
    const box = (await tooltip.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(7)
    expect(box.x + box.width).toBeLessThanOrEqual(width - 7)
    if (align === 'center') {
      const anchor = (await badge.boundingBox())!
      expect(Math.abs(box.x + box.width / 2 - anchor.x - anchor.width / 2)).toBeLessThan(1)
    }
    await badge.dblclick({ delay: 50 })
    await expect(page.locator('[data-liangxiang-danmu]')).toHaveAttribute('data-align', align)
    await assertFeedbackFits(page)
  }
})

test('comments avoid the actual open panel at both corners and the middle', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const badge = page.locator(badgeSelector)
  const viewport = page.viewportSize()!
  await badge.press('Enter')
  await expect(page.locator(panelSelector)).toBeVisible()
  for (const [x, y] of [[12, viewport.height - 98], [viewport.width - 60, 12], [viewport.width / 2, 420]]) {
    await dragBadge(page, x!, y!)
    await badge.dblclick({ delay: 60 })
    await expect(page.locator(lineSelector).first()).toBeVisible()
    await page.waitForTimeout(250)
    await assertFeedbackFits(page)
    await expect(page.locator(panelSelector)).toBeVisible()
    if (x === 12) {
      const panelBox = (await page.locator(panelSelector).boundingBox())!
      const lane = (await page.locator('[data-liangxiang-danmu]').boundingBox())!
      expect(lane.x - panelBox.x - panelBox.width).toBeGreaterThanOrEqual(9)
      expect(lane.x - panelBox.x - panelBox.width).toBeLessThanOrEqual(11)
    }
  }
  await page.screenshot({ path: test.info().outputPath('badge-danmu.png') })
})

test('the whole badge rebounds while a drag stays quiet and cancels a pending toggle', async ({ page }) => {
  await page.addInitScript(() => {
    const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }
    Object.defineProperty(window, 'AudioContext', { value: class {
      currentTime = 0
      state = 'running'
      destination = {}
      createOscillator() {
        return { frequency: parameter, connect() {}, stop() {}, start() {
          const root = document.documentElement
          root.dataset.liangxiangTestTones = String(Number(root.dataset.liangxiangTestTones ?? 0) + 1)
        } }
      }
      createGain() { return { gain: parameter, connect() {} } }
    } })
  })
  await bootInstalledLiangxiang(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const badge = page.locator(badgeSelector)
  const tones = () => page.evaluate(() => Number(document.documentElement.dataset.liangxiangTestTones ?? 0))
  await badge.click()
  const before = await tones()
  const box = (await badge.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect.poll(() => badge.evaluate(el => getComputedStyle(el).transform)).not.toBe('none')
  await page.mouse.move(box.x + 130, box.y - 70, { steps: 8 })
  await page.mouse.up()
  await expect(badge).not.toHaveAttribute('data-squish-release')
  await page.waitForTimeout(500)
  await expect(page.locator(panelSelector)).toBeHidden()
  expect(await tones()).toBe(before)
  await badge.click()
  await expect(badge).toHaveAttribute('data-squish-release', 'true')
  expect(await tones()).toBe(before + 1)
  await expect(badge).not.toHaveAttribute('data-squish-release', { timeout: 2_000 })
})

test('cancel and keyboard activation clear pending gestures; reduced motion keeps feedback still', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  const badge = page.locator(badgeSelector)
  const box = (await badge.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })))
  await page.mouse.up()
  await expect(badge).not.toHaveAttribute('data-squish-pressed')
  await expect(badge).not.toHaveAttribute('data-squish-release')
  await page.waitForTimeout(500)
  await expect(page.locator(panelSelector)).toBeHidden()
  await badge.click()
  await badge.press('Escape')
  await page.waitForTimeout(500)
  await expect(page.locator(panelSelector)).toBeHidden()
  await badge.click()
  await badge.press('Enter')
  await expect(page.locator(panelSelector)).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.locator(panelSelector)).toBeVisible()
  await badge.dblclick({ delay: 50 })
  await expect(page.locator(lineSelector).first()).toBeVisible()
  expect(await badge.evaluate(el => getComputedStyle(el).transform)).toBe('none')
  expect(await badge.evaluate(el => el.getAnimations().length)).toBe(0)
  expect(await page.locator('[data-liangxiang-feedback]').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
})
