import { test } from '@playwright/test';
import * as fs from 'fs';

const SS_DIR = '/tmp/taskflow-screenshots';
fs.mkdirSync(SS_DIR, { recursive: true });

test('assignee dropdown in task modal', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/projects', { timeout: 15000 });
  await page.waitForLoadState('networkidle');

  await page.locator('a[href*="/projects/"]').first().click();
  await page.waitForLoadState('networkidle');

  await page.click('button:has-text("Add Task")');
  await page.waitForSelector('[role=dialog]', { state: 'visible' });
  await page.waitForTimeout(500); // let users query resolve
  await page.screenshot({ path: `${SS_DIR}/modal_form.png` });

  // The assignee select is the 3rd combobox (status, priority, assignee)
  const dialog = page.locator('[role=dialog]');
  await dialog.locator('button[role=combobox]').nth(2).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SS_DIR}/modal_assignee_open.png` });
});
