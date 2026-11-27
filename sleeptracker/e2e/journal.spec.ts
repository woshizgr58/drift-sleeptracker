import { test, expect } from '@playwright/test';

const local = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
const night = () => {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  end.setHours(7, 0, 0, 0);
  return {
    start: local(new Date(end.getTime() - 8 * 3600000)),
    end: local(end),
  };
};

test('log, reload, edit, delete, undo, and restore both kinds of entry', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Log a night', exact: true }).click();
  const dates = night();
  await page.getByLabel('Bedtime', { exact: true }).fill(dates.start);
  await page.getByLabel('Wake-up', { exact: true }).fill(dates.end);
  await page.getByLabel('Notes').fill('Quiet evening');
  await page.getByRole('button', { name: 'Save sleep' }).click();
  await expect(page.locator('.night-card h2')).toHaveText('8h 00m');
  await page.getByRole('button', { name: 'How awake do you feel?' }).click();
  await page.locator('.scale-option').nth(3).click();
  await page
    .getByRole('button', { name: 'Save check-in', exact: true })
    .click();
  await page.reload();
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(page.locator('.journal-entry')).toHaveCount(2);
  await expect(
    page.locator('.journal-entry').filter({ hasText: 'Quiet evening' }),
  ).toContainText('8h 00m');
  await expect(
    page.locator('.journal-entry').filter({ hasText: '4/7' }),
  ).toContainText('Somewhat foggy');
  await page
    .locator('.journal-entry')
    .filter({ hasText: 'Quiet evening' })
    .click();
  await page.getByLabel('Notes').fill('Updated note');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(
    page.locator('.journal-entry').filter({ hasText: 'Updated note' }),
  ).toBeVisible();
  await page.locator('.journal-entry').filter({ hasText: '4/7' }).click();
  await page.getByRole('button', { name: 'Delete entry', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.journal-entry')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.journal-entry')).toHaveCount(2);
  await page.getByRole('button', { name: 'Settings' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON backup' }).click();
  const download = await downloadPromise;
  const path = (await download.path())!;
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.locator('.status')).toContainText(['2 entries']);
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(page.locator('.journal-entry')).toHaveCount(2);
});

test('invalid date ranges and overlaps cannot create entries', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Log a night', exact: true }).click();
  const dates = night();
  await page.getByLabel('Bedtime', { exact: true }).fill(dates.end);
  await page.getByLabel('Wake-up', { exact: true }).fill(dates.start);
  await page.getByRole('button', { name: 'Save sleep' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Wake-up must be after bedtime',
  );
  await page.getByLabel('Bedtime', { exact: true }).fill(dates.start);
  await page.getByLabel('Wake-up', { exact: true }).fill(dates.end);
  await page.getByRole('button', { name: 'Save sleep' }).click();
  await expect(page.locator('.night-card h2')).toHaveText('8h 00m');
  await page.getByRole('button', { name: 'Log a night', exact: true }).click();
  await page.getByLabel('Bedtime', { exact: true }).fill(dates.start);
  await page.getByLabel('Wake-up', { exact: true }).fill(dates.end);
  await page.getByRole('button', { name: 'Save sleep' }).click();
  await expect(page.getByRole('alert')).toContainText('overlaps');
  await page.getByRole('button', { name: 'Close without saving' }).click();
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(page.locator('.journal-entry')).toHaveCount(1);
});

test('storage failures preserve saved data and the unsaved form', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage full');
    };
  });
  await page.getByRole('button', { name: 'Log a night', exact: true }).click();
  await page.getByRole('button', { name: 'Save sleep' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save');
  await expect(page.getByLabel('Bedtime', { exact: true })).not.toHaveValue('');
});

test('corrupt storage is not silently overwritten', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    localStorage.setItem('CapacitorStorage.drift.journal.v1', '{bad json'),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(
    'No data was overwritten',
  );
  await expect(
    page.getByRole('button', { name: 'Log a night', exact: true }),
  ).toBeDisabled();
});

test('layouts fit a narrow phone and desktop', async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.locator('.night-card')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    for (const name of ['Journal', 'Settings']) {
      await page.getByRole('button', { name, exact: true }).click();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
  }
});

test('account dialog offers login and registration without uploading device entries', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const signIn = page.getByRole('button', { name: 'Sign in or create account' });
  test.skip(!(await signIn.count()), 'Device-only checkout has no AWS configuration.');
  await signIn.click();
  await expect(page.getByRole('tab', { name: 'Sign In', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Create Account', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Confirm Password', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close sign-in', exact: true }).click();
  await expect(signIn).toBeVisible();
});
