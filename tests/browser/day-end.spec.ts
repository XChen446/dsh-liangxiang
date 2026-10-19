import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { DAY_END_ACTION_HEADER, DAY_END_ACTION_VALUE } from '../../src/shared/day-end.ts'
import { bootInstalledLiangxiang, openPanel } from './helpers.ts'

test('day-end is explicit, right-click only sets direction, and tabs share the Host preference', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  const configure = async (enabled: boolean) => {
    const response = await page.request.post('/liangxiang/api/day-end', {
      headers: { [DAY_END_ACTION_HEADER]: DAY_END_ACTION_VALUE }, data: { enabled, voteType: 'up' },
    })
    expect(response.ok()).toBe(true)
  }
  await configure(false)
  const before = await page.request.get('/liangxiang/api/state').then(r => r.json())
  const votes: string[] = []
  page.on('request', request => { if (request.url().endsWith('/liangxiang/api/vote')) votes.push(request.postData() ?? '') })
  const panel = await openPanel(page)
  await panel.locator('[data-liangxiang-vote="down"]').click({ button: 'right' })
  await expect(panel).toContainText('日终自动倾炉：默认投拉')
  expect(votes).toHaveLength(0)
  await panel.locator('[data-liangxiang-vote="up"]').click({ button: 'right' })
  await expect(panel).toContainText('日终自动倾炉：默认投夯')
  await panel.locator('[data-liangxiang-vote="down"]').click({ button: 'right' })
  await expect(panel).toContainText('日终自动倾炉：默认投拉')
  await panel.locator('[data-liangxiang-utility-trigger]').click()
  const toggle = panel.locator('[data-liangxiang-utility-action="day-end"]')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(toggle).toContainText('已关闭')
  const hint = panel.locator('[data-liangxiang-day-end-hint]')
  await expect(hint).toBeHidden()
  await toggle.hover()
  await expect(hint).toBeVisible()
  await expect(hint).toContainText('当前：拉')
  await expect(hint).toContainText('DSH 运行时生效')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle).toContainText('已开启')
  // The entire tile remains a working toggle in both directions. Leave it
  // enabled for the held-gesture check below.
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(toggle).toContainText('已关闭')
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await panel.locator('[data-liangxiang-utility-action="version"]').hover()
  await expect(hint).toBeHidden()
  // A held gesture informs the Host before release. Cancel it so this test
  // never spends the existing smoke balance.
  await page.mouse.move(10, 10)
  const up = panel.locator('[data-liangxiang-vote="up"]')
  const gesture = page.waitForResponse(r => r.url().endsWith('/liangxiang/api/vote-activity'))
  await up.hover()
  await page.mouse.down()
  expect((await gesture).ok()).toBe(true)
  await up.dispatchEvent('pointercancel', { pointerId: 1, bubbles: true })
  await page.mouse.up()
  expect(votes).toHaveLength(0)
  await panel.locator('[data-liangxiang-utility-trigger]').click()
  const repair = panel.locator('[data-liangxiang-utility-action="reconcile"]')
  await expect(repair).toBeHidden()
  await panel.getByText('显示异常？', { exact: true }).click()
  await expect(repair).toBeVisible()
  const accessibility = await new AxeBuilder({ page }).include('[data-liangxiang-utility-drawer]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(accessibility.violations).toEqual([])
  const other = await page.context().newPage()
  try {
    await bootInstalledLiangxiang(other)
    const second = await openPanel(other)
    await second.locator('[data-liangxiang-utility-trigger]').click()
    const secondToggle = second.locator('[data-liangxiang-utility-action="day-end"]')
    await expect(secondToggle).toHaveAttribute('aria-pressed', 'true')
    await expect(secondToggle).toContainText('已开启')
    await secondToggle.hover()
    await expect(second.locator('[data-liangxiang-day-end-hint]')).toContainText('当前：拉')
    await secondToggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  } finally { await other.close(); await configure(false) }
  const after = await page.request.get('/liangxiang/api/state').then(r => r.json())
  expect(after.personal.usedIncenseToday).toBe(before.personal.usedIncenseToday)
  expect(after.personal.remainingIncense).toBe(before.personal.remainingIncense)
})
