import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(process.env.MADBOX_URL || 'http://127.0.0.1:5173');
  await page.waitForSelector('canvas');
  const enter = page.locator('[data-action="enter-world"]');
  if (await enter.count()) await enter.click();
  await page.waitForFunction(() => window.madbox?.world.tick > 30);
  await fs.mkdir('test-results', { recursive: true });
  await page.locator('[data-action="dismiss-welcome"]').click();
  await page.locator('[data-action="pause"]').click();
  await page.waitForFunction(() => window.madbox.paused);
  const pausedTick = await page.evaluate(() => window.madbox.world.tick);
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(() => window.madbox.world.tick),
    pausedTick,
    'Pause freezes simulation',
  );
  await page.locator('[data-tool="grass"]').click();
  await page.mouse.click(720, 500);
  const tile = await page.evaluate(() => window.madbox.world.tiles[48 * 128 + 64].terrain);
  assert.equal(tile, 'grass', 'Terrain brush changes selected tiles');
  console.log('Terrain paint passed');
  await page.locator('[data-tab="life"]').click();
  await page.locator('[data-tool="human"]').click();
  const before = await page.evaluate(() => window.madbox.world.entities.length);
  await page.mouse.click(720, 500);
  assert.ok(
    (await page.evaluate(() => window.madbox.world.entities.length)) > before,
    'Life tool spawns people',
  );
  await page.locator('[data-tab="powers"]').click();
  await page.locator('[data-tool="blessing"]').click();
  await page.mouse.click(720, 500);
  assert.ok(
    await page.evaluate(() =>
      window.madbox.world.entities.some((e) => e.traits.includes('blessed')),
    ),
    'Blessing grants trait',
  );
  await page.locator('[data-tool="plague"]').click();
  await page.mouse.click(720, 500);
  assert.ok(
    await page.evaluate(() =>
      window.madbox.world.entities.some((e) => e.traits.includes('plague')),
    ),
    'Plague infects',
  );
  await page.locator('[data-tool="blessing"]').click();
  await page.mouse.click(720, 500);
  await page.locator('[data-tool="fire"]').click();
  await page.mouse.click(720, 500);
  assert.ok(
    await page.evaluate(() => window.madbox.world.tiles.some((t) => t.fire > 0)),
    'Fire ignites',
  );
  await page.locator('[data-tool="rain"]').click();
  await page.mouse.click(720, 500);
  assert.equal(
    await page.evaluate(() => window.madbox.world.tiles[48 * 128 + 64].fire),
    0,
    'Rain extinguishes',
  );
  await page.locator('[data-tool="lightning"]').click();
  await page.mouse.click(720, 500);
  assert.ok(
    await page.evaluate(() => window.madbox.world.tiles[48 * 128 + 64].fire > 0),
    'Lightning ignites impact',
  );
  await page.locator('[data-tool="earthquake"]').click();
  await page.mouse.click(720, 500);
  assert.ok(
    await page.evaluate(() => window.madbox.world.events.some((e) => e.text.includes('trembles'))),
    'Earthquake reaches simulation',
  );
  await page.locator('[data-tool="erase"]').click();
  await page.mouse.click(720, 500);
  assert.equal(
    await page.evaluate(() => window.madbox.world.tiles[48 * 128 + 64].fire),
    0,
    'Erase clears effects',
  );
  await page.locator('[data-tool="meteor"]').click();
  await page.mouse.click(720, 500);
  assert.equal(
    await page.evaluate(() => window.madbox.world.tiles[48 * 128 + 64].terrain),
    'sand',
    'Meteor forms crater',
  );
  console.log('Spawning and all disaster/blessing checks passed');
  await page.locator('[data-action="save"]').first().click();
  const saved = await page.evaluate(() => structuredClone(window.madbox.world));
  assert.equal(saved.seed, 48271);
  await page.locator('[data-action="new"]').click();
  await page.locator('input[name="seed"]').fill('98765');
  await page.locator('select[name="size"]').selectOption('small');
  await page.locator('select[name="style"]').selectOption('islands');
  await page.getByRole('button', { name: 'Create world', exact: true }).click();
  await page.waitForFunction(() => window.madbox.world.seed === 98765);
  assert.equal(await page.evaluate(() => window.madbox.world.width), 96);
  await page.locator('[data-action="pause"]').click();
  await page.locator('[data-action="menu"]').click();
  await page.locator('[data-action="load"]').click();
  assert.equal(
    await page.evaluate(() => window.madbox.world.seed),
    saved.seed,
    'Load restores seed',
  );
  assert.equal(
    await page.evaluate(() => window.madbox.world.entities.length),
    saved.entities.length,
    'Load restores population',
  );
  console.log('New world and save/load passed');
  await page.locator('#mb-territory').check();
  await page.locator('[data-action="zoom-in"]').click();
  await page.locator('[data-action="fit"]').first().click();
  await page.locator('[data-tool="inspect"]').click();
  await page.mouse.click(720, 500);
  assert.equal(await page.locator('.mb-inspector').isVisible(), true, 'Inspect opens detail panel');
  await page.locator('[data-action="close-inspect"]').click();
  await page.locator('[data-speed="10"]').click();
  await page.waitForFunction(() => window.madbox.world.tick > 200);
  await page.locator('[data-action="pause"]').click();
  await page.screenshot({ path: 'test-results/madbox-desktop.png' });
  console.log('TITLE', await page.title());
  console.log('BUTTONS', await page.getByRole('button').allTextContents());
  console.log(
    'STATE',
    await page.evaluate(() => ({
      tick: window.madbox.world.tick,
      entities: window.madbox.world.entities.length,
      kingdoms: window.madbox.world.kingdoms.length,
    })),
  );
  console.log('ERRORS', errors);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/madbox-mobile.png' });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'No horizontal mobile overflow',
  );
  await page.locator('[data-action="menu"]').click();
  await page.screenshot({ path: 'test-results/madbox-mobile-menu.png' });
  assert.equal(await page.getByRole('dialog').isVisible(), true);
  console.log(
    'CHECKS desktop powers, pause/speed, generation, save/load, camera, inspect and mobile layout passed',
  );
  if (errors.length) process.exitCode = 1;
} catch (e) {
  await page.screenshot({ path: 'test-results/madbox-failure.png' }).catch(() => {});
  throw e;
} finally {
  await browser.close();
}
