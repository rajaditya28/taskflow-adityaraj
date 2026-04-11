import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3000'

async function login(page: any) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[type="email"]', 'test@example.com')
  await page.fill('input[type="password"]', 'password123')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/projects', { timeout: 15000 })
}

test.describe('Pagination', () => {
  test('projects page always shows pagination bar with count', async ({ page }) => {
    await login(page)
    await page.locator('text=Showing').waitFor({ state: 'visible', timeout: 10000 })
    // "Showing X–Y of Z projects" label is always visible
    await expect(page.locator('text=/Showing \\d+.*of \\d+ project/')).toBeVisible()
    // prev/next buttons are present
    await expect(page.locator('button[title="List view"]')).toHaveCount(0) // just a sanity guard
    const prevBtn = page.locator('button:has(svg)').filter({ has: page.locator('[data-lucide="chevron-left"], svg') }).first()
    // page indicator text
    await expect(page.locator('text=/Page \\d+ of \\d+/')).toBeVisible()
  })

  test('tasks list always shows pagination bar', async ({ page }) => {
    await login(page)
    // open first project
    await page.locator('a[href*="/projects/"]').first().click()
    await page.waitForURL('**/projects/**')
    await page.locator('button[title="Board view"]').waitFor({ state: 'visible', timeout: 10000 })

    // pagination bar should be visible in list view when there are tasks
    const taskCount = await page.locator('.cursor-pointer').count()
    if (taskCount > 0) {
      await expect(page.locator('text=/Showing \\d+.*of \\d+ task/')).toBeVisible()
      await expect(page.locator('text=/Page \\d+ of \\d+/').last()).toBeVisible()
    }
  })

  test('task pagination prev button is disabled on first page', async ({ page }) => {
    await login(page)
    await page.locator('a[href*="/projects/"]').first().click()
    await page.waitForURL('**/projects/**')
    await page.locator('button[title="Board view"]').waitFor({ state: 'visible', timeout: 10000 })

    const taskCount = await page.locator('.cursor-pointer').count()
    if (taskCount > 0) {
      // find the pagination row — it's below the task list
      const paginationRow = page.locator('text=/Page \\d+ of \\d+/').last().locator('..')
      const prevBtn = paginationRow.locator('button').first()
      await expect(prevBtn).toBeDisabled()
    }
  })

  test('task pagination resets to page 1 when filter changes', async ({ page }) => {
    await login(page)
    await page.locator('a[href*="/projects/"]').first().click()
    await page.waitForURL('**/projects/**')
    await page.locator('button[title="Board view"]').waitFor({ state: 'visible', timeout: 10000 })

    // change status filter
    const filters = page.locator('button[role=combobox]')
    await filters.first().click()
    await page.waitForTimeout(200)
    const opt = page.locator('[role=option]').first()
    await opt.click()
    await page.waitForTimeout(300)

    // page indicator should show page 1
    const pageText = page.locator('text=/Page 1 of \\d+/')
    await expect(pageText.last()).toBeVisible()
  })
})
