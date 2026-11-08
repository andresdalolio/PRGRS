import type { WorkoutSession } from '../../src/lib/domain';
import { test, expect } from '@playwright/test';
import { backend, userId } from './backend';
import { readFile } from 'node:fs/promises';
test('theme survives relaunch and follows system only when selected; feedback works offline', async ({
  page,
  context,
}) => {
  const server = await backend();
  try {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Let’s get to work, Alex.' })).toBeVisible();
    await page.evaluate(() => {
      location.hash = 'tab=profile';
    });
    await page.getByRole('button', { name: 'dark', exact: true }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const reopened = await context.newPage();
    await reopened.goto('/');
    await expect(reopened.locator('html')).toHaveAttribute('data-theme', 'dark');
    await reopened.close();
    await page.getByRole('button', { name: 'light', exact: true }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'system', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Add idea', exact: true }).click();
    await page.getByLabel('Idea title').fill('Improve workout timer');
    await page.getByLabel('Description (optional)').fill('A personal reminder');
    await page.getByRole('button', { name: 'Save idea', exact: true }).click();
    const feedback = page.locator('#feedback');
    await expect(feedback.getByText('Improve workout timer', { exact: true })).toBeVisible();
    // The installed shell is exercised by existing offline relaunch tests; this reload tests IndexedDB restoration.
    await context.setOffline(false);
    server.setOnline(false);
    await page.reload();
    await expect(feedback.getByText('Improve workout timer', { exact: true })).toBeVisible();
    await feedback.getByRole('checkbox').check();
    await expect(feedback.getByText('Implemented', { exact: true })).toBeVisible();
    await feedback.getByRole('checkbox').uncheck();
    await expect(feedback.getByText('Open', { exact: true })).toBeVisible();
    await feedback.getByRole('button', { name: 'Edit idea', exact: true }).click();
    await page.getByLabel('Idea title').fill('Better timer');
    await page.getByRole('button', { name: 'Save idea', exact: true }).click();
    server.setOnline(true);
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect
      .poll(async () =>
        (
          await server.db.query<{ title: string }>(
            'select title from public.feedback_items where not deleted',
          )
        ).rows.map((r) => r.title),
      )
      .toEqual(['Better timer']);
    page.once('dialog', (d) => d.dismiss());
    await feedback.getByRole('button', { name: 'Delete idea', exact: true }).click();
    await expect(feedback.getByText('Better timer', { exact: true })).toBeVisible();
    await context.setOffline(true);
    page.once('dialog', (d) => d.accept());
    await feedback.getByRole('button', { name: 'Delete idea', exact: true }).click();
    await expect(feedback.getByText('Better timer', { exact: true })).toHaveCount(0);
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await server.db.query<{ deleted: boolean }>('select deleted from public.feedback_items'))
            .rows[0]?.deleted,
      )
      .toBe(true);
    await page.reload();
    await expect(feedback.getByText('Better timer', { exact: true })).toHaveCount(0);
  } finally {
    await server.close();
  }
});
test('viewing queues no activity and individual history deletion stays deleted after offline sync', async ({
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
    await server.db.query('select public.assign_program($1,$2,$3)', [id, userId, '2026-10-01']);
    await server.db.query('select public.assign_program($1,$2,$3)', [id, userId, '2026-11-01']);
    const sessions = (
      await server.db.query<{ data: WorkoutSession[] }>('select public.get_my_sessions() as data')
    ).rows[0].data;
    const old = sessions[0],
      current = sessions.find((s) => s.date === '2026-11-01')!;
    const entry = old.blocks.flatMap((b) => b.entries).find((e) => e.eligible)!;
    const log = {
      status: 'finished',
      finishedAt: '2026-10-01T18:00:00Z',
      results: old.blocks
        .flatMap((b: { entries: { id: string }[] }) => b.entries)
        .map((e: { id: string }) => ({
          entryId: e.id,
          completed: e.id === entry.id,
          load: e.id === entry.id ? '24 kg' : '',
          notes: '',
        })),
    };
    await server.db.query('select public.apply_session_mutation($1,$2,0,$3::jsonb)', [
      crypto.randomUUID(),
      old.id,
      JSON.stringify(log),
    ]);
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Let’s get to work, Alex.' })).toBeVisible();
    await page.evaluate((id) => {
      location.hash = `tab=workouts&workout=${id}`;
    }, current.id);
    const card = page
      .locator('.exercise-card')
      .filter({ has: page.getByRole('heading', { name: entry.name, exact: true }) })
      .first();
    await card.getByRole('button', { name: 'View history', exact: true }).click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: '24 kg', exact: true }),
    ).toBeVisible();
    expect(
      (await server.db.query<{ n: number }>('select count(*)::int as n from public.sync_receipts'))
        .rows[0].n,
    ).toBe(1);
    await context.setOffline(true);
    page.once('dialog', (d) => d.accept());
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete result', exact: true })
      .click();
    await expect(
      page.getByRole('dialog').getByText('A fresh starting point', { exact: true }),
    ).toBeVisible();
    await context.setOffline(false);
    await page.reload();
    await card.getByRole('button', { name: 'View history', exact: true }).click();
    await expect(
      page.getByRole('dialog').getByText('A fresh starting point', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await server.db.query<{ n: number }>(
              'select count(*)::int as n from public.exercise_results where entry_id=$1',
              [entry.id],
            )
          ).rows[0].n,
      )
      .toBe(0);
    const next = (
      await server.db.query<{ data: WorkoutSession[] }>('select public.get_my_sessions() as data')
    ).rows[0].data.find((s) => s.id === old.id)!;
    expect(next.status).toBe('finished');
    expect(next.blocks.flatMap((b: { entries: unknown[] }) => b.entries)).toHaveLength(
      old.blocks.flatMap((b: { entries: unknown[] }) => b.entries).length,
    );
  } finally {
    await server.close();
  }
});

test('History deletes a complete day offline, including recorded workouts hidden by search, while preserving unstarted programming', async ({
  page,
  context,
}) => {
  const server = await backend();
  try {
    const program = JSON.parse(await readFile('docs/examples/foundation.json', 'utf8'));
    for (const w of program.weeks[0].workouts) w.day = 1;
    const id = (
      await server.db.query<{ id: string }>('select public.save_program($1::jsonb) as id', [
        JSON.stringify(program),
      ])
    ).rows[0].id;
    const scheduledDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Costa_Rica',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    await server.db.query('select public.assign_program($1,$2,$3)', [id, userId, scheduledDate]);
    const sessions = (
      await server.db.query<{ data: WorkoutSession[] }>('select public.get_my_sessions() as data')
    ).rows[0].data;
    for (const s of sessions.slice(0, 2))
      await server.db.query('select public.apply_session_mutation($1,$2,0,$3::jsonb)', [
        crypto.randomUUID(),
        s.id,
        JSON.stringify({
          status: 'finished',
          finishedAt: '2026-10-01T18:00:00Z',
          results: s.blocks
            .flatMap((b) => b.entries)
            .map((e) => ({ entryId: e.id, completed: e.eligible, load: '', notes: '' })),
        }),
      ]);
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Let’s get to work, Alex.' })).toBeVisible();
    await page.evaluate(() => {
      location.hash = 'tab=workouts';
    });
    await expect(page.locator('.session-card')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Delete day history', exact: true })).toHaveCount(
      0,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.evaluate(() => {
      location.hash = 'tab=history';
    });
    await expect(page.locator('.history-row')).toHaveCount(2);
    await page.getByLabel('Search sessions').fill(sessions[0].title);
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'Delete day history', exact: true }).click();
    await expect(page.locator('.history-row')).toHaveCount(1);
    await context.setOffline(true);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete day history', exact: true }).click();
    await expect(page.getByText('No sessions yet', { exact: true })).toBeVisible();
    server.setOnline(false);
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByText('No sessions yet', { exact: true })).toBeVisible();
    server.setOnline(true);
    await page.evaluate(() => {
      location.hash = 'tab=profile';
    });
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect
      .poll(async () =>
        (
          await server.db.query<{ data: WorkoutSession[] }>(
            'select public.get_my_sessions() as data',
          )
        ).rows[0].data
          .filter((s) => sessions.slice(0, 2).some((r) => r.id === s.id))
          .every(
            (s) =>
              s.deleted === true &&
              s.status === 'scheduled' &&
              s.finishedAt === null &&
              s.blocks.flatMap((b) => b.entries).every((e) => !e.completed && !e.load && !e.notes),
          ),
      )
      .toBe(true);
    expect(
      (await server.db.query<{ data: WorkoutSession[] }>('select public.get_my_sessions() as data'))
        .rows[0].data,
    ).toHaveLength(sessions.length);
    await page.evaluate(() => {
      location.hash = 'tab=history';
    });
    await page.reload();
    await expect(page.getByText('No sessions yet', { exact: true })).toBeVisible();
    // Calendar and dashboard use the same filtered occurrences, including after reload.
    await page.evaluate(() => {
      location.hash = 'tab=workouts';
    });
    await expect(page.locator('.session-card')).toHaveCount(1);
    await expect(
      page.locator('.session-card').getByText(sessions[2].title, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete day history', exact: true })).toHaveCount(
      0,
    );
    await page.evaluate(() => {
      location.hash = 'tab=home';
    });
    await expect(page.getByText(sessions[0].title, { exact: true })).toHaveCount(0);
    await expect(page.getByText(sessions[1].title, { exact: true })).toHaveCount(0);
    await page.evaluate((id) => {
      location.hash = `tab=workouts&workout=${id}`;
    }, sessions[0].id);
    await expect(page.getByText('Workout unavailable', { exact: true })).toBeVisible();
  } finally {
    await server.close();
  }
});
