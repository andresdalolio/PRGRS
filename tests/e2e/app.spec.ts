import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { backend, userId } from './backend';
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
              description: 'Stay controlled and record the work.',
              category: 'Strength',
              estimatedMinutes: 45,
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
    await expect(
      page.getByText('Stay controlled and record the work.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Strength · 45 min estimated', { exact: true })).toBeVisible();
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
test('removing a program confirms deletion, unassigns it and preserves workout history', async ({
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
    await server.db.query('select public.assign_program($1,$2,$3)', [id, userId, today()]);
    const snapshots = (
      await server.db.query<{ data: import('../../src/lib/domain').WorkoutSession[] }>(
        'select public.get_my_sessions() as data',
      )
    ).rows[0].data;
    const finished = snapshots[0];
    await server.db.query('select public.apply_session_mutation($1,$2,0,$3::jsonb)', [
      crypto.randomUUID(),
      finished.id,
      JSON.stringify({
        status: 'finished',
        finishedAt: new Date().toISOString(),
        results: finished.blocks.flatMap((b) =>
          b.entries.map((e) => ({ entryId: e.id, completed: false, load: '', notes: '' })),
        ),
      }),
    ]);
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review workout', exact: true })).toBeVisible();
    await page.evaluate(() => {
      location.hash = 'tab=coach';
    });
    await page.getByRole('button', { name: `Remove ${program.name}`, exact: true }).click();
    let dialog = page.getByRole('dialog', { name: `Remove ${program.name}?` });
    await expect(dialog.getByText(/unassigns it from every athlete/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(
      (await server.db.query('select id from public.programs where id=$1', [id])).rows,
    ).toHaveLength(1);
    await page.getByRole('button', { name: `Remove ${program.name}`, exact: true }).click();
    dialog = page.getByRole('dialog', { name: `Remove ${program.name}?` });
    await dialog.getByRole('button', { name: 'Remove program & unassign', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Program removed and unassigned from all athletes.')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Build your first training block' }),
    ).toBeVisible();
    expect(
      (await server.db.query('select id from public.programs where id=$1', [id])).rows,
    ).toHaveLength(0);
    expect(
      (await server.db.query('select id from public.program_assignments where program_id=$1', [id]))
        .rows,
    ).toHaveLength(0);
    const remaining = (
      await server.db.query<{ data: import('../../src/lib/domain').WorkoutSession[] }>(
        'select public.get_my_sessions() as data',
      )
    ).rows[0].data;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: finished.id, status: 'finished', assignmentId: null });
    expect(remaining[0].blocks).toEqual(finished.blocks);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Build your first training block' }),
    ).toBeVisible();
    await page.evaluate(() => {
      location.hash = 'tab=home';
    });
    await page.getByRole('button', { name: 'Review workout', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: `${finished.title}.`, exact: true }),
    ).toBeVisible();
  } finally {
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
    await page.getByRole('button', { name: 'Create program', exact: true }).click();
    await expect(page.getByLabel('Workout description', { exact: true })).toBeVisible();
    await page.getByLabel('Workout description', { exact: true }).fill('Move with control.');
    await page.getByLabel('Category', { exact: true }).fill('Strength');
    await page.getByLabel('Estimated duration (minutes)', { exact: true }).fill('45');
    await page.getByRole('button', { name: 'Validate & preview' }).click();
    await expect(page.getByText('Strength · 45 min estimated', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
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
    await page.screenshot({ path: `test-results/coach-viewport-${test.info().project.name}.png` });
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
    await page.screenshot({
      path: `test-results/coach-dark-viewport-${test.info().project.name}.png`,
    });
  } finally {
    await server.close();
  }
});

test('reports pull failures and explicitly discards offline edits on sign-out', async ({
  page,
  context,
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
    await expect(page.getByRole('button', { name: 'Open workout', exact: true })).toBeVisible();
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
    // A failed read must not claim that the client is synchronized, even without queued writes.
    server.setSessionReadError('Permission denied during refresh');
    await page.evaluate(() => {
      location.hash = 'tab=profile';
    });
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect(page.getByText('Sync needs attention', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Permission denied during refresh' }),
    ).toBeVisible();
    server.setSessionReadError(null);
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
    await page.evaluate(() => {
      location.hash = 'tab=home';
    });
    await page.getByRole('button', { name: 'Open workout', exact: true }).click();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await page.getByLabel('Notes · B1', { exact: true }).fill('Explicitly discarded fixture');
    await page.evaluate(() => {
      location.hash = 'tab=profile';
    });
    await expect(
      page.getByRole('button', { name: 'Export pending edits', exact: true }),
    ).toBeVisible();
    await page.getByText('Discard local data', { exact: true }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Discard and sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
    const counts = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('prgrs-v1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await Promise.all(
          ['sessions', 'outbox', 'identities'].map(
            (store) =>
              new Promise<number>((resolve, reject) => {
                const request = db.transaction(store).objectStore(store).count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              }),
          ),
        );
      } finally {
        db.close();
      }
    });
    expect(counts).toEqual([0, 0, 0]);
    expect(
      Number(
        (await server.db.query<{ n: number }>('select count(*) as n from public.sync_receipts'))
          .rows[0].n,
      ),
    ).toBe(0);
  } finally {
    await context.setOffline(false);
    await server.close();
  }
});

test('aggregates multiple daily workouts, excludes instructions and shows stable exercise history', async ({
  page,
}) => {
  const server = await backend();
  try {
    const workout = (title: string, day: number, count: number) => ({
      title,
      day,
      blocks: [
        {
          label: 'A',
          kind: 'circuit',
          entries: Array.from({ length: count }, (_, i) => ({
            exerciseKey: `shared-${i}`,
            name: `Shared exercise ${i + 1}`,
            label: `A${i + 1}`,
          })),
        },
        {
          label: 'B',
          kind: 'instruction',
          entries: [
            {
              exerciseKey: 'breathing',
              name: 'Breathing instructions',
              label: 'B',
              eligible: false,
            },
          ],
        },
      ],
    });
    const program = {
      schemaVersion: 1,
      name: 'Weighted daily training',
      weeks: [
        {
          week: 1,
          workouts: [
            workout('Morning training', 1, 1),
            workout('Evening training', 1, 9),
            workout('Future training', 2, 1),
          ],
        },
      ],
    };
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
    const morning = (
      await server.db.query<{ data: import('../../src/lib/domain').WorkoutSession[] }>(
        'select public.get_my_sessions() as data',
      )
    ).rows[0].data.find((s) => s.title === 'Morning training')!;
    await server.db.query('select public.apply_session_mutation($1,$2,0,$3::jsonb)', [
      crypto.randomUUID(),
      morning.id,
      JSON.stringify({
        status: 'finished',
        finishedAt: new Date().toISOString(),
        results: morning.blocks
          .flatMap((b) => b.entries)
          .map((e) => ({
            entryId: e.id,
            completed: e.eligible,
            load: e.eligible ? '42 kg' : '',
            notes: '',
          })),
      }),
    ]);
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open workout', exact: true })).toBeVisible();
    await page.evaluate(() => {
      location.hash = 'tab=workouts';
    });
    await page.getByRole('button', { name: 'day', exact: true }).click();
    await expect(
      page.getByText(
        'Day exercise completion: 10% · 1/10 exercises. Workout adherence: 50% · 1/2 due sessions finished.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: /Evening training/ }).click();
    await expect(page.locator('.last-result').first()).toContainText('42 kg');
    await page.getByRole('button', { name: 'View history', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toContainText('42 kg');
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Your workouts', exact: true }).click();
    await page.getByRole('button', { name: 'day', exact: true }).click();
    await page.getByRole('button', { name: 'Next day', exact: true }).click();
    await expect(
      page.getByText(
        'Day exercise completion: 0% · 0/1 exercises. Workout adherence: N/A · 0/0 due sessions finished.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Future training/ })).toContainText('scheduled');
  } finally {
    await server.close();
  }
});
