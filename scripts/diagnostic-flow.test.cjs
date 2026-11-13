const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'playwright'));

const frontend = path.join(__dirname, '..', 'frontend');
const viteBin = path.join(frontend, 'node_modules', 'vite', 'bin', 'vite.js');
const base = 'http://localhost:5174';

async function waitForApp(server) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    if (server && server.exitCode !== null) throw new Error(`Vite exited before becoming ready:\n${server.output}`);
    try { if ((await fetch(base)).ok) return; } catch { /* wait for startup */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${base}.\n${server.output}`);
}

async function fillJourney(page, name) {
  await page.locator('#businessName').fill(name);
  await page.getByRole('radio', { name: 'Makanan & Minuman' }).click();
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
}

async function main() {
  const preview = process.env.TEST_PREVIEW === '1';
  const useExistingServer = process.env.USE_EXISTING_SERVER === '1';
  const server = useExistingServer ? undefined : spawn(process.execPath, [viteBin, ...(preview ? ['preview'] : []), '--host', 'localhost', '--port', '5174', '--strictPort'], { cwd: frontend, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VITE_API_BASE_URL: '' } });
  if (server) {
    server.output = '';
    server.stdout.on('data', (chunk) => { server.output += chunk.toString(); });
    server.stderr.on('data', (chunk) => { server.output += chunk.toString(); });
  }
  let browser;
  try {
  await waitForApp(server);
  const installedChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const executablePath = process.env.CHROME_EXECUTABLE || (fs.existsSync(installedChrome) ? installedChrome : undefined);
  browser = await chromium.launch({ headless: true, executablePath });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    const homeHeading = page.locator('.dy-home-hero h1');
    await homeHeading.waitFor();
    const homeHeadingText = (await homeHeading.innerText()).replace(/\s+/g, ' ').trim();
    assert.match(homeHeadingText, /Real problems\. Local skills\. Solutions shaped together\./);

    // PLATFORM HOME + PORTAL ROUTE SMOKE TESTS
    assert.ok(await page.locator('a[href="/business/intake"]').count() >= 1);
    assert.ok(await page.locator('a[href="/participant"]').count() >= 1);
    assert.ok(await page.locator('a[href="/coordinator"]').count() >= 1);

    await page.goto(base + '/participant');
    await page.getByRole('heading', { name: 'Participant workspace' }).waitFor();
    await page.getByRole('heading', { name: 'Participant sign in' }).waitFor();

    const invitationToken = 'A'.repeat(43);
    await page.goto(base + '/participant?invite=' + invitationToken);
    const invitationInput = page.getByLabel('Invitation token');
    await invitationInput.waitFor();
    assert.equal(await invitationInput.inputValue(), invitationToken, 'Invitation query token is extracted into registration.');

    await page.goto(base + '/coordinator');
    await page.getByRole('heading', { name: 'Coordinator workspace' }).waitFor();
    await page.getByRole('heading', { name: 'Coordinator sign in' }).waitFor();

    await page.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/api/auth/csrf')) return new Response(JSON.stringify({ csrfToken: 'mock-csrf-token' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (url.includes('/api/admin/diagnostics')) return new Response(JSON.stringify({ diagnostics: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (url.includes('/api/admin/projects')) return new Response(JSON.stringify({ projects: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (url.includes('/api/admin/participants')) return new Response(JSON.stringify({ participants: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (url.includes('/api/auth/logout')) return new Response(JSON.stringify({ message: 'Logged out' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        return nativeFetch(input, init);
      };
    });
    await page.goto(base + '/coordinator');
    await page.getByRole('button', { name: 'Sign out' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Coordinator sign in' }).count(), 0, 'A valid coordinator session is restored after navigation.');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('heading', { name: 'Coordinator sign in' }).waitFor();


    await page.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === "string"
          ? input
          : input instanceof URL ? input.href : input.url;

        if (url.includes("/api/business/review/invalid-test-token")) {
          window.__businessReviewMockHit = true;
          return new Response(
            JSON.stringify({ error: "Business review link is invalid, expired or revoked." }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }
        return nativeFetch(input, init);
      };
    });

    await page.goto(base + '/business/review/invalid-test-token');
    await page.getByRole('heading', { name: 'Business project review' }).waitFor();
    await page.getByText('Business review link is invalid, expired or revoked.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__businessReviewMockHit), true);
    // Check all portal shells at mobile, tablet and desktop widths.
    for (const width of [320, 390, 768, 1440]) {
      for (const route of [
        '/participant',
        '/coordinator',
        '/business/review/invalid-test-token'
      ]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(base + route);
        const metrics = await page.evaluate(() => ({
          body: document.body.scrollWidth,
          viewport: innerWidth
        }));
        assert.ok(
          metrics.body <= metrics.viewport,
          'Portal horizontal overflow at ' + width + 'px on ' + route + ': ' + JSON.stringify(metrics)
        );
      }
    }

    // Return to the diagnostic so its original checks continue unchanged.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/business/intake');
    await page.getByRole('heading', { name: 'Apa nama usaha Anda?' }).waitFor();


    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    assert.equal(await page.locator('.field-error').count(), 2, 'Step 1 requires a business name and business type.');
    await page.locator('#businessName').fill('Warung Uji');
    await page.getByRole('radio', { name: 'Lainnya' }).click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    assert.ok(await page.locator('#businessTypeOther.invalid').count(), 'Other business type requires details.');
    await page.getByLabel('Silakan sebutkan').fill('Bengkel sepeda');
    await page.getByRole('radio', { name: 'Makanan & Minuman' }).click();

    // Language changes preserve both progress and answers.
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    assert.match(await page.getByRole('alert').innerText(), /isi bagian ini/);
    await page.getByRole('button', { name: 'Kembali' }).click();
    assert.equal(await page.locator('#businessName').inputValue(), 'Warung Uji');
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    assert.equal(await page.locator('#businessName').inputValue(), 'Warung Uji');
    assert.equal(await page.getByRole('radio', { name: 'Food & Beverage' }).getAttribute('aria-checked'), 'true');
    await page.getByRole('button', { name: 'ID', exact: true }).click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await page.getByRole('button', { name: 'Kembali' }).click();
    assert.equal(await page.locator('#businessName').inputValue(), 'Warung Uji');
    await page.getByRole('button', { name: 'Lanjutkan' }).click();

    // Nothing clears other tool choices; adding a tool clears Nothing.
    await page.getByRole('checkbox', { name: 'WhatsApp' }).click();
    await page.getByRole('checkbox', { name: 'Belum menggunakan alat apa pun' }).click();
    assert.equal(await page.getByRole('checkbox', { name: 'WhatsApp' }).getAttribute('aria-checked'), 'false');
    await page.getByRole('checkbox', { name: 'Spreadsheet' }).click();
    assert.equal(await page.getByRole('checkbox', { name: 'Belum menggunakan alat apa pun' }).getAttribute('aria-checked'), 'false');
    await page.getByRole('checkbox', { name: 'Kertas dan pena' }).click();
    await page.getByRole('checkbox', { name: 'Lainnya' }).click();
    await page.getByLabel('Silakan sebutkan').fill('POS lokal');
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await page.getByRole('alert').getByText('Mohon isi bagian ini untuk melanjutkan.').waitFor();
    await page.locator('#pain').fill('Sulit mengatur pesanan.');
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await page.getByRole('checkbox', { name: 'Membalas wisatawan' }).click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();

    // Wait for the asynchronous draft write and step transition before reload.
    await page.waitForFunction(() =>
      document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') === '5'
    );

    await page.reload();
    await page.locator('#whatsapp').waitFor();
    assert.equal(await page.locator('#contactName').getAttribute('placeholder'), 'Opsional');
    assert.equal(await page.locator('#whatsapp').inputValue(), '');
    await page.getByRole('button', { name: 'Simpan jawaban' }).click();
    await page.locator('.confirmation').waitFor();
    assert.match(await page.locator('.confirmation').innerText(), /saved on this device|tersimpan di perangkat ini/i);
    assert.match(await page.locator('.local-note').innerText(), /belum dikirim|not been sent/i);
    const savedRecords = await page.evaluate(() => new Promise((resolve, reject) => {
      const req = indexedDB.open('local-digital-diagnostics', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { const db = req.result; const tx = db.transaction('submissions'); const rows = tx.objectStore('submissions').getAll(); rows.onsuccess = () => resolve(rows.result); rows.onerror = () => reject(rows.error); };
    }));
    assert.equal(savedRecords.length, 1, 'Completed response is stored locally.');
    assert.equal(savedRecords[0].status, 'local_only');
    assert.equal(savedRecords[0].contactName, '', 'Unconsented contact name is not persisted.');
    assert.equal(savedRecords[0].whatsapp, '', 'Unconsented WhatsApp number is not persisted.');

    // A provided number cannot proceed without explicit consent.
    await page.getByRole('button', { name: 'Selesai' }).click();
    await fillJourney(page, 'Warung Kontak');
    await page.getByRole('checkbox', { name: 'WhatsApp' }).click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await page.locator('#pain').fill('Pesanan tertukar.');
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await page.getByRole('checkbox', { name: 'Pemesanan' }).click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await page.getByLabel('Nomor WhatsApp').fill('+62 812 3456 7890');
    await page.getByRole('button', { name: 'Simpan jawaban' }).click();
    await page.getByRole('alert').getByText('Mohon isi bagian ini untuk melanjutkan.').waitFor();
    await page.getByLabel(/Saya setuju untuk dihubungi/).check();
    await page.getByRole('button', { name: 'Simpan jawaban' }).dblclick();
    await page.locator('.confirmation').waitFor();
    assert.match(await page.locator('.confirmation').innerText(), /saved on this device|tersimpan di perangkat ini/i);
    const totalSubmissions = await page.evaluate(() => new Promise((resolve, reject) => {
      const req = indexedDB.open('local-digital-diagnostics', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { const tx = req.result.transaction('submissions'); const count = tx.objectStore('submissions').count(); count.onsuccess = () => resolve(count.result); count.onerror = () => reject(count.error); };
    }));
    assert.equal(totalSubmissions, 2, 'Double-click does not create a duplicate local record.');

    for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + '/business/intake');
      await page.getByRole('heading', { name: 'Apa nama usaha Anda?' }).waitFor();
      const metrics = await page.evaluate(() => ({ body: document.body.scrollWidth, width: innerWidth }));
      assert.ok(metrics.body <= metrics.width, `Horizontal overflow at ${width}px: ${JSON.stringify(metrics)}`);
      if (width === 390) await page.screenshot({ path: path.join(__dirname, '..', 'test-screenshots', 'local-digital-redesign-mobile.png'), fullPage: true });
      if (width === 1440) await page.screenshot({ path: path.join(__dirname, '..', 'test-screenshots', 'local-digital-redesign-desktop.png'), fullPage: true });
    }
    if (preview) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(base + '/business/intake');
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await page.reload();
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      const cachedShell = await page.evaluate(async () => {
        const cache = await caches.open('digital-youth-shell-v3');
        return (await cache.keys()).map((request) => new URL(request.url).pathname);
      });
      assert.ok(cachedShell.includes('/manifest.webmanifest'), 'Service worker caches the web manifest shell dependency.');
      assert.ok(cachedShell.some((url) => url.endsWith('.js')) && cachedShell.some((url) => url.endsWith('.css')), 'Service worker caches built JavaScript and CSS assets after use.');
      await context.setOffline(true);
      await page.reload();
      await page.getByRole('heading', { name: 'Apa nama usaha Anda?' }).waitFor();
      await fillJourney(page, 'Kedai Offline');
      await page.getByRole('checkbox', { name: 'WhatsApp' }).click();
      await page.getByRole('button', { name: 'Lanjutkan' }).click();
      await page.locator('#pain').fill('Koneksi internet terputus.');
      await page.getByRole('button', { name: 'Lanjutkan' }).click();
      await page.getByRole('checkbox', { name: 'Membalas wisatawan' }).click();
      await page.getByRole('button', { name: 'Lanjutkan' }).click();
      await page.getByRole('button', { name: 'Simpan jawaban' }).click();
      await page.locator('.confirmation').waitFor();
    assert.match(await page.locator('.confirmation').innerText(), /saved on this device|tersimpan di perangkat ini/i);
      await page.reload();
      await page.getByRole('heading', { name: 'Apa nama usaha Anda?' }).waitFor();
      const offlineRecord = await page.evaluate(() => new Promise((resolve, reject) => {
        const req = indexedDB.open('local-digital-diagnostics', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => { const tx = req.result.transaction('submissions'); const rows = tx.objectStore('submissions').getAll(); rows.onsuccess = () => resolve(rows.result.find((row) => row.businessName === 'Kedai Offline')); rows.onerror = () => reject(rows.error); };
      }));
      assert.equal(offlineRecord.status, 'local_only', 'Completed response persists while offline after a page refresh.');
      await context.setOffline(false);
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log('Diagnostic browser checks passed: validation, category/tool choices, Nothing exclusivity, translations, state retention, drafts, contact consent/privacy, local save, duplicate prevention, seven viewport widths, screenshots, and no page errors.');
  } finally { await browser.close(); }
  } finally {
    server?.kill();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });


