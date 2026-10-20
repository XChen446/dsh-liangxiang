import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { DAY_END_ACTION_HEADER, DAY_END_ACTION_VALUE } from '../../src/shared/day-end.ts'
import { bootInstalledLiangxiang, openPanel } from './helpers.ts'

test.afterEach(async ({ page }) => {
  const response = await page.request.post('/liangxiang/api/day-end', {
    headers: { [DAY_END_ACTION_HEADER]: DAY_END_ACTION_VALUE }, data: { enabled: false, voteType: 'up' },
  })
  expect(response.ok()).toBe(true)
})

test('day-end is explicit, right-click only sets direction, and tabs share the Host preference', async ({ page }, testInfo) => {
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
  await expect(panel).toContainText('定时上香：默认投拉')
  expect(votes).toHaveLength(0)
  await panel.locator('[data-liangxiang-vote="up"]').click({ button: 'right' })
  await expect(panel).toContainText('定时上香：默认投夯')
  await panel.locator('[data-liangxiang-vote="down"]').click({ button: 'right' })
  await expect(panel).toContainText('定时上香：默认投拉')
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
  await expect(hint).toContainText('每 10 分钟')
  await expect(hint).toContainText('23:59 再收尾一次')
  await expect(toggle).toContainText('定时上香')
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
  const repairLayout = await repair.evaluate(element => {
    const drawer = element.closest('[data-liangxiang-utility-drawer]')!
    const first = drawer.querySelector('[data-liangxiang-utility-action="home"]')!.getBoundingClientRect()
    const last = drawer.querySelector('[data-liangxiang-utility-action="version"]')!.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    const text = document.createRange()
    text.selectNodeContents(element)
    // React emits label, separator and hint as separate text nodes. Count
    // visual rows rather than mistaking each fragment for a wrapped line.
    const rows: Array<{ top: number, bottom: number }> = []
    for (const rect of Array.from(text.getClientRects()).sort((a, b) => a.top - b.top)) {
      if (rect.width === 0 || rect.height === 0) continue
      const previous = rows.at(-1)
      if (previous === undefined || rect.top >= previous.bottom - 1) rows.push({ top: rect.top, bottom: rect.bottom })
      else previous.bottom = Math.max(previous.bottom, rect.bottom)
    }
    return { leftGap: Math.abs(box.left - first.left), rightGap: Math.abs(box.right - last.right),
      height: box.height, lines: rows.length, overflow: element.scrollWidth > element.clientWidth }
  })
  expect(repairLayout.leftGap).toBeLessThan(1)
  expect(repairLayout.rightGap).toBeLessThan(1)
  expect(repairLayout.lines).toBeLessThanOrEqual(2)
  expect(repairLayout.height).toBeLessThanOrEqual(44)
  expect(repairLayout.overflow).toBe(false)
  await panel.locator('[data-liangxiang-utility-drawer]').screenshot({ path: testInfo.outputPath('repair-expanded.png') })
  await repair.click()
  await expect(panel.locator('[data-liangxiang-reconcile-confirm]')).toBeVisible()
  await panel.locator('[data-liangxiang-reconcile-cancel]').click()
  await expect(panel.locator('[data-liangxiang-reconcile-confirm]')).toBeHidden()
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
  } finally { await other.close() }
  const after = await page.request.get('/liangxiang/api/state').then(r => r.json())
  expect(after.personal.usedIncenseToday).toBe(before.personal.usedIncenseToday)
  expect(after.personal.remainingIncense).toBe(before.personal.remainingIncense)
})
