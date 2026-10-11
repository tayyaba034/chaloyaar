// Read-only real API checks, plus clearly synthetic browser fixtures. No database writes.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_success, failure) => failure({ code: 1 });
    });
    const page = await context.newPage();
    const realResponse = await page.request.post(base + '/api/stations/nearby', { data: { areaId: 'city-centre' } });
    assert.equal(realResponse.status(), 200);
    const real = await realResponse.json();
    assert.ok(real.stations.every((s, i, all) => !s.isDemo && (!i || s.distanceKm >= all[i - 1].distanceKm)));
    assert.match(realResponse.headers()['cache-control'], /no-store/);
    await page.goto(base + '/en/app/stations');
    await page.locator('.cy-station-skeleton').first().waitFor({ state: 'detached' });
    if (real.stations.length) {
      const name = await page.locator('.cy-station-card h3 a').first().innerText();
      const facts = await page.locator('.cy-station-card .station-information').first().innerText();
      await page.locator('.cy-station-card h3 a').first().click();
      await page.getByRole('heading', { name, level: 1, exact: true }).waitFor();
      assert.equal(await page.locator('.station-information').innerText(), facts);
    }
    console.log('PASS real spatial ordering, sample isolation and list/detail fact parity');

    const fixture = {
      id: '11111111-1111-4111-8111-111111111111', name: 'Synthetic browser test station',
      address: null, brand: null, latitude: 31.4181, longitude: 73.0791,
      supportedFuels: ['petrol'], verificationStatus: 'unverified', verifiedAt: null,
      isDemo: false, source: 'Synthetic browser fixture', sourceUrl: null, updatedAt: null,
      distanceKm: 1, distanceKind: 'straight_line_approximate',
      availability: { state: 'unknown', source: null, reportedAt: null, expiresAt: null },
    };
    let verified = false;
    await page.route('**/api/stations/nearby', route => {
      const { fuelType, radiusKm } = route.request().postDataJSON();
      const station = verified ? { ...fixture, verificationStatus: 'verified', verifiedAt: '2020-01-01T00:00:00Z' } : fixture;
      return route.fulfill({ json: { radiusKm, stations: fuelType && !verified ? [] : [station] } });
    });
    await page.goto(base + '/en/app/stations');
    await page.getByRole('heading', { name: 'No verified stations in these results' }).waitFor();
    assert.match(await page.locator('.cy-station-card').innerText(), /Verified fuel types: Unknown/);
    await page.getByRole('button', { name: 'Use my location', exact: true }).click();
    await page.getByText('Location was not shared. Choose an area instead.', { exact: true }).waitFor();
    await page.getByLabel('Enter a Faisalabad area').fill('D Ground');
    const manual = page.waitForRequest(r => r.url().endsWith('/api/stations/nearby') && r.postDataJSON()?.areaId === 'd-ground');
    await page.getByRole('button', { name: 'Search area', exact: true }).click();
    assert.equal((await manual).postDataJSON().lat, undefined);
    await page.locator('.cy-station-card').waitFor();
    await page.getByRole('button', { name: 'Petrol', exact: true }).click();
    await page.getByRole('heading', { name: 'No stations found here' }).waitFor();
    await page.getByText(/This filter requires human-verified fuel types/).waitFor();
    verified = true;
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByText('Verified fuel types: Petrol', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'No verified stations in these results' }).count(), 0);
    const names = await page.locator('.cy-station-card h3').allTextContents();
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    assert.deepEqual(await page.locator('.cy-station-card h3').allTextContents(), names);
    await page.getByRole('button', { name: 'List', exact: true }).click();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo(0, 0));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow at ' + width);
      await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), `find-petrol-${width}.png`), fullPage: true });
    }
    console.log('PASS denied GPS/manual fallback, unverified/verified metadata, empty filters, map/list parity, desktop/mobile');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
