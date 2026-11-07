import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { backend } from './backend';
import { readFile } from 'node:fs/promises';
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
test('coach imports and assigns; athlete logs partially offline, reloads and synchronizes once', async ({
  page,
  context,
}) => {
  const server = await backend();
  try {
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Let’s get to work, Alex.' })).toBeVisible();
    await page.evaluate(() => {
      location.hash = 'tab=coach';
    });
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    const program = {
      schemaVersion: 1,
      name: 'Offline strength',
      description: 'E2E regression program',
      weeks: [
        {
          week: 1,
          workouts: [
            {
              day: 1,
              title: 'Ten movements',
              blocks: [
                {
                  label: 'A',
                  kind: 'circuit',
                  instructions: 'Move with control',
                  entries: Array.from({ length: 10 }, (_, i) => ({
                    exerciseKey: `movement-${i}`,
                    name: `Movement ${i + 1}`,
                    label: `A${i + 1}`,
                    eligible: true,
                    aliases: [],
                    prescription: { sets: 3, reps: '10' },
                    instructions: '',
                  })),
                },
              ],
            },
          ],
        },
      ],
    };
    await page.getByLabel('Program JSON', { exact: true }).fill(JSON.stringify(program));
    await page.getByRole('button', { name: 'Validate & preview' }).click();
    await expect(page.getByText('Valid schema v1')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm import & save' }).click();
    await expect(page.getByText('Program saved. Ready to assign.')).toBeVisible();
    await page.getByRole('button', { name: 'Assign program', exact: true }).click();
    await page.getByLabel('Day 1 date').fill(today());
    await page.getByRole('button', { name: 'Confirm assignment' }).click();
    await expect(
      page.getByText('Program assigned. Training is ready in the athlete’s calendar.'),
    ).toBeVisible();
    await page.evaluate(() => {
      location.hash = 'tab=home';
    });
    await page.getByRole('button', { name: 'Open workout', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ten movements.' })).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    server.setOnline(false);
    await context.setOffline(true);
    await expect(page.getByText('Offline · saved on device')).toBeVisible();
    for (let i = 1; i <= 9; i++)
      await page
        .getByRole('checkbox', { name: `Complete A${i} Movement ${i}`, exact: true })
        .click();
    await page.getByLabel('Actual load · A1', { exact: true }).fill('24 kg');
    await page.getByLabel('Notes · A1', { exact: true }).fill('Strong and controlled');
    await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
    await expect(
      page.getByText('Session finished · 90% of exercises completed.').first(),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ten movements.' })).toBeVisible();
    await expect(page.getByLabel('Actual load · A1', { exact: true })).toHaveValue('24 kg');
    await expect(page.getByLabel('Notes · A1', { exact: true })).toHaveValue(
      'Strong and controlled',
    );
    await expect(
      page.getByRole('checkbox', { name: 'Complete A10 Movement 10', exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByText('Session finished · 90% of exercises completed.').first(),
    ).toBeVisible();
    await page.evaluate(() => {
      location.hash = 'tab=profile';
    });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      page.getByText(
        'Sync or export and explicitly discard pending edits in Profile before signing out.',
      ),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Profile & preferences.' })).toBeVisible();
    await page.evaluate(() => {
      location.hash = 'tab=home';
    });
    await page.getByRole('button', { name: 'Review workout', exact: true }).click();
    await expect(page.getByLabel('Actual load · A1', { exact: true })).toHaveValue('24 kg');
    server.setOnline(true);
    await context.setOffline(false);
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    const snapshots = (
      await server.db.query<{ data: import('../../src/lib/domain').WorkoutSession[] }>(
        'select public.get_my_sessions() as data',
      )
    ).rows[0].data;
    expect(snapshots[0].status).toBe('finished');
    expect(snapshots[0].blocks[0].entries.filter((e) => e.completed)).toHaveLength(9);
    expect(snapshots[0].blocks[0].entries[0].load).toBe('24 kg');
    const receipts = (
      await server.db.query<{ n: number }>('select count(*) as n from public.sync_receipts')
    ).rows[0].n;
    expect(Number(receipts)).toBeGreaterThanOrEqual(12);
    await page.getByRole('button', { name: 'Reopen session' }).click();
    await page.getByRole('checkbox', { name: 'Complete A1 Movement 1', exact: true }).click();
    await expect(
      page.getByRole('checkbox', { name: 'Complete A1 Movement 1', exact: true }),
    ).not.toBeChecked();
    await page.evaluate(() => {
      location.hash = 'tab=history';
    });
    await expect(page.getByRole('heading', { name: 'The work you’ve put in.' })).toBeVisible();
  } finally {
    await context.setOffline(false);
    await server.close();
  }
});
test('calendar views, theme persistence, accessible layouts and history references', async ({
  page,
}) => {
  const server = await backend();
  try {
    const program = JSON.parse(await readFile('docs/examples/foundation.json', 'utf8'));
    const id = (
      await server.db.query<{ id: string }>('select public.save_program($1::jsonb) as id', [
        JSON.stringify(program),
      ])
    ).rows[0].id;
    await server.db.query('select public.assign_program($1,$2,$3)', [
      id,
      '11111111-1111-4111-8111-111111111111',
      today(),
    ]);
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Let’s get to work, Alex.' })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/dashboard-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.evaluate(() => {
      location.hash = 'tab=workouts';
    });
    await page.getByRole('button', { name: 'month', exact: true }).click();
    await expect(page.locator('.month-grid')).toBeVisible();
    await page.getByRole('button', { name: 'day', exact: true }).click();
    await expect(page.getByRole('button', { name: /Lower body · Build the base/ })).toBeVisible();
    await page.getByRole('button', { name: /Lower body · Build the base/ }).click();
    await expect(page.getByRole('heading', { name: 'SUPERSET', exact: true })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await expect(page.getByRole('link', { name: 'Reference', exact: true })).toHaveAttribute(
      'href',
      /youtube/,
    );
    await page.screenshot({
      path: `test-results/workout-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'View history', exact: true }).first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveAccessibleName(/history/);
    await expect(page.getByRole('button', { name: 'Close dialog' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'View history', exact: true }).first(),
    ).toBeFocused();
    await page.evaluate(() => {
      location.hash = 'tab=profile';
    });
    await page.getByRole('button', { name: 'dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.evaluate(() => {
      location.hash = 'tab=home';
    });
    await expect(page.getByRole('heading', { name: 'Let’s get to work, Alex.' })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/dashboard-dark-${test.info().project.name}.png`,
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  } finally {
    await server.close();
  }
});

test('brand, authentication and coach editor remain accessible across responsive themes', async ({
  page,
}) => {
  const server = await backend();
  const accessible = async () => {
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  };
  try {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
    await accessible();
    await page.screenshot({
      path: `test-results/auth-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.getByLabel('Email', { exact: true }).fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Let’s get to work, Alex.' })).toBeVisible();
    // Skipping content must focus the main region without changing the hash route.
    await page.getByRole('link', { name: 'Skip to content' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    const originalViewport = page.viewportSize()!;
    for (const width of [320, 430, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole('button', { name: 'Explore your week' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
    }
    await page.setViewportSize(originalViewport);
    await page.evaluate(() => {
      location.hash = 'tab=coach';
    });
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    await page.getByLabel('Program JSON', { exact: true }).fill('{broken');
    await page.getByRole('button', { name: 'Validate & preview' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid JSON' })).toBeVisible();
    await accessible();
    await page.getByRole('button', { name: 'Load example', exact: true }).click();
    await page.getByRole('button', { name: 'Builder', exact: true }).click();
    await expect(page.locator('.program-builder')).toBeVisible();
    await accessible();
    await page.screenshot({
      path: `test-results/coach-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.evaluate(() => {
      location.hash = 'tab=profile';
    });
    await page.getByRole('button', { name: 'dark', exact: true }).click();
    await accessible();
    await page.evaluate(() => {
      location.hash = 'tab=coach';
    });
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    await page.getByRole('button', { name: 'Load example', exact: true }).click();
    await page.getByRole('button', { name: 'Builder', exact: true }).click();
    await expect(page.locator('.program-builder')).toBeVisible();
    await accessible();
    await page.screenshot({
      path: `test-results/coach-dark-${test.info().project.name}.png`,
      fullPage: true,
    });
  } finally {
    await server.close();
  }
});
