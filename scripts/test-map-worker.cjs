const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const sharp = require('sharp');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage();
    const workerErrors = [];
    const responses = new Set();
    page.on('pageerror', error => workerErrors.push(error.message));
    page.on('worker', worker => worker.on('console', message => {
      if (message.type() === 'error') workerErrors.push(message.text());
    }));
    page.on('response', response => {
      if (response.url().includes('/maplibre/') && response.status() === 200) responses.add(new URL(response.url()).pathname);
    });
    let denied = false;
    // Synthetic geometry exercises module-worker parsing/rendering without changing real data or using another tile service.
    const syntheticStyle = (color) => ({ json: { version: 8, sources: {
      qa: { type: 'geojson', data: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: [[73.0,31.35],[73.08,31.418],[73.2,31.5]] } }] } },
    }, layers: [
      { id: 'qa-background', type: 'background', paint: { 'background-color': '#e4edf0' } },
      { id: 'qa-line', type: 'line', source: 'qa', paint: { 'line-color': color, 'line-width': 12 } },
    ] } });
    let openFreeMapRequests = 0;
    await page.route('https://api.maptiler.com/**', route => denied
      ? route.fulfill({ status: 403, body: 'Synthetic denied-key test' })
      : route.fulfill(syntheticStyle('#c72f45')));
    await page.route('https://tiles.openfreemap.org/**', route => {
      openFreeMapRequests += 1;
      return route.fulfill(syntheticStyle('#2f45c7'));
    });
    await page.goto(base + '/en/app/stations');
    await page.locator('.cy-station-skeleton').first().waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.maplibregl-canvas')?.width > 0);
    await page.waitForFunction(() => !document.querySelector('.truecost-map')?.hidden);
    await page.waitForTimeout(2000);
    assert.ok([...responses].some(url => url.endsWith('/maplibre-gl-worker.mjs')), 'worker not served');
    const workerPath = [...responses].find(url => url.endsWith('/maplibre-gl-worker.mjs'));
    const shared = await page.request.get(base + workerPath.replace('maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'));
    assert.equal(shared.status(), 200, 'shared worker bundle unavailable');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('.maplibregl-canvas').scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const screenshot = await page.locator('.maplibregl-canvas').screenshot({ path: path.join(os.tmpdir(), `map-worker-${width}.png`) });
      const stats = await sharp(screenshot).stats();
      assert.ok(stats.channels.slice(0,3).some(channel => channel.stdev > 5), 'map canvas blank');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    }
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    // Changing the search updates the existing map instead of rebuilding it.
    await page.evaluate(() => { window.__qaCanvas = document.querySelector('.maplibregl-canvas'); });
    await page.locator('#area-select').selectOption('susan-road');
    await page.locator('.cy-station-skeleton').first().waitFor({ state: 'detached' });
    await page.waitForTimeout(1000);
    assert.ok(await page.evaluate(() => window.__qaCanvas === document.querySelector('.maplibregl-canvas')), 'map rebuilt on data change');
    // A denied MapTiler key falls back to keyless OpenFreeMap without losing the map or list.
    denied = true;
    await page.reload();
    await page.locator('.cy-station-skeleton').first().waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.maplibregl-canvas')?.width > 0);
    await page.waitForTimeout(2000);
    assert.ok(openFreeMapRequests > 0, 'no fallback to OpenFreeMap');
    assert.equal(await page.getByText('Map unavailable', { exact: true }).count(), 0, 'map failed to fall back');
    assert.ok(await page.locator('.cy-station-card').count() > 0, 'station list lost after tile failure');
    const fallbackShot = await page.locator('.maplibregl-canvas').screenshot({ path: path.join(os.tmpdir(), 'map-worker-fallback.png') });
    assert.ok((await sharp(fallbackShot).stats()).channels.slice(0,3).some(channel => channel.stdev > 5), 'fallback canvas blank');
    assert.deepEqual(workerErrors, [], 'worker/browser errors');
    console.log('PASS same-origin worker/shared assets, nonblank desktop/mobile canvas, zoom, no rebuild on data change, denied key falls back to OpenFreeMap');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
