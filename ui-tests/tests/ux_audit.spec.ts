import { test } from '@playwright/test';
import * as fs from 'fs';
const D = '/tmp/ux-audit'; fs.mkdirSync(D, { recursive: true });
const s = (n: string) => `${D}/${n}.png`;

test('UX audit screenshots', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: s('01_login'), fullPage: true });

  await page.goto('http://localhost:3000/register');
  await page.screenshot({ path: s('02_register'), fullPage: true });

  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/projects', { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: s('03_projects'), fullPage: true });

  await page.locator('a[href*="/projects/"]').first().click();
  await page.waitForURL('**/projects/**');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: s('04_project_list'), fullPage: true });

  // Board view
  await page.click('button:has-text("Board")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: s('05_board'), fullPage: true });

  // Task modal
  await page.click('button:has-text("Add Task")');
  await page.waitForSelector('[role=dialog]', { state: 'visible' });
  await page.screenshot({ path: s('06_add_task_modal'), fullPage: true });
  await page.keyboard.press('Escape');

  // Task detail
  await page.waitForTimeout(300);
  await page.locator('.cursor-pointer').first().click();
  await page.waitForSelector('[role=dialog]', { state: 'visible' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: s('07_task_detail'), fullPage: true });
  await page.keyboard.press('Escape');

  // Mobile
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: s('08_mobile_list'), fullPage: true });
  await page.click('button:has-text("Board")');
  await page.waitForTimeout(300);
  await page.screenshot({ path: s('09_mobile_board'), fullPage: true });
});
