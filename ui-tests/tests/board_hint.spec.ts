import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

async function loginAndOpenProject(page: any) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[type="email"]', 'test@example.com')
  await page.fill('input[type="password"]', 'password123')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/projects', { timeout: 15000 })
  await page.locator('a[href*="/projects/"]').first().click()
  await page.waitForURL('**/projects/**')
  // SSE keeps networkidle from firing — wait for a known element instead
  await page.locator('button[title="Board view"]').waitFor({ state: 'visible', timeout: 10000 })
}

async function reloadProject(page: any) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('button[title="Board view"]').waitFor({ state: 'visible', timeout: 10000 })
}

test.describe('Board view hint', () => {
  test('greeting shows full name, not just first name', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/projects', { timeout: 15000 })
    await page.locator('h1').waitFor({ state: 'visible' })
    // "Test User 👋" should be visible — full name, not just "Test"
    await expect(page.locator('h1').filter({ hasText: 'Test User' })).toBeVisible()
  })

  test('hint does not appear immediately on page load', async ({ page }) => {
    await loginAndOpenProject(page)
    await page.evaluate(() => localStorage.removeItem('taskflow_hint_board_seen'))
    await reloadProject(page)
    // hint timer hasn't fired yet
    await expect(page.locator('text=Try Board view')).not.toBeVisible()
  })

  test('hint appears after 3 seconds on list view', async ({ page }) => {
    await loginAndOpenProject(page)
    await page.evaluate(() => localStorage.removeItem('taskflow_hint_board_seen'))
    await reloadProject(page)

    await expect(page.locator('text=Try Board view')).not.toBeVisible()
    await page.waitForTimeout(3500)
    await expect(page.locator('text=Try Board view')).toBeVisible()
  })

  test('hint dismisses when X is clicked and does not reappear on reload', async ({ page }) => {
    await loginAndOpenProject(page)
    await page.evaluate(() => localStorage.removeItem('taskflow_hint_board_seen'))
    await reloadProject(page)
    await page.waitForTimeout(3500)

    await page.locator('text=Try Board view').waitFor({ state: 'visible' })
    // the X button is inside the hint bubble — click it
    await page.locator('div:has(> p:text("Try Board view")) button').click()
    await expect(page.locator('text=Try Board view')).not.toBeVisible()

    // reload — should not reappear
    await reloadProject(page)
    await page.waitForTimeout(3500)
    await expect(page.locator('text=Try Board view')).not.toBeVisible()
  })

  test('clicking board button dismisses the hint', async ({ page }) => {
    await loginAndOpenProject(page)
    await page.evaluate(() => localStorage.removeItem('taskflow_hint_board_seen'))
    await reloadProject(page)
    await page.waitForTimeout(3500)

    await page.locator('text=Try Board view').waitFor({ state: 'visible' })
    await page.locator('button[title="Board view"]').click()
    await expect(page.locator('text=Try Board view')).not.toBeVisible()
    // confirm board view is active
    await expect(page.locator('text=To Do').first()).toBeVisible()
  })
})
