import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// A real browser run at 10× speed. This validates prolonged rendering and input;
// it is not a substitute for a human assessment of the game's pacing or fun.
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const report = [];
const started = Date.now();
let monitor;
try {
  await fs.mkdir('test-results', { recursive: true });
  await page.goto(process.env.MADBOX_URL || 'http://127.0.0.1:5174');
  await page.waitForSelector('#world-stage canvas');
  const enter = page.locator('[data-action="enter-world"]');
  if (await enter.count()) {
    await page.screenshot({ path: 'test-results/madbox-title.png' });
    await enter.click();
  }
  await page.locator('[data-action="dismiss-welcome"]').click();
  await page.locator('[data-speed="10"]').click();
  console.log(
    'BROWSER_SOAK_STARTED',
    await page.evaluate(() => ({ tick: window.madbox.world.tick, speed: window.madbox.speed })),
  );
  monitor = setInterval(() => {
    void page
      .evaluate(() => ({
        tick: window.madbox.world.tick,
        population: window.madbox.world.entities.length,
      }))
      .then((s) => console.log('BROWSER_PROGRESS', JSON.stringify(s)))
      .catch(() => {});
  }, 30000);
  for (const tick of [3000, 6000, 9000, 12000, 15000, 18000]) {
    await page.waitForFunction((target) => window.madbox?.world.tick >= target, tick, {
      timeout: 180000,
      polling: 1000,
    });
    const state = await page.evaluate(() => ({
      tick: window.madbox.world.tick,
      population: window.madbox.world.entities.length,
      kingdoms: window.madbox.world.kingdoms.filter((k) => k.population > 0).length,
      buildings: window.madbox.world.buildings.length,
      fps: document.querySelector('#mb-fps').textContent,
      finite: window.madbox.world.entities.every((e) =>
        [e.x, e.y, e.health, e.hunger].every(Number.isFinite),
      ),
    }));
    assert.ok(state.population > 20 && state.finite);
    report.push(state);
    console.log('BROWSER_SOAK', JSON.stringify(state));
    if (tick === 6000 || tick === 18000)
      await page.screenshot({ path: `test-results/madbox-year-${Math.floor(tick / 500) + 1}.png` });
    if (tick === 9000) {
      await page.locator('[data-tab="powers"]').click();
      await page.locator('[data-tool="meteor"]').click();
      await page.mouse.click(800, 480);
      await page.locator('[data-tool="rain"]').click();
      await page.mouse.click(800, 480);
    }
  }
  await page.locator('[data-action="pause"]').click();
  await page.waitForFunction(() => window.madbox.paused);
  await page.locator('[data-action="save"]').first().click();
  const saved = await page.evaluate(() => structuredClone(window.madbox.world));
  assert.ok(saved.entities.length > 100 && saved.buildings.length > 15);
  await page.reload();
  await page.waitForSelector('#world-stage canvas');
  assert.equal(await page.evaluate(() => window.madbox.world.seed), saved.seed);
  assert.ok((await page.evaluate(() => window.madbox.world.tick)) >= saved.tick);
  assert.equal(errors.length, 0, errors.join('\n'));
  const result = {
    elapsedSeconds: (Date.now() - started) / 1000,
    samples: report,
    errors,
    renderer: 'Chromium software SwiftShader; hardware FPS not established',
  };
  await fs.writeFile('test-results/browser-soak.json', JSON.stringify(result, null, 2));
  console.log('BROWSER_SOAK_PASSED', JSON.stringify(result));
} finally {
  clearInterval(monitor);
  await browser.close();
}
