import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const SS_DIR = '/tmp/taskflow-screenshots';
fs.mkdirSync(SS_DIR, { recursive: true });

test('task card click opens view modal, pencil switches to edit', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/projects', { timeout: 15000 });
  await page.waitForTimeout(500);

  // Go to first project that has tasks (Website Redesign from seed)
  await page.locator('a[href*="/projects/"]').first().click();
  await page.waitForURL('**/projects/**');
  await page.waitForTimeout(800);

  // Click a task card
  const cards = page.locator('.cursor-pointer').filter({ hasText: /.+/ });
  await cards.first().click();
  await page.waitForSelector('[role=dialog]', { state: 'visible' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SS_DIR}/task_view_mode.png` });

  // Should be in view mode — edit button visible, no input fields
  await expect(page.locator('[role=dialog] button:has-text("Edit")')).toBeVisible();
  await expect(page.locator('[role=dialog] input')).toHaveCount(0);

  // Click Edit button → switches to edit mode
  await page.click('[role=dialog] button:has-text("Edit")');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SS_DIR}/task_edit_mode.png` });

  // Should now have input fields
  await expect(page.locator('[role=dialog] input').first()).toBeVisible();

  // Cancel → back to view mode
  await page.click('[role=dialog] button:has-text("Cancel")');
  await page.waitForTimeout(200);
  await expect(page.locator('[role=dialog] button:has-text("Edit")')).toBeVisible();
  await page.screenshot({ path: `${SS_DIR}/task_back_to_view.png` });
});
