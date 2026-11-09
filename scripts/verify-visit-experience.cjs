const assert = require('node:assert/strict');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'frontend');
const { chromium } = require(path.join(frontend, 'node_modules', 'playwright'));

async function freePort() {
  const server = net.createServer();
  await new Promise((res, rej) => server.once('error', rej).listen(0, '127.0.0.1', res));
  const { port } = server.address();
  await new Promise((res, rej) => server.close((err) => (err ? rej(err) : res())));
  return port;
}

async function waitForHttp(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server starting
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  console.log('--- Starting Business Discovery Experience Verification ---');

  const appPort = await freePort();
  console.log(`Allocated frontend port: ${appPort}`);

  const screenshotsDir = path.join(root, 'test-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // Start Next.js production server
  const nextBin = path.join(frontend, 'node_modules', 'next', 'dist', 'bin', 'next');
  const serverProcess = spawn(process.execPath, [nextBin, 'start', '-p', String(appPort)], {
    cwd: frontend,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(appPort),
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProcess.stdout.on('data', (d) => process.stdout.write(`[next] ${d}`));
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[next-err] ${d}`));

  const baseUrl = `http://localhost:${appPort}`;
  console.log(`Waiting for frontend to become available at ${baseUrl}...`);
  await waitForHttp(baseUrl);
  console.log('Frontend server is online!');

  const browser = await chromium.launch({ headless: true });

  try {
    // ---------------- TEST 1: DESKTOP VIEWPORT (1440x900) ----------------
    console.log('\n[Test 1] Verifying Desktop Experience (1440x900)...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await desktopContext.newPage();

    let capturedPayload = null;
    await page.route('http://localhost:4000/api/diagnostic-submissions', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        capturedPayload = JSON.parse(request.postData() || '{}');
        console.log('Intercepted diagnostic submission payload:', JSON.stringify(capturedPayload, null, 2));
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Business diagnostic submitted successfully',
            submission: {
              id: 9901,
              submissionUuid: 'test-uuid-88a9-4001',
              status: 'received',
            },
          }),
        });
      }
      return route.continue();
    });

    await page.goto(`${baseUrl}/visit`, { waitUntil: 'networkidle' });

    // Verify Hero
    const heroHeadline = await page.textContent('h1');
    assert.ok(heroHeadline.includes('Every business has a story'), 'Hero title should match');
    assert.ok(heroHeadline.includes('Start by listening'), 'Hero emphasis should match');
    console.log('✓ Hero headline verified');

    // Verify 3D Canvas element exists and is rendered
    const canvas = await page.locator('canvas').first();
    assert.ok(await canvas.isVisible(), 'Living Business Landscape canvas must be visible');
    console.log('✓ Living Business Landscape 3D Canvas is visible');

    // Screenshot Desktop Hero
    await page.screenshot({ path: path.join(screenshotsDir, '01-desktop-hero.png') });

    // Verify Narrative Section B (Interactive Lenses)
    console.log('[Test 2] Verifying Interactive Operational Lenses...');
    await page.getByRole('button', { name: /The Fading Paper Ledger/i }).click();
    assert.ok(await page.locator('h4').filter({ hasText: /The Fading Paper Ledger/i }).isVisible());

    // Toggle between Surface and Reality
    await page.getByRole('button', { name: /What Visitors See/i }).click();
    assert.ok(await page.getByText(/Superficial Impression/i).isVisible());

    await page.getByRole('button', { name: /What the Owner Faces/i }).click();
    assert.ok(await page.getByText(/The Operational Friction Behind the Counter/i).isVisible());
    console.log('✓ Interactive operational lenses and perspective toggle verified');

    // Verify Bilingual Language Toggle
    console.log('[Test 3] Verifying Bilingual Language Switcher (EN -> ID)...');
    await page.getByRole('button', { name: 'Bahasa Indonesia' }).click();

    // Verify translated elements
    const idHeadline = await page.textContent('h1');
    assert.ok(idHeadline.includes('Setiap usaha punya cerita'), 'Headline should be in Indonesian');
    assert.ok(idHeadline.includes('Mulailah dengan mendengarkan'), 'Indonesian emphasis should match');
    assert.ok(await page.getByText('BEBAN YANG TAK TERLIHAT').isVisible());
    console.log('✓ Full page translated smoothly to Bahasa Indonesia');

    // Switch back to English
    await page.getByRole('button', { name: 'English' }).click();
    assert.ok((await page.textContent('h1')).includes('Every business has a story'));
    console.log('✓ Switched cleanly back to English');

    // Verify Form Step Navigation & Interaction
    console.log('[Test 4] Verifying Guided Form Workflow & Field Validation...');
    await page.getByRole('button', { name: 'Start Business Visit' }).click();

    // Step 1: Context & People
    await page.locator('#field-pilot-location').fill('Nusa Lembongan, Bali');
    await page.locator('#field-participant-name').fill('Made Sudarma');
    await page.locator('#field-business-name').fill('Warung Pantai Indah');
    await page.locator('#field-business-type').fill('Warung & Cafe');
    await page.getByRole('button', { name: /Next Step/i }).click();

    // Step 2: Tools
    console.log('[Test 5] Verifying Step 2 Tools & "None" Exclusivity...');
    await page.getByText('WhatsApp / Chat').click();
    await page.getByText('Paper Records / Notebooks').click();

    // Test 'none' exclusivity: selecting none should uncheck others
    await page.getByText('None / Pure Memory').click();
    // selecting whatsapp should uncheck none
    await page.getByText('WhatsApp / Chat').click();
    await page.getByText('Paper Records / Notebooks').click();
    await page.getByRole('button', { name: /Next Step/i }).click();

    // Step 3: Problem Areas
    console.log('[Test 6] Verifying Step 3 Problem Areas...');
    await page.getByText('Replying to Tourists').click();
    await page.getByText('Bookings & Reservations').click();
    await page.getByRole('button', { name: /Next Step/i }).click();

    // Step 4: In Their Own Words
    console.log('[Test 7] Verifying Step 4 Operational Pain textarea...');
    const painText = 'Every evening during peak season, we receive dozens of WhatsApp inquiries. I am cooking in the kitchen and cannot reply until 10 PM. By then, half of our potential guests have booked elsewhere.';
    await page.locator('#field-biggest-pain').fill(painText);
    await page.getByRole('button', { name: /Next Step/i }).click();

    // Step 5: Frequency & Consent
    console.log('[Test 8] Verifying Step 5 Frequency & WhatsApp Consent...');
    await page.getByText('Daily', { exact: true }).click();

    // Explicit consent toggle
    await page.getByText(/The business owner explicitly agrees to be contacted/i).click();
    await page.locator('#field-contact-name').fill('Ibu Ketut');
    await page.locator('#field-contact-value').fill('+62 812 3456 7890');

    // Verify Draft Persistence before submission
    console.log('[Test 9] Verifying Local Draft Storage & Restoration...');
    await page.reload({ waitUntil: 'networkidle' });
    assert.ok(await page.locator('#field-business-name').inputValue() === 'Warung Pantai Indah', 'Draft must restore business name');
    console.log('✓ Draft restored successfully after page refresh');

    // Submit Form
    console.log('[Test 10] Submitting Form and Verifying Payload & Success State...');
    // Jump to step 5 (or navigate forward)
    await page.locator('button[aria-label="Go to step 5"]').click();
    await page.screenshot({ path: path.join(screenshotsDir, '02-desktop-form-step5.png') });

    await page.getByRole('button', { name: /Submit Business Visit/i }).click();

    // Verify Success Screen
    await page.getByText('Business Visit Recorded.').waitFor();
    assert.ok(await page.getByText('Warung Pantai Indah').isVisible());
    assert.ok(await page.getByText('test-uuid-88a9-4001').isVisible());
    assert.ok(await page.getByText(/Queued for Evidence Review/i).isVisible());
    await page.screenshot({ path: path.join(screenshotsDir, '03-desktop-success.png') });
    console.log('✓ Form submission successful with receipt verification!');

    // Validate captured payload against schema requirements
    assert.equal(capturedPayload.pilotLocation, 'Nusa Lembongan, Bali');
    assert.equal(capturedPayload.participantName, 'Made Sudarma');
    assert.equal(capturedPayload.businessName, 'Warung Pantai Indah');
    assert.equal(capturedPayload.businessType, 'Warung & Cafe');
    assert.deepEqual(capturedPayload.currentTools, ['whatsapp', 'paper_records']);
    assert.deepEqual(capturedPayload.problemAreas, ['tourist_replies', 'bookings']);
    assert.equal(capturedPayload.biggestOperationalPain, painText);
    assert.equal(capturedPayload.painFrequency, 'daily');
    assert.equal(capturedPayload.willingnessToPay, 'unsure');
    assert.equal(capturedPayload.budgetAmount, null);
    assert.equal(capturedPayload.budgetCurrency, null);
    assert.equal(capturedPayload.followUpConsent, true);
    assert.equal(capturedPayload.contactName, 'Ibu Ketut');
    assert.equal(capturedPayload.contactMethod, 'whatsapp');
    assert.equal(capturedPayload.contactValue, '+62 812 3456 7890');
    console.log('✓ Payload strictly matches backend schema contract!');

    await desktopContext.close();

    // ---------------- TEST 2: MOBILE VIEWPORT (390x844 iPhone 12/13/14) ----------------
    console.log('\n[Test 11] Verifying Mobile Viewport (390x844)...');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${baseUrl}/visit`, { waitUntil: 'networkidle' });

    // Check no horizontal scroll
    const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await mobilePage.evaluate(() => document.documentElement.clientWidth);
    assert.ok(scrollWidth <= clientWidth + 2, `No horizontal overflow on mobile: scrollWidth ${scrollWidth} vs clientWidth ${clientWidth}`);
    console.log('✓ No horizontal scrolling on mobile');

    // Check mobile canvas
    assert.ok(await mobilePage.locator('canvas').first().isVisible(), 'Canvas must scale cleanly on mobile');
    await mobilePage.screenshot({ path: path.join(screenshotsDir, '04-mobile-hero.png') });

    // Check Expansive Mode toggle
    await mobilePage.getByRole('button', { name: /Expansive Mode/i }).click();
    assert.ok(await mobilePage.getByText('01 / Context').isVisible());
    assert.ok(await mobilePage.getByText('02 / Existing Tools').isVisible());
    await mobilePage.screenshot({ path: path.join(screenshotsDir, '05-mobile-expansive-mode.png') });
    console.log('✓ Expansive mode works cleanly on mobile');

    await mobileContext.close();

    console.log('\n======================================================');
    console.log('ALL VERIFICATION CHECKS PASSED WITH EXCELLENCE!');
    console.log('======================================================');
  } finally {
    await browser.close();
    serverProcess.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
