const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const dotenv = require(path.join(__dirname, '..', 'backend', 'node_modules', 'dotenv'));
const mysql = require(path.join(__dirname, '..', 'backend', 'node_modules', 'mysql2', 'promise'));
const { chromium } = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'playwright'));

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'frontend');
const viteBin = path.join(frontend, 'node_modules', 'vite', 'bin', 'vite.js');
const base = 'http://localhost:5173';
const api = process.env.E2E_API_URL || 'http://localhost:4001';
const dbEnvPath = path.join(root, 'backend', '.env.test');
const dbEnv = dotenv.parse(fs.readFileSync(dbEnvPath));
if (dbEnv.NODE_ENV !== 'test' || dbEnv.DB_NAME !== 'digital_youth_mini_app_test') {
  throw new Error('Refusing browser E2E: backend/.env.test must identify isolated database digital_youth_mini_app_test.');
}

async function waitFor(url, processRef) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (processRef?.exitCode !== null && processRef?.exitCode !== undefined) throw new Error(`Local Vite server exited early:\n${processRef.output}`);
    try { const response = await fetch(url); if (response.ok) return; } catch { /* service is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}${processRef?.output ? `\n${processRef.output}` : ''}`);
}

async function openAndComplete(page, { businessName, language, contact }) {
  await page.goto(base);
  if (language === 'en') await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('heading', { name: language === 'id' ? 'Apa nama usaha Anda?' : 'What is the name of the business?' }).waitFor();
  await page.locator('#businessName').fill(businessName);
  await page.getByRole('radio', { name: language === 'id' ? 'Makanan & Minuman' : 'Food & Beverage' }).click();
  await page.getByRole('button', { name: language === 'id' ? 'Lanjutkan' : 'Continue' }).click();
  await page.getByRole('checkbox', { name: 'WhatsApp' }).click();
  await page.getByRole('checkbox', { name: language === 'id' ? 'Kertas dan pena' : 'Paper & pen' }).click();
  await page.getByRole('button', { name: language === 'id' ? 'Lanjutkan' : 'Continue' }).click();
  await page.locator('#pain').fill('Difficulty responding to customer questions and maintaining daily records.');
  await page.getByRole('button', { name: language === 'id' ? 'Lanjutkan' : 'Continue' }).click();
  await page.getByRole('radio', { name: language === 'id' ? 'Mungkin' : 'Maybe' }).click();
  await page.getByRole('button', { name: language === 'id' ? 'Lanjutkan' : 'Continue' }).click();
  if (contact) {
    await page.locator('#contactName').fill('Ayu QA');
    await page.locator('#whatsapp').fill('+62 812 3456 7890');
    await page.getByLabel('I agree to be contacted on WhatsApp about this business visit.').check();
  }
}

async function main() {
  const runId = randomUUID();
  const noConsentName = `E2E Test Cafe ${runId.slice(0, 8)}`;
  const consentName = `E2E Test Cafe Consent ${runId.slice(0, 8)}`;
  const submissions = [];
  const server = spawn(process.execPath, [viteBin, '--host', 'localhost', '--port', '5173', '--strictPort'], {
    cwd: frontend,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, VITE_API_BASE_URL: api }
  });
  server.output = '';
  server.stdout.on('data', (chunk) => { server.output += chunk.toString(); });
  server.stderr.on('data', (chunk) => { server.output += chunk.toString(); });
  let browser;
  let connection;
  try {
    await waitFor(`${api}/api/health/db`);
    await waitFor(base, server);
    connection = await mysql.createConnection({ host: dbEnv.DB_HOST, port: Number(dbEnv.DB_PORT || 3306), database: dbEnv.DB_NAME, user: dbEnv.DB_USER, password: dbEnv.DB_PASSWORD });
    const [targetIdentity] = await connection.query('SELECT DATABASE() AS database_name');
    assert.equal(targetIdentity[0].database_name, 'digital_youth_mini_app_test', 'E2E writes are restricted to the isolated test schema.');
    const installedChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || (fs.existsSync(installedChrome) ? installedChrome : undefined) });
    const errors = [];
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url() === `${api}/api/v2/field-visit-diagnostics` && request.method() === 'POST') submissions.push(JSON.parse(request.postData() || '{}'));
    });

    await openAndComplete(page, { businessName: noConsentName, language: 'id', contact: false });
    await page.screenshot({ path: path.join(root, 'test-screenshots', 'local-digital-e2e-step5-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Simpan jawaban' }).click();
    await page.getByRole('heading', { name: 'Terima kasih — jawaban Anda telah kami terima.' }).waitFor();
    assert.equal(await page.locator('.local-note').count(), 0, 'Server acknowledgment shows the received confirmation without a local-only warning.');
    await page.screenshot({ path: path.join(root, 'test-screenshots', 'local-digital-e2e-received-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 980 });
    await page.screenshot({ path: path.join(root, 'test-screenshots', 'local-digital-e2e-desktop.png'), fullPage: true });
    assert.equal(submissions.at(-1).businessName, noConsentName);
    assert.equal(submissions.at(-1).followUpConsent, false);

    const retryPage = await context.newPage();
    retryPage.on('pageerror', (error) => errors.push(error.message));
    retryPage.on('request', (request) => {
      if (request.url() === `${api}/api/v2/field-visit-diagnostics` && request.method() === 'POST') submissions.push(JSON.parse(request.postData() || '{}'));
    });
    let failFirst = true;
    await retryPage.route(`${api}/api/v2/field-visit-diagnostics`, async (route) => {
      if (failFirst) { failFirst = false; await route.abort('failed'); return; }
      await route.continue();
    });
    await openAndComplete(retryPage, { businessName: consentName, language: 'en', contact: true });
    await retryPage.getByRole('button', { name: 'Save answers' }).click();
    await retryPage.getByRole('alert').waitFor();
    assert.match(await retryPage.locator('.save-error').innerText(), /not confirmed receipt/i);
    assert.equal(await retryPage.locator('#whatsapp').inputValue(), '+62 812 3456 7890', 'Contact data remains available for a retry after request failure.');
    await retryPage.getByRole('button', { name: 'Retry submission' }).click();
    await retryPage.getByRole('heading', { name: 'Thank you — we’ve received your answers.' }).waitFor();
    assert.equal(submissions.at(-1).businessName, consentName);
    assert.equal(submissions.at(-1).followUpConsent, true);
    assert.equal(submissions.at(-1).contactName, 'Ayu QA');
    assert.equal(submissions.at(-1).whatsappNumber, '+62 812 3456 7890');
    assert.equal(submissions.at(-2).submissionUuid, submissions.at(-1).submissionUuid, 'Retry reuses the idempotency key.');

    const duplicate = await retryPage.evaluate(async ({ payload, api }) => {
      const response = await fetch(`${api}/api/v2/field-visit-diagnostics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      return { status: response.status, body: await response.json() };
    }, { payload: submissions.at(-1), api });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.submission.duplicate, true);
    const invalid = await retryPage.evaluate(async ({ payload, api }) => {
      const response = await fetch(`${api}/api/v2/field-visit-diagnostics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, submissionUuid: crypto.randomUUID(), currentTools: ['nothing', 'whatsapp'] }) });
      return response.status;
    }, { payload: submissions.at(-1), api });
    assert.equal(invalid, 400, 'Server rejects the mutually exclusive Nothing selection.');
    assert.deepEqual(errors, []);

    const [identity] = await connection.query('SELECT DATABASE() AS database_name');
    assert.equal(identity[0].database_name, 'digital_youth_mini_app_test', 'Independent verification is against the isolated test schema.');
    const uuids = [submissions[0].submissionUuid, submissions[1].submissionUuid];
    const [rows] = await connection.execute(
      `SELECT submission_uuid, business_name, business_type, current_tools,
        biggest_operational_pain, willingness_to_pay, contact_name, whatsapp_number,
        follow_up_consent, payload_hash, created_at
       FROM field_visit_diagnostic_submissions WHERE submission_uuid IN (?, ?)`,
      uuids
    );
    assert.equal(rows.length, 2, 'Both browser submissions are present in MySQL.');
    const readTools = (value) => typeof value === 'string' ? JSON.parse(value) : value;
    const unconsentedRow = rows.find((row) => row.submission_uuid === submissions[0].submissionUuid);
    const consentedRow = rows.find((row) => row.submission_uuid === submissions[1].submissionUuid);
    assert.equal(unconsentedRow.business_name, noConsentName);
    assert.equal(unconsentedRow.business_type, 'food_beverage');
    assert.deepEqual(readTools(unconsentedRow.current_tools), ['whatsapp', 'paper_pen']);
    assert.equal(unconsentedRow.biggest_operational_pain, 'Difficulty responding to customer questions and maintaining daily records.');
    assert.equal(unconsentedRow.willingness_to_pay, 'maybe');
    assert.equal(unconsentedRow.follow_up_consent, 0);
    assert.equal(unconsentedRow.contact_name, null);
    assert.equal(unconsentedRow.whatsapp_number, null);
    assert.equal(consentedRow.business_name, consentName);
    assert.equal(consentedRow.contact_name, 'Ayu QA');
    assert.equal(consentedRow.whatsapp_number, '+62 812 3456 7890');
    assert.equal(consentedRow.follow_up_consent, 1);
    for (const row of rows) { assert.match(row.submission_uuid, /^[0-9a-f-]{36}$/i); assert.match(row.payload_hash, /^[0-9a-f]{64}$/); assert.ok(row.created_at); }

    await context.close();
    console.log(`Field visit E2E passed in installed Chrome against the isolated test database: API health, both languages, server receipt, retry with same UUID, duplicate response, invalid request, and independent MySQL verification of both consent states. Exact test rows will be removed: ${uuids.join(', ')}`);
  } finally {
    if (connection) {
      const [identity] = await connection.query('SELECT DATABASE() AS database_name');
      if (identity[0]?.database_name !== 'digital_youth_mini_app_test') throw new Error('Refusing E2E cleanup outside the isolated test database.');
      // The page request observer also records the deliberately invalid request;
      // only the first two browser submissions can have persisted rows.
      const ids = [...new Set(submissions.slice(0, 2).map((submission) => submission.submissionUuid).filter(Boolean))];
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(', ');
        const [deleted] = await connection.execute(`DELETE FROM field_visit_diagnostic_submissions WHERE submission_uuid IN (${placeholders})`, ids);
        if (deleted.affectedRows !== ids.length) throw new Error(`Expected to clean ${ids.length} exact test UUIDs, removed ${deleted.affectedRows}.`);
      }
      await connection.end();
    }
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
