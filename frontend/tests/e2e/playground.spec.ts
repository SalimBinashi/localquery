import { expect, test, type Page } from '@playwright/test';

async function setEditor(page: Page, testId: string, text: string): Promise<void> {
  await page.getByTestId(`${testId}-input`).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(text);
}

async function ready(page: Page): Promise<void> {
  await expect(page.getByTestId('db-status-pill')).toHaveAttribute('data-status', 'ready');
}

async function run(page: Page, sql: string): Promise<void> {
  await setEditor(page, 'query-editor', sql);
  await page.getByTestId('run-query-button').click();
  await expect(page.getByTestId('query-status')).not.toContainText('Executing');
}

test('A: startup initializes SQLite and builds the default workspace', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await expect(page.getByTestId('seed-report')).toBeVisible();
  await expect(page.getByTestId('schema-summary-table-users')).toContainText('50 rows');
  await expect(page.getByTestId('ddl-editor')).toContainText('CREATE TABLE users');
});

test('B + E: custom schema, 10-row seed report, FK integrity and ERD refresh', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await expect(page.getByTestId('seed-report')).toBeVisible();
  await setEditor(page, 'ddl-editor', 'CREATE TABLE authors (id INTEGER PRIMARY KEY, full_name TEXT NOT NULL);\nCREATE TABLE books (id INTEGER PRIMARY KEY, author_id INTEGER NOT NULL REFERENCES authors(id), title TEXT NOT NULL);\nCREATE TABLE reviews (id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES books(id), rating INTEGER CHECK (rating BETWEEN 1 AND 5));');
  await page.getByTestId('seed-density-10').click();
  await page.getByTestId('generate-seed-button').click();
  await expect(page.getByTestId('seed-inserted-reviews')).toHaveText('10');
  await expect(page.getByTestId('seed-report-summary')).toContainText('30 rows inserted');
  await run(page, 'SELECT COUNT(*) AS orphans FROM books b LEFT JOIN authors a ON a.id = b.author_id WHERE a.id IS NULL;');
  await expect(page.getByTestId('cell-0-0')).toHaveText('0');
  await page.getByTestId('erd-tab-button').click();
  await expect(page.getByTestId('erd-node-books')).toBeVisible();
  await expect(page.getByTestId('erd-panel')).toHaveAttribute('data-relationships', '2');
  await run(page, 'CREATE TABLE editions (id INTEGER PRIMARY KEY, book_id INTEGER REFERENCES books(id));');
  await page.getByTestId('erd-tab-button').click();
  await expect(page.getByTestId('erd-node-editions')).toBeVisible();
  await expect(page.getByTestId('erd-panel')).toHaveAttribute('data-relationships', '3');
});

test('C + D: joins, errors, and INSERT/UPDATE/DELETE', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await expect(page.getByTestId('seed-report')).toBeVisible();
  await page.getByTestId('run-query-button').click();
  await expect(page.getByTestId('results-header-1')).toContainText('customer');
  await run(page, 'SELEC nonsense;');
  await expect(page.getByTestId('query-error')).toHaveAttribute('data-category', 'syntax');
  await run(page, "INSERT INTO users (email, first_name, last_name) VALUES ('e2e@example.com', 'E', 'Two') RETURNING id;");
  await expect(page.getByTestId('results-row-count')).toContainText('1 row');
  await run(page, "UPDATE users SET last_name = 'Updated' WHERE email = 'e2e@example.com';");
  await expect(page.getByTestId('statement-changes')).toContainText('1 row(s) changed');
  await run(page, "SELECT last_name FROM users WHERE email = 'e2e@example.com';");
  await expect(page.getByTestId('cell-0-0')).toHaveText('Updated');
  await run(page, "DELETE FROM users WHERE email = 'e2e@example.com';");
  await expect(page.getByTestId('statement-changes')).toContainText('1 row(s) changed');
  await expect(page.getByTestId('workspace-status-pill')).toHaveAttribute('data-status', 'db-diverged');
});

test('F: share link restores editors in a fresh context without running the query', async ({ page, browser, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await ready(page);
  await expect(page.getByTestId('seed-report')).toBeVisible();
  await page.getByTestId('seed-density-10').click();
  await page.getByTestId('random-seed-input').fill('777');
  await setEditor(page, 'query-editor', 'SELECT COUNT(*) AS n FROM users;');
  await page.getByTestId('share-workspace-button').click();
  await expect(page.getByTestId('share-copy-status')).toHaveAttribute('data-status', /copied|failed/);
  const url = await page.getByTestId('share-url-input').inputValue();
  expect(url).toContain('#ws1.');
  expect(page.url()).toBe(url);
  const fresh = await browser.newContext();
  const p2 = await fresh.newPage();
  await p2.goto(url);
  await ready(p2);
  await expect(p2.getByTestId('query-editor')).toContainText('SELECT COUNT(*) AS n FROM users;');
  await expect(p2.getByTestId('random-seed-input')).toHaveValue('777');
  await expect(p2.getByTestId('seed-density-10')).toHaveAttribute('aria-checked', 'true');
  await expect(p2.getByTestId('results-empty')).toBeVisible();
  await p2.getByTestId('notice-apply-schema-button').click();
  await expect(p2.getByTestId('seed-inserted-users')).toHaveText('10');
  await p2.getByTestId('run-query-button').click();
  await expect(p2.getByTestId('cell-0-0')).toHaveText('10');
  await fresh.close();
});

test('G: malformed URL falls back safely', async ({ page }) => {
  await page.goto('./#ws1.%%%corrupt');
  await ready(page);
  await expect(page.getByTestId('notice-warning')).toContainText('rejected');
  await expect(page.getByTestId('seed-report')).toBeVisible();
  await page.getByTestId('run-query-button').click();
  await expect(page.getByTestId('results-grid')).toBeVisible();
});

test('H: no workspace content leaves the browser', async ({ page }) => {
  const leaks: string[] = [];
  page.on('request', (req) => {
    const body = req.postData() ?? '';
    if (req.method() !== 'GET' || /SELECT|CREATE TABLE|example\.com/i.test(body + req.url().split('#')[0])) leaks.push(`${req.method()} ${req.url()}`);
  });
  await page.goto('./');
  await ready(page);
  await expect(page.getByTestId('seed-report')).toBeVisible();
  await page.getByTestId('run-query-button').click();
  await expect(page.getByTestId('results-grid')).toBeVisible();
  await page.getByTestId('share-workspace-button').click();
  await expect(page.getByTestId('share-url-input')).toBeVisible();
  expect(leaks).toEqual([]);
});

for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'tablet', width: 820, height: 1180 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`I: usable at ${vp.name} size`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('./');
    await ready(page);
    if (vp.width < 768) await page.getByTestId('mobile-tab-query').click();
    await page.getByTestId('run-query-button').click();
    await expect(page.getByTestId('results-grid')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });
}
