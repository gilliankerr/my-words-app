const { savedShortcuts } = require('../saved-shortcuts');
const { test, expect } = require('@playwright/test');
test('supporter preview is a frozen generated PDF, defaults to booklet and keeps unfinished wording out', async ({ page }) => {
  await page.goto('/editor.html'); await page.getByLabel('Account', { exact: true }).fill('alex'); await page.getByLabel('Password', { exact: true }).fill('alex-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await savedShortcuts(page); await page.getByRole('button', { name: 'Edit page', exact: true }).click(); await page.getByLabel('Wording').fill('PRIVATE UNSAVED FICTIONAL DRAFT');
  await page.getByRole('button', { name: 'Return', exact: true }).click(); await page.getByRole('button', { name: 'Print Communication book', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved PDF preview ready.'); await expect(page.getByTitle('Generated PDF preview')).toHaveAttribute('src', /^blob:/);
  await expect(page.getByText(/flip on the short edge/)).toBeVisible(); await expect(page.getByText(/Saved Communication book content prepared/)).toBeVisible();
  const event = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save PDF', exact: true }).click(); const download = await event; await download.saveAs('test-results/next/preview-booklet.pdf');
  const fs = require('node:fs'), pdf = fs.readFileSync('test-results/next/preview-booklet.pdf'); expect(pdf.subarray(0, 5).toString()).toBe('%PDF-'); expect(pdf.toString('latin1')).not.toContain('PRIVATE UNSAVED FICTIONAL DRAFT');
  await page.getByRole('button', { name: 'Return', exact: true }).click(); await page.getByText('More print options', { exact: true }).click(); await page.getByRole('button', { name: 'Print shopping sheet', exact: true }).click();
  await expect(page.getByTitle('Generated PDF preview')).toHaveAttribute('src', /^blob:/); await expect(page.getByRole('heading', { name: 'Preview shopping sheet', exact: true })).toBeVisible();
});
