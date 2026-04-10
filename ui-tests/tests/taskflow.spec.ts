import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:3000';
const SS_DIR = '/tmp/taskflow-screenshots';

function ss(name: string) {
  fs.mkdirSync(SS_DIR, { recursive: true });
  return path.join(SS_DIR, `${name}.png`);
}

test.describe('TaskFlow E2E', () => {
  test('full user journey', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    // ── 1. Login page ──────────────────────────────────────────────────────
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle('TaskFlow');
    await page.screenshot({ path: ss('01_login') });

    // ── 2. Login with seed credentials ────────────────────────────────────
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/projects', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: ss('02_projects') });

    // ── 3. Create a new project ────────────────────────────────────────────
    await page.click('button:has-text("New Project")');
    await page.waitForSelector('[role=dialog]', { state: 'visible' });

    // Fill first input (project name) and second input (description)
    await page.locator('[role=dialog] input').first().fill('E2E Test Project');
    await page.locator('[role=dialog] input').nth(1).fill('Created by Playwright E2E');

    // Click the "Create project" button
    await page.click('[role=dialog] button:has-text("Create project")');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: ss('03_project_created') });

    // ── 4. Navigate into the newly created project ─────────────────────────
    await page.click('text=E2E Test Project');
    await page.waitForURL('**/projects/**');
    await page.waitForTimeout(800);
    await page.screenshot({ path: ss('04_project_detail') });

    // ── 5. Create 3 tasks with different priorities ────────────────────────
    const tasks = [
      { title: 'High Priority Task', priorityValue: 'high', priorityLabel: 'High' },
      { title: 'Medium Priority Task', priorityValue: 'medium', priorityLabel: 'Medium' },
      { title: 'Low Priority Task', priorityValue: 'low', priorityLabel: 'Low' },
    ];

    for (const task of tasks) {
      await page.click('button:has-text("Add Task")');
      await page.waitForSelector('[role=dialog]', { state: 'visible' });

      await page.fill('[role=dialog] input[id="title"]', task.title);

      // The dialog has 2 Select triggers: [0]=status, [1]=priority
      const dialog = page.locator('[role=dialog]');
      const selectTriggers = dialog.locator('button[role=combobox]');

      // Click the priority trigger (index 1)
      await selectTriggers.nth(1).click();
      await page.waitForTimeout(300);
      await page.click(`[role=option]:has-text("${task.priorityLabel}")`);
      await page.waitForTimeout(200);

      // Submit via form submit button
      await page.click('[role=dialog] button[type="submit"]');
      await page.waitForSelector('[role=dialog]', { state: 'hidden' });
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: ss('05_three_tasks') });

    // ── 6. Filter tasks by status (using page filter, not dialog) ──────────
    // Filter selects are outside any dialog now
    const pageFilterTriggers = page.locator('button[role=combobox]');
    if (await pageFilterTriggers.count() > 0) {
      await pageFilterTriggers.first().click();
      await page.waitForTimeout(300);
      const todoOpt = page.locator('[role=option]:has-text("Todo")');
      if (await todoOpt.count() > 0) {
        await todoOpt.first().click();
        await page.waitForTimeout(500);
      } else {
        await page.keyboard.press('Escape');
      }
    }
    await page.screenshot({ path: ss('06_filtered') });

    // ── 7. Switch to board view ────────────────────────────────────────────
    const boardBtn = page.locator('button:has-text("Board")').first();
    if (await boardBtn.count() > 0) {
      await boardBtn.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: ss('07_board_view') });

    // ── 8. Toggle dark mode ────────────────────────────────────────────────
    // Navbar button has title="Toggle dark mode"
    await page.click('button[title="Toggle dark mode"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: ss('08_dark_mode') });

    // ── 9. Mobile viewport ─────────────────────────────────────────────────
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: ss('09_mobile') });

    // ── 10. Refresh on project detail stays on the same page ──────────────
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(BASE_URL + '/projects');
    await page.waitForURL('**/projects');
    await page.waitForTimeout(500);
    await page.click('text=E2E Test Project');
    await page.waitForURL('**/projects/**');
    await page.waitForTimeout(800);
    const projectUrl = page.url();
    expect(projectUrl).toContain('/projects/');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(projectUrl);
    await expect(page).toHaveTitle('TaskFlow');
    // Should still see the project heading, not a JSON response or login redirect
    await expect(page.locator('h1, h2').filter({ hasText: 'E2E Test Project' })).toBeVisible();
    await page.screenshot({ path: ss('10_after_refresh') });

    // ── 12. Console errors check ───────────────────────────────────────────
    const nonTrivialErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('404') &&
      !e.includes('ResizeObserver') &&
      !e.includes('ERR_ABORTED')
    );
    if (nonTrivialErrors.length > 0) {
      console.log('Non-trivial console errors:', nonTrivialErrors);
    }
    expect(nonTrivialErrors).toHaveLength(0);

    console.log('Screenshots saved to', SS_DIR);
    fs.readdirSync(SS_DIR).forEach(f => console.log(' -', f));
  });
});
