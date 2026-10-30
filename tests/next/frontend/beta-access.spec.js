const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

// UI-only checks: serve the real pages/scripts with explicit API fakes. These
// prove form behaviour, not authentication, provisioning or database isolation.
async function pages(page, session = { actor: null, csrf: 'fictional-beta-csrf' }) {
  const root = path.resolve(__dirname, '../../..');
  for (const file of ['join.html', 'beta.html', 'js/beta-access.js']) {
    await page.route(url => url.pathname === '/' + file, route => {
      const source = path.join(root, 'app-next', file);
      return fs.existsSync(source)
        ? route.fulfill({ contentType: file.endsWith('.js') ? 'application/javascript' : 'text/html', body: fs.readFileSync(source, 'utf8') })
        : route.continue();
    });
  }
  if (session) await page.route('**/api/session', route => route.fulfill({ json: session }));
}

async function fillAccount(page, password = 'fictional-password-only') {
  await page.getByLabel('Username', { exact: true }).fill('new-reader');
  await page.getByLabel('New password', { exact: true }).fill(password);
  if (await page.getByLabel('Confirm password', { exact: true }).isVisible()) await page.getByLabel('Confirm password', { exact: true }).fill(password);
}

async function registrationSignIn(page, response = { actor: 'fictional-new-user', workspace: 'fictional-new-book' }) {
  await page.route('**/api/sign-in', route => route.fulfill({ json: response }));
  await page.route(url => url.pathname === '/', route => route.fulfill({ contentType: 'text/html', body: '<h1>My Words</h1>' }));
}

for (const width of [390, 820]) test(`activation clears the private fragment and reaches sign-in at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await pages(page);
  let submitted, signIns = 0;
  await page.route('**/api/sign-in', route => { signIns++; return route.abort(); });
  await page.route('**/api/activate', route => {
    submitted = { body: route.request().postDataJSON(), csrf: route.request().headers()['x-next-csrf'] };
    return route.fulfill({ json: { success: true, username: 'new-reader' } });
  });
  await page.goto('/join.html#token=fictional-onetime-token');
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  expect(new URL(page.url()).searchParams.get('access')).toBe('private-link');
  expect(await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]))).not.toContain('fictional-onetime-token');
  await fillAccount(page);
  await page.screenshot({ path: testInfo.outputPath(`join-${width}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Account ready');
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveValue('');
  await expect(page.locator('#activation-form')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/');
  expect(submitted).toEqual({ body: { token: 'fictional-onetime-token', username: 'new-reader', password: 'fictional-password-only' }, csrf: 'fictional-beta-csrf' });
  expect(signIns).toBe(0);
});

test('activation preserves failed input, blocks repeat submission and allows retry', async ({ page }) => {
  await pages(page);
  let requests = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/activate', async route => {
    requests++;
    if (requests === 1) return route.fulfill({ status: 503, json: { error: 'Cannot connect right now. Try again.' } });
    await pending;
    return route.fulfill({ json: { success: true, username: 'new-reader' } });
  });
  await page.goto('/join.html#token=fictional-retry-token');
  await fillAccount(page);
  await page.getByLabel('Confirm password', { exact: true }).fill('a-different-password');
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('passwords do not match');
  expect(requests).toBe(0);
  await page.getByLabel('Confirm password', { exact: true }).fill('fictional-password-only');
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Try again');
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('fictional-password-only');
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await expect(page.getByLabel('Username', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Set password', exact: true })).toBeDisabled();
  await page.locator('#activation-form').evaluate(form => form.requestSubmit());
  expect(requests).toBe(2);
  release();
  await expect(page.getByRole('status')).toContainText('Account ready');
});

test('activation explains invalid entries simply and preserves password limits', async ({ page }) => {
  await pages(page);
  let submitted;
  await page.route('**/api/activate', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { success: true, username: 'new-reader' } });
  });
  await page.goto('/join.html#token=fictional-validation-token');
  await fillAccount(page);
  await page.getByLabel('Username', { exact: true }).fill('Upper Case');
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('without spaces');
  await page.getByLabel('Username', { exact: true }).fill('new-reader');
  await page.getByLabel('New password', { exact: true }).fill('short');
  await page.getByLabel('Confirm password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Add another word');
  await fillAccount(page, '🔑'.repeat(19));
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('too long');
  expect(submitted).toBeUndefined();
  // Six accented characters occupy 12 UTF-8 bytes: the server contract uses bytes.
  await fillAccount(page, 'éééééé');
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Account ready');
  expect(submitted.password).toBe('éééééé');
});

test('joining uses short instructions and accepts capital letters in a username', async ({ page }) => {
  await pages(page);
  await registrationSignIn(page);
  let submitted;
  await page.route('**/api/register', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { success: true, username: 'new-reader' } });
  });
  await page.goto('/join.html');
  await expect(page.locator('#username-help')).toHaveText('Use your first name, like Alice.');
  await expect(page.locator('#password-help')).toHaveText('Use a few words you can remember. Spaces are fine.');
  await expect(page.getByLabel('Confirm password', { exact: true })).toBeHidden();
  await fillAccount(page);
  await page.getByLabel('Username', { exact: true }).fill('New-Reader');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My Words', exact: true })).toBeVisible();
  expect(submitted.username).toBe('new-reader');
});

test('the reusable join link registers without an invitation and preserves entries on errors', async ({ page }, testInfo) => {
  await pages(page);
  await registrationSignIn(page);
  let submitted, requests = 0;
  await page.route('**/api/register', route => {
    submitted = route.request().postDataJSON(); requests++;
    return requests === 1 ? route.fulfill({ status: 409, json: { error: 'That username is already in use. Choose another username.' } }) : route.fulfill({ json: { success: true, username: 'new-reader' } });
  });
  await page.goto('/join.html');
  await expect(page.getByRole('heading', { name: 'Create your account', exact: true })).toBeVisible();
  await fillAccount(page);
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).press('Enter');
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('type', 'password');
  for (const width of [390, 820]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`register-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already in use');
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('fictional-password-only');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My Words', exact: true })).toBeVisible();
  expect(submitted).toEqual({ username: 'new-reader', password: 'fictional-password-only' });
});

test('signup opens My Words using the chosen password once, without storing it', async ({ page }) => {
  await pages(page); await registrationSignIn(page);
  const registrations = [], signIns = [];
  await page.route('**/api/register', route => { registrations.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true, username: 'esme' } }); });
  await page.route('**/api/sign-in', route => { signIns.push(route.request().postDataJSON()); return route.fulfill({ json: { actor: 'fictional-esme', workspace: 'fictional-esme-book' } }); });
  await page.goto('/join.html');
  await page.getByLabel('Username', { exact: true }).fill('Esme');
  await page.getByLabel('New password', { exact: true }).fill('fictional phrase with spaces');
  await expect(page.getByLabel('Confirm password', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My Words', exact: true })).toBeVisible();
  expect(registrations).toEqual([{ username: 'esme', password: 'fictional phrase with spaces' }]);
  expect(signIns).toEqual([{ name: 'esme', password: 'fictional phrase with spaces' }]);
  expect(await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]))).not.toContain('fictional phrase with spaces');
});

test('a failed automatic sign-in keeps the created account separate from signup retry', async ({ page }) => {
  await pages(page);
  let registrations = 0;
  await page.route('**/api/register', route => { registrations++; return route.fulfill({ json: { success: true, username: 'new-reader' } }); });
  await page.route('**/api/sign-in', route => route.fulfill({ status: 503, json: { error: 'Cannot connect right now.' } }));
  await page.goto('/join.html'); await fillAccount(page);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your account is ready');
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeFocused();
  await expect(page.locator('#activation-form')).toBeHidden();
  expect(registrations).toBe(1);
  expect(await page.locator('#activation-password').inputValue()).toBe('');
});

test('self-registration reports a full beta and prevents repeat submission', async ({ page }) => {
  await pages(page);
  let requests = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/register', async route => {
    requests++; await pending;
    return route.fulfill({ status: 409, json: { error: 'The beta is full. All 12 places are taken or reserved.' } });
  });
  await page.goto('/join.html'); await fillAccount(page);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeDisabled();
  await page.locator('#activation-form').evaluate(form => form.requestSubmit());
  release();
  await expect(page.getByRole('alert')).toContainText('beta is full');
  expect(requests).toBe(1);
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('new-reader');
});

test('reloading a private link never turns password recovery into self-registration', async ({ page }) => {
  await pages(page);
  let registrations = 0;
  await page.route('**/api/register', route => { registrations++; return route.abort(); });
  await page.goto('/join.html#token=fictional-recovery-token');
  await expect(page.getByRole('button', { name: 'Set password', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('original');
  await expect(page.locator('#activation-form')).toBeHidden();
  expect(registrations).toBe(0);
  expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain('fictional-recovery-token');
  await page.goto('/join.html');
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();
});

test('signed-in visitors are told to sign out before creating a different account', async ({ page }) => {
  await pages(page, { actor: 'existing-user', csrf: 'fictional-beta-csrf' });
  let registrations = 0;
  await page.route('**/api/register', route => { registrations++; return route.abort(); });
  await page.goto('/join.html'); await fillAccount(page);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already signed in');
  expect(registrations).toBe(0);
});

for (const width of [390, 820]) test(`organiser creates invitation and recovery links at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await pages(page, { actor: 'fictional-organiser', csrf: 'fictional-beta-csrf' });
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Unavailable'); } }, configurable: true }));
  await page.route('**/api/beta', route => route.fulfill({ json: { admin: true, accounts: [{ username: 'first-reader' }, { username: 'second-reader' }], accountCount: 2 } }));
  const submissions = [];
  await page.route('**/api/beta/invitations', route => {
    const body = route.request().postDataJSON(); submissions.push(body);
    return route.fulfill({ json: { url: `/join.html#token=fictional-${body.recoveryFor ? 'recovery' : 'invite'}-token`, expiresAt: '2026-11-01T12:00:00.000Z', kind: body.recoveryFor ? 'recovery' : 'invite' } });
  });
  await page.goto('/beta.html');
  await expect(page.getByRole('status')).toContainText('2 accounts');
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
  const link = page.locator('#private-link');
  await expect(link).toHaveValue(/\/join\.html#token=fictional-invite-token$/);
  expect(submissions[0]).toEqual({});
  await page.getByText('Copy the link instead', { exact: true }).click();
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('selected');
  expect(await link.evaluate(input => [input.selectionStart, input.selectionEnd === input.value.length])).toEqual([0, true]);
  await page.getByText('Help with a password', { exact: true }).click();
  await page.getByLabel('Account to recover', { exact: true }).selectOption('second-reader');
  await page.getByRole('button', { name: 'Create recovery link', exact: true }).click();
  await expect(link).toHaveValue(/\/join\.html#token=fictional-recovery-token$/);
  expect(submissions[1]).toEqual({ recoveryFor: 'second-reader' });
  await expect(page.getByText(/old sessions close/i)).toBeVisible();
  await expect(page.getByText(/saved words are not deleted/i)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath(`beta-${width}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('organiser displays the absolute invitation URL returned by the backend', async ({ page, baseURL }) => {
  await pages(page, { actor: 'fictional-organiser', csrf: 'fictional-beta-csrf' });
  await page.route('**/api/beta', route => route.fulfill({ json: { admin: true, accounts: [], accountCount: 0 } }));
  await page.route('**/api/beta/invitations', route => route.fulfill({ json: {
    url: `${baseURL}/join.html#token=fictional-absolute-token`, expiresAt: '2026-11-01T12:00:00.000Z',
    username: null, recovery: false, kind: 'invitation'
  } }));
  await page.goto('/beta.html');
  await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
  await expect(page.locator('#private-link')).toHaveValue(`${baseURL}/join.html#token=fictional-absolute-token`);
  await expect(page.getByRole('status')).toContainText('Invitation link ready');
});

test('organiser rejects links outside the exact private activation destination', async ({ page, baseURL }) => {
  await pages(page, { actor: 'fictional-organiser', csrf: 'fictional-beta-csrf' });
  await page.route('**/api/beta', route => route.fulfill({ json: { admin: true, accounts: [], accountCount: 0 } }));
  const urls = [
    'https://another-origin.invalid/join.html#token=fictional-token',
    `${baseURL}/another-page#token=fictional-token`,
    `${baseURL}/join.html?extra=value#token=fictional-token`,
    `${baseURL}/join.html#token=fictional-token&extra=value`,
    `${baseURL}/join.html#token=`
  ];
  let next = 0;
  await page.route('**/api/beta/invitations', route => route.fulfill({ json: { url: urls[next++], expiresAt: '2026-11-01T12:00:00.000Z', kind: 'invitation' } }));
  await page.goto('/beta.html');
  await page.getByText('Choose their username (optional)', { exact: true }).click();
  await page.getByLabel('Username (optional)', { exact: true }).fill('bound-reader');
  for (const url of urls) {
    await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
    await expect(page.getByRole('alert'), url).toContainText('Could not confirm the private link');
    await expect(page.locator('#private-link-result')).toBeHidden();
    await expect(page.getByLabel('Username (optional)', { exact: true })).toHaveValue('bound-reader');
  }
});

for (const status of [401, 403]) test(`organiser page explains access failure ${status} without showing account controls`, async ({ page }) => {
  await pages(page, { actor: 'fictional-reader', csrf: 'fictional-beta-csrf' });
  await page.route('**/api/beta', route => route.fulfill({ status, json: { error: 'Access denied' } }));
  await page.goto('/beta.html');
  await expect(page.getByRole('alert')).toContainText(status === 401 ? 'Sign in' : 'organizer');
  await expect(page.locator('#beta-controls')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
});

test('organiser keeps a failed invitation username and retries without a duplicate submission', async ({ page }) => {
  await pages(page, { actor: 'fictional-organiser', csrf: 'fictional-beta-csrf' });
  await page.route('**/api/beta', route => route.fulfill({ json: { admin: true, accounts: [], accountCount: 0 } }));
  let requests = 0, release, submitted;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/beta/invitations', async route => {
    requests++;
    submitted = route.request().postDataJSON();
    if (requests === 1) return route.fulfill({ status: 503, json: { error: 'Try again later.' } });
    await pending;
    return route.fulfill({ json: { url: '/join.html#token=fictional-bound-token', expiresAt: '2026-11-01T12:00:00.000Z', kind: 'invite' } });
  });
  await page.goto('/beta.html');
  await page.getByText('Choose their username (optional)', { exact: true }).click();
  await page.getByLabel('Username (optional)', { exact: true }).fill('bound-reader');
  await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Try again');
  await expect(page.getByLabel('Username (optional)', { exact: true })).toHaveValue('bound-reader');
  await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
  await expect(page.getByLabel('Username (optional)', { exact: true })).toBeDisabled();
  await page.locator('#invitation-form').evaluate(form => form.requestSubmit());
  expect(requests).toBe(2);
  release();
  await expect(page.locator('#private-link')).toHaveValue(/fictional-bound-token$/);
  expect(submitted).toEqual({ username: 'bound-reader' });
});

for (const width of [390, 820]) test(`Home leads the organizer through creating and sending an invitation at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await pages(page, null);
  await page.route('**/js/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'globalThis.NextRuntime = {invitedBeta:true};' }));
  await page.route('**/api/beta', route => route.fulfill({ json: { admin: true, accounts: [{ username: 'owner' }], accountCount: 1 } }));
  let invitations = 0;
  await page.route('**/api/beta/invitations', route => { invitations++; return route.fulfill({ json: { url: '/join.html#token=fictional-send-token', expiresAt: '2026-11-01T12:00:00.000Z', kind: 'invitation' } }); });
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async value => { window.sharedInvitation = value; } }));
  await page.goto('/');
  await page.getByLabel('Account', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Invite someone', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath(`invite-home-${width}.png`), fullPage: true });
  if (width === 820) {
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Update app', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Print Communication book', exact: true })).toBeInViewport();
    await expect(page.getByRole('region', { name: 'Print booklets', exact: true }).getByRole('heading', { name: 'Situation notebooks', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Account', exact: true }).getByRole('link', { name: 'Invite someone', exact: true })).toHaveAttribute('href', '/beta.html');
    await expect(page.getByRole('region', { name: 'Backups and recovery', exact: true }).getByRole('link', { name: 'Invite someone', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('settings-with-invitations-820.png'), fullPage: true });
  }
  await page.getByRole('link', { name: 'Invite someone', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Invite someone', exact: true })).toBeVisible();
  await expect(page.getByLabel('Username (optional)', { exact: true })).toBeHidden();
  await expect(page.getByLabel('Account to recover', { exact: true })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath(`invite-create-${width}.png`), fullPage: true });
  await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Send the invitation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Send invitation', exact: true }).click();
  expect(await page.evaluate(() => window.sharedInvitation)).toEqual({ title: 'Join My Words Beta', text: 'You’re invited to My Words. Open this link to choose your own username and password. Please use it within 48 hours.', url: new URL('/join.html#token=fictional-send-token', page.url()).href });
  await expect(page.getByRole('button', { name: 'Make another invitation', exact: true })).toBeVisible();
  expect(invitations).toBe(1);
  await page.screenshot({ path: testInfo.outputPath(`invite-workflow-${width}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Make another invitation', exact: true }).click();
  expect(invitations).toBe(1);
  await expect(page.getByRole('button', { name: 'Create invitation link', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send invitation', exact: true })).toBeHidden();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print Communication book', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Invite someone', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create invitation link', exact: true })).toBeVisible();
  expect(invitations).toBe(1);
});

for (const behaviour of ['cancel', 'unavailable']) test(`sending an invitation handles ${behaviour} without creating another link`, async ({ page }) => {
  await pages(page, { actor: 'fictional-organizer', csrf: 'fictional-beta-csrf' });
  await page.route('**/api/beta', route => route.fulfill({ json: { admin: true, accounts: [], accountCount: 0 } }));
  let invitations = 0;
  await page.route('**/api/beta/invitations', route => { invitations++; return route.fulfill({ json: { url: '/join.html#token=fictional-kept-token', expiresAt: '2026-11-01T12:00:00.000Z', kind: 'invitation' } }); });
  await page.addInitScript(behaviour => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: behaviour === 'cancel' ? async () => { throw new DOMException('Cancelled', 'AbortError'); } : undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedInvitation = text; } } });
  }, behaviour);
  await page.goto('/beta.html');
  await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
  await page.getByRole('button', { name: 'Send invitation', exact: true }).click();
  await expect(page.locator('#private-link')).toHaveValue(/fictional-kept-token$/);
  expect(invitations).toBe(1);
  if (behaviour === 'cancel') {
    expect(await page.evaluate(() => window.copiedInvitation)).toBeUndefined();
    await expect(page.getByRole('status')).toContainText('kept');
  } else {
    expect(await page.evaluate(() => window.copiedInvitation)).toContain('/join.html#token=fictional-kept-token');
    await expect(page.getByRole('status')).toContainText('Paste');
  }
});

test('the invitation entry is absent for an invited reader', async ({ page }) => {
  await page.route('**/js/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'globalThis.NextRuntime = {invitedBeta:true};' }));
  await page.route('**/api/beta', route => route.fulfill({ status: 403, json: { error: 'Access denied' } }));
  await page.goto('/');
  await page.getByLabel('Account', { exact: true }).fill('alex');
  await page.getByLabel('Password', { exact: true }).fill('alex-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Invite someone', exact: true })).toBeHidden();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print Communication book', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Invite someone', exact: true })).toBeHidden();
  await expect(page.getByRole('region', { name: 'Account', exact: true })).toHaveCount(0);
});

test('signing in from the invitation page returns there without remembering its address', async ({ page }) => {
  await pages(page, null);
  await page.route('**/js/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'globalThis.NextRuntime = {invitedBeta:true};' }));
  await page.route('**/api/beta', route => route.fulfill({ json: { admin: true, accounts: [{ username: 'owner' }], accountCount: 1 } }));
  await page.goto('/beta.html');
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('return')).toBe('invite');
  await page.getByLabel('Account', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create invitation link', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invite someone', exact: true })).toBeVisible();
});
