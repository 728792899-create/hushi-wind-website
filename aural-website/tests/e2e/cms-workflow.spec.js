import { expect, test } from '@playwright/test'

const API = 'http://127.0.0.1:1437'
const ADMIN = 'http://127.0.0.1:5335'

test('CMS login, publish and version rollback @smoke', async ({ page, request }) => {
  await page.goto(ADMIN)
  await page.getByPlaceholder('ADMIN USER').fill('demo_admin')
  await page.getByPlaceholder('PASSWORD').fill('DemoPass_2026!')
  await page.getByRole('button', { name: '系统验证登录' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText('运营工作台')).toBeVisible()

  const auth = await page.evaluate(() => ({
    token: sessionStorage.getItem('aural-admin-auth-token'),
    csrf: sessionStorage.getItem('aural-admin-csrf-token')
  }))
  expect(auth.token).toBeTruthy()
  expect(auth.csrf).toBeTruthy()
  const headers = { Authorization: `Bearer ${auth.token}`, 'X-CSRF-Token': auth.csrf, Origin: ADMIN }
  const stamp = Date.now()
  const originalTitle = `E2E 发布产品 ${stamp}`
  let product
  try {
    const createResponse = await request.post(`${API}/api/products`, {
      headers,
      data: { title: originalTitle, slug: `e2e-product-${stamp}`, type: 'piano', categoryName: '验收产品', description: 'E2E publish and rollback', status: 'published', quantity: 1, price: 9800 }
    })
    expect(createResponse.ok()).toBe(true)
    product = await createResponse.json()

    const updateResponse = await request.put(`${API}/api/products/${product.id}`, {
      headers,
      data: { ...product, title: `${originalTitle} 已编辑` }
    })
    expect(updateResponse.ok()).toBe(true)

    const versionsResponse = await request.get(`${API}/api/products/${product.id}/versions`, { headers })
    const versions = (await versionsResponse.json()).data
    const originalVersion = versions.find((row) => JSON.parse(row.snapshot).title === originalTitle)
    expect(originalVersion).toBeTruthy()

    const restoreResponse = await request.post(`${API}/api/products/${product.id}/restore/${originalVersion.id}`, { headers })
    expect(restoreResponse.ok()).toBe(true)
    expect((await restoreResponse.json()).title).toBe(originalTitle)

    await page.getByRole('button', { name: '产品运营' }).click()
    await expect(page).toHaveURL(/\/products$/)
    await page.getByPlaceholder('搜索乐器名称、参数或场景...').fill(originalTitle)
    await expect(page.getByText(originalTitle, { exact: true }).first()).toBeVisible()
  } finally {
    if (product?.id) await request.delete(`${API}/api/products/${product.id}`, { headers })
  }
})
