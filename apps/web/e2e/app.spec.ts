import { expect, test, type Page } from '@playwright/test';

test('players table renders', async ({ page }) => {
  await page.goto('/players/');
  await expect(page.getByRole('heading', { name: 'Players' })).toBeVisible();
  await expect(page.getByText("Ja'Marr Chase")).toBeVisible();
});

test('rank list loads with tier lines', async ({ page }) => {
  await page.goto('/rank/');
  await expect(page.getByRole('heading', { name: 'Rank' })).toBeVisible();
  await expect(page.getByTestId('rank-list')).toBeVisible();
  await expect(page.getByText('Tier 1')).toBeVisible();
  const list = page.getByTestId('rank-list');
  await expect(list.getByText('ADP', { exact: true })).toBeVisible();
  await expect(list.getByText('Upside', { exact: true })).toBeVisible();
  const tiers = list.getByText(/^Tier \d+$/);
  await expect(tiers).toHaveCount(4);
  await list.getByTestId('insert-tier').first().click();
  await expect(list.getByText(/^Tier \d+$/)).toHaveCount(5);
});

/** The default board is Tier 1: players 1-12, Tier 2: 13-24, Tier 3: 25-48, Tier 4: the rest. */
const TIER_2 = [12, 24] as const;
const TIER_3 = [24, 48] as const;

function rankRows(page: Page) {
  return page.getByTestId('rank-list').getByTestId('player-row');
}

async function playerIds(page: Page) {
  const ids = await rankRows(page).evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).dataset.playerId ?? ''),
  );
  expect(ids.length).toBeGreaterThan(TIER_3[1]);
  return ids;
}

/**
 * Presses at `from` and walks the pointer `dy` pixels, one frame at a time.
 * dnd-kit measures the list a frame after the drag starts, so a drag that
 * finishes inside a single frame never resolves a drop target.
 */
async function dragBy(page: Page, from: { x: number; y: number }, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step++) {
    await page.mouse.move(from.x, from.y + (dy / 12) * step);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

/** Scrolls Tier 2 into view and returns a point on its label and on its divider. */
async function tier2Grips(page: Page) {
  const list = page.getByTestId('rank-list');
  await expect(rankRows(page).first()).toBeVisible();
  await list.evaluate((el) => {
    el.scrollTop = 200;
  });
  const label = list.getByText('Tier 2', { exact: true });
  await expect(label).toBeInViewport();
  const box = (await label.boundingBox())!;
  const y = box.y + box.height / 2;
  return { label: { x: box.x + box.width / 2, y }, line: { x: box.x - 200, y } };
}

test('the tier label reads as a grab handle, the line as a resize', async ({ page }) => {
  await page.goto('/rank/');
  const list = page.getByTestId('rank-list');
  await expect(rankRows(page).first()).toBeVisible();
  const cursor = (locator: ReturnType<typeof list.locator>) =>
    locator.evaluate((el) => getComputedStyle(el).cursor);
  expect(await cursor(list.getByText('Tier 1', { exact: true }))).toBe('grab');
  expect(await cursor(list.getByTestId('tier-row').first())).toBe('row-resize');
});

test('a short drag on a tier label moves the whole group past the next one', async ({ page }) => {
  await page.goto('/rank/');
  const grips = await tier2Grips(page);
  const before = await playerIds(page);

  await dragBy(page, grips.label, 120);

  // Tier 2's dozen players clear all of Tier 3 in one nudge, without splitting it.
  await expect
    .poll(() => playerIds(page))
    .toEqual([
      ...before.slice(0, TIER_2[0]),
      ...before.slice(...TIER_3),
      ...before.slice(...TIER_2),
      ...before.slice(TIER_3[1]),
    ]);
  await expect(page.getByTestId('rank-list').getByText(/^Tier \d+$/)).toHaveCount(4);
});

test('a short drag on a tier label moves the whole group up', async ({ page }) => {
  await page.goto('/rank/');
  const grips = await tier2Grips(page);
  const before = await playerIds(page);

  await dragBy(page, grips.label, -120);

  await expect
    .poll(async () => (await playerIds(page)).slice(0, 12))
    .toEqual(before.slice(...TIER_2));
});

test('dragging a tier by its line moves only the break', async ({ page }) => {
  await page.goto('/rank/');
  const list = page.getByTestId('rank-list');
  const board = () =>
    list
      .locator('[data-testid="player-row"], [data-testid="tier-row"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.playerId ?? 'tier'));
  const breakAt = (order: string[]) => order.indexOf('tier', order.indexOf('tier') + 1);
  const grips = await tier2Grips(page);
  const before = await board();

  await dragBy(page, grips.line, -120);

  await expect.poll(async () => breakAt(await board())).toBeLessThan(breakAt(before));
  const after = await board();
  expect(after.filter((kind) => kind !== 'tier')).toEqual(before.filter((kind) => kind !== 'tier'));
});

test('draft flow can start and pick', async ({ page }) => {
  await page.goto('/draft/');
  await expect(page.getByRole('heading', { name: 'Start a draft' })).toBeVisible();
  await expect(page.getByTestId('ranking-set')).toHaveCount(0);
  await page.getByTestId('start-draft').click({ force: true });
  await expect(page.getByTestId('available-list')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('ranking-set')).toBeVisible();
  const first = page.getByTestId('available-list').locator('button').first();
  const label = ((await first.locator('span').nth(1).textContent()) ?? '').trim();
  await first.click();
  await expect(page.getByTestId('roster')).toContainText(label);
});
