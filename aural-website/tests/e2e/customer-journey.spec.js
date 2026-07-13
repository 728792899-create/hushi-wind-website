import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const waitForHydration = (page) => page.locator('html[data-hydrated="true"]').waitFor()

test('product browse, search, compare and inquiry conversion @smoke', async ({ page }) => {
  await page.goto('/products')
  await waitForHydration(page)
  await expect(page.getByRole('heading', { name: /产品目录/ })).toBeVisible()
  const initialCount = await page.locator('[role="listitem"]').count()
  expect(initialCount).toBeGreaterThanOrEqual(4)

  const search = page.getByPlaceholder('搜索产品 / 参数 / 场景')
  await search.fill('DX-88')
  await expect(page.locator('[role="listitem"]')).toHaveCount(1)
  await page.getByRole('button', { name: '清除筛选' }).click()

  const compareButtons = page.getByRole('button', { name: /加入对比/ })
  await compareButtons.nth(0).click()
  await compareButtons.nth(1).click()
  await page.getByRole('button', { name: /开始对比 2\/3/ }).click()
  await expect(page.getByRole('dialog', { name: /产品选型对比/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '关闭对比' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /产品选型对比/ })).toBeHidden()

  await page.locator('[role="listitem"]').first().click()
  await expect(page.getByRole('button', { name: '咨询报价' }).first()).toBeVisible()
  const structuredData = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((value) => JSON.parse(value))
  expect(structuredData.map((value) => value['@type'] || '@graph')).toEqual(expect.arrayContaining(['Product', 'BreadcrumbList', '@graph']))
  await page.getByRole('button', { name: '咨询报价' }).first().click()
  await page.getByPlaceholder('您的姓名').fill('验收客户')
  await page.getByPlaceholder('联系电话').fill('13800138000')
  await page.getByPlaceholder('所在城市').fill('上海')
  await page.getByPlaceholder(/补充需求/).fill('需要门店试奏与企业采购报价')
  await page.waitForTimeout(1900)
  await page.getByRole('button', { name: '提交申请' }).click()
  await expect(page.getByRole('heading', { name: '申请已提交' })).toBeVisible()
})

test('critical pages have no serious axe violations', async ({ page }) => {
  for (const path of ['/', '/products', '/support']) {
    await page.goto(path)
    await waitForHydration(page)
    const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
    expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact))).toEqual([])
  }
})

test('mobile navigation and filters reflow without horizontal overflow @responsive', async ({ page }) => {
  await page.goto('/')
  await waitForHydration(page)
  await page.getByRole('button', { name: '打开菜单' }).click()
  await expect(page.getByRole('dialog', { name: '移动导航菜单' })).toBeVisible()
  await page.getByRole('dialog', { name: '移动导航菜单' }).getByRole('link', { name: '产品中心' }).first().click()
  await page.getByRole('button', { name: /筛选/ }).click()
  await expect(page.getByText('筛选产品', { exact: true })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
