import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

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
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(process.env.MADBOX_URL || 'http://127.0.0.1:5174');
  await page.waitForSelector('#world-stage canvas');
  const enter = page.locator('[data-action="enter-world"]');
  if (await enter.count()) {
    await page.screenshot({ path: 'test-results/madbox-mobile-title.png' });
    await enter.click();
  }
  await page.waitForFunction(() => window.madbox.world.tick > 0);
  await page.locator('[data-action="pause"]').click();
  await page.waitForFunction(() => window.madbox.paused);
  await page.locator('[data-action="dismiss-welcome"]').click();
  await page.locator('[data-tool="grass"]').click();
  await page.touchscreen.tap(195, 422);
  assert.equal(
    await page.evaluate(() => window.madbox.world.tiles[48 * 128 + 64].terrain),
    'grass',
    'Touch tap paints',
  );
  const before = await page.evaluate(() => JSON.stringify(window.madbox.world.tiles));
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 145, y: 400, id: 1 },
      { x: 245, y: 400, id: 2 },
    ],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: 110, y: 390, id: 1 },
      { x: 280, y: 430, id: 2 },
    ],
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.madbox.world.tiles)),
    before,
    'Pinch does not paint',
  );
  await page.locator('[data-action="menu"]').click();
  await page.locator('#mb-sound-toggle').check();
  await page.waitForTimeout(300);
  await page.locator('#mb-sound-toggle').uncheck();
  await page.locator('[data-action="close-modal"]').click();
  await fs.mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/madbox-mobile-touch.png' });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(
    'TOUCH PASSED: terrain tap, non-destructive pinch/pan, settings/audio toggle; no browser errors',
  );
} finally {
  await browser.close();
}
