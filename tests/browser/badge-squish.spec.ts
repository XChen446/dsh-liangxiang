import { expect, test } from '@playwright/test'
import { badgeSelector, bootInstalledLiangxiang, panelSelector } from './helpers.ts'
import { SQUISH_LABELS } from '../../src/client/badge-squish.ts'

test('pointer bursts play without trapping keyboard or changing the incense ledger', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  const badge = page.locator(badgeSelector)
  const panel = page.locator(panelSelector)
  const before = await (await page.request.get('/liangxiang/api/state')).json()
  await badge.click()
  await expect(panel).toBeVisible()
  await badge.click()
  await expect(panel).toBeHidden()
  await badge.click({ clickCount: 4, delay: 40 })
  await expect(panel).toBeHidden()
  expect(SQUISH_LABELS).toContain(await page.locator('[data-liangxiang-badge-tooltip]').textContent())
  await expect(badge).toHaveAttribute('title', '今日梁相')
  await badge.press('Enter')
  await expect(panel).toBeVisible()
  await panel.press('Escape')
  await badge.press('Space')
  await expect(panel).toBeVisible()
  const after = await (await page.request.get('/liangxiang/api/state')).json()
  expect(after.personal).toEqual(before.personal)
  expect(after.snapshot).toEqual(before.snapshot)
})

test('idle restores the ordinary pointer action and the default tooltip', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  const badge = page.locator(badgeSelector)
  await badge.click({ clickCount: 3, delay: 40 })
  const tooltip = page.locator('[data-liangxiang-badge-tooltip]')
  await expect(tooltip).not.toHaveText('今日梁相')
  await expect(tooltip).toHaveText('今日梁相', { timeout: 4_000 })
  await badge.click()
  await expect(page.locator(panelSelector)).toBeVisible()
})

test('the whole badge rebounds while its tooltip stays upright and the drag stays quiet', async ({ page }) => {
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
  const before = await tones()
  const box = (await badge.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect.poll(() => badge.evaluate(el => getComputedStyle(el).transform)).not.toBe('none')
  const tooltip = page.locator('[data-liangxiang-badge-tooltip]')
  expect(await tooltip.evaluate(el => getComputedStyle(el).transform)).toMatch(/^matrix\(1, 0, 0, 1,/)
  await page.mouse.move(box.x + 130, box.y - 70, { steps: 8 })
  await page.mouse.up()
  await expect(badge).not.toHaveAttribute('data-squish-release')
  await expect(page.locator(panelSelector)).toBeHidden()
  expect(await tones()).toBe(before)
  await badge.click()
  await expect(badge).toHaveAttribute('data-squish-release', 'true')
  expect(await tones()).toBe(before + 1)
  await expect(badge).not.toHaveAttribute('data-squish-release', { timeout: 2_000 })
})

test('cancelled gestures and reduced motion leave no squash behind', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  const badge = page.locator(badgeSelector)
  const box = (await badge.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })))
  await page.mouse.up()
  await expect(badge).not.toHaveAttribute('data-squish-pressed')
  await expect(badge).not.toHaveAttribute('data-squish-release')
  await badge.click()
  expect(await badge.evaluate(el => getComputedStyle(el).transform)).toBe('none')
  expect(await badge.evaluate(el => el.getAnimations().length)).toBe(0)
})
