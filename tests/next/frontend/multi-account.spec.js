const { test, expect } = require('@playwright/test');
const { openMultiAccount } = require('../harness/multi-account-app');
let fixture;
test.use({ launchOptions: { args: ['--ignore-certificate-errors'] } });
test.beforeAll(async () => { fixture = await openMultiAccount(); });
test.afterAll(async () => { await fixture?.close(); });
// Real adapter, secure browser cookies, CSRF and API; persistence is explicitly
// the memory double here. The same journey also runs against guarded PostgreSQL.
test('two accounts retain their own words and offline drafts across switching', async ({ browser }) => {
  const { accountJourney } = require('../harness/account-journey');
  await accountJourney(browser, fixture);
});
test('repeated sign-in is blocked while the first account request is pending', async ({ browser }) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage(); await page.goto(fixture.origin + '/editor.html');
    const [account] = fixture.accounts;
    await page.getByLabel('Username', { exact: true }).fill(account.username);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    let release; const pending = new Promise(resolve => { release = resolve; }); let calls = 0;
    await page.route('**/api/sign-in', async route => { calls++; await pending; await route.continue(); });
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    try {
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
      await expect(page.getByLabel('Username', { exact: true })).toBeDisabled();
      await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      expect(calls).toBe(1);
    } finally { release(); }
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  } finally { await context.close(); }
});
