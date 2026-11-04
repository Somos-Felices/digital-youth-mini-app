const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const net = require('node:net');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const frontend = path.join(root, 'frontend');
const dotenv = require(path.join(backend, 'node_modules', 'dotenv'));
dotenv.config({ path: path.join(backend, '.env') });
dotenv.config({ path: path.join(backend, '.env.test'), override: true });
// The test runner uses the migration identity for disposable fixture setup and
// cleanup, while the owned API process keeps the restricted application user.
process.env.MIGRATION_DB_NAME = 'digital_youth_mini_app_test';
const mysql = require(path.join(backend, 'node_modules', 'mysql2', 'promise'));
const argon2 = require(path.join(backend, 'node_modules', 'argon2'));
const { chromium } = require(path.join(frontend, 'node_modules', 'playwright'));
const slug = `browser-e2e-${randomUUID().slice(0, 12)}`;
const title = 'Disposable browser workflow candidate';
const email = `browser-e2e-${randomUUID()}@digital-youth.test`;
const password = `Browser-Test-${randomUUID()}-A9!`;
let today, opportunityCountBefore;
const children = [];
let db, adminId, browser, apiPort, appPort, base, runFailure, cleanupFailure;

function npm(args, cwd, env = process.env) {
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, 'Run the browser suite through npm so npm_execpath is available.');
  execFileSync(process.execPath, [npmCli, ...args], { cwd, stdio: 'inherit', env });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

function ownProcess(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.output = '';
  child.stdout.on('data', chunk => { child.output += chunk.toString(); });
  child.stderr.on('data', chunk => { child.output += chunk.toString(); });
  children.push(child);
  return child;
}

async function waitForHealth(child, url, check) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Owned local service exited early:\n${child.output}`);
    try {
      const response = await fetch(url);
      if (response.ok && await check(await response.json())) return;
    } catch { /* the owned server is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for owned local service ${url}:\n${child.output}`);
}

async function main() {
  assert.equal(process.env.DB_NAME, 'digital_youth_mini_app_test', 'Browser E2E refuses any database other than digital_youth_mini_app_test.');
  assert.equal(process.env.NODE_ENV, 'test', 'Browser E2E requires NODE_ENV=test.');
  npm(['run', 'build'], backend);
  npm(['run', 'build'], frontend, { ...process.env, NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000' });

  db = await mysql.createConnection({ host: process.env.MIGRATION_DB_HOST || process.env.DB_HOST, port: Number(process.env.MIGRATION_DB_PORT || process.env.DB_PORT), database: process.env.MIGRATION_DB_NAME, user: process.env.MIGRATION_DB_USER || process.env.DB_USER, password: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD });
  const [oldAdmins] = await db.execute("SELECT id FROM admin_users WHERE email LIKE 'browser-e2e-%@digital-youth.test' AND display_name IN ('Temporary Browser Test Admin','Temporary Playwright Admin')");
  for (const row of oldAdmins) {
    await db.execute('DELETE FROM admin_sessions WHERE admin_user_id=?', [row.id]);
    await db.execute('DELETE FROM admin_users WHERE id=?', [row.id]);
  }
  const [[staleAdmins]] = await db.execute("SELECT COUNT(*) AS total FROM admin_users WHERE email LIKE 'browser-e2e-%@digital-youth.test' AND display_name IN ('Temporary Browser Test Admin','Temporary Playwright Admin')");
  assert.equal(Number(staleAdmins.total), 0, 'Prior disposable browser-test administrators must be removed before the suite starts.');
  const [[date]] = await db.query("SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS today_value");
  today = String(date.today_value);
  const [[before]] = await db.query('SELECT COUNT(*) AS total FROM earning_opportunities');
  opportunityCountBefore = Number(before.total);
  apiPort = await freePort();
  do { appPort = await freePort(); } while (appPort === apiPort);
  const apiEnv = { ...process.env, PORT: String(apiPort), NODE_ENV: 'test', CORS_ORIGINS: `http://localhost:${appPort}` };
  const apiChild = ownProcess(process.execPath, [path.join(backend, 'dist', 'server.js')], backend, apiEnv);
  await waitForHealth(apiChild, `http://127.0.0.1:${apiPort}/api/health/db`, state => state.status === 'ok' && state.database === 'digital_youth_mini_app_test');
  const appChild = ownProcess(process.execPath, [path.join(frontend, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(appPort)], frontend, { ...process.env, NODE_ENV: 'production', PORT: String(appPort) });
  base = `http://localhost:${appPort}`;
  await waitForDocument(appChild, base);

  const [created] = await db.execute('INSERT INTO admin_users(email,display_name,password_hash) VALUES(?,?,?)', [email, 'Temporary Playwright Admin', await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })]);
  adminId = created.insertId;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined });
  await participantWorkflow({ width: 1440, height: 980 });
  await participantWorkflow({ width: 390, height: 844 });
  await adminWorkflow();

}

async function waitForDocument(child, url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Owned frontend exited early:\n${child.output}`);
    try { const response = await fetch(url); if (response.ok) return; } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for frontend ${url}:\n${child.output}`);
}

async function routeToTestApi(page, delayFirstAuthMe = false) {
  let delayed = false;
  await page.route('http://localhost:4000/api/**', async route => {
    const target = new URL(route.request().url());
    target.port = String(apiPort);
    if (delayFirstAuthMe && !delayed && target.pathname === '/api/auth/me') {
      delayed = true;
      const response = await route.fetch({ url: target.toString() });
      await new Promise(resolve => setTimeout(resolve, 3000));
      return route.fulfill({ response });
    }
    return route.continue({ url: target.toString() });
  });
}

async function participantWorkflow(viewport) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', async response => {
    if (response.url().includes('/api/') && response.status() >= 400) {
      const body = await response.text().catch(() => '');
      console.error('E2E API FAILURE:', response.status(), response.url(), body);
      failures.push(`${response.status()} ${response.url()} :: ${body}`);
    }
  });
  await routeToTestApi(page);
  await page.goto(`${base}/opportunities`);
  await page.getByRole('heading', { name: 'Ideas under evidence review.' }).waitFor();
  await page.locator('.method-entry').nth(2).waitFor({
    state: 'visible',
    timeout: 15000
  });
  assert.equal(await page.locator('.method-entry').count(), 3, 'All three existing candidates must remain in the directory.');
  for (const entry of await page.locator('.method-entry').all()) assert.ok(await entry.locator('.status-under_validation').count() >= 1, 'Each candidate must show under-validation status.');
  await page.locator('.method-entry').first().getByRole('link', { name: /Review details and eligibility/ }).click();
  await page.getByRole('heading', { name: 'Check fit using optional details' }).waitFor();
  assert.equal(await page.locator('.assessment-row').count(), 4);
  await page.locator('label.field').filter({ hasText: 'Country code' }).locator('input').fill('IN');
  await page.locator('label.field').filter({ hasText: 'Device' }).locator('select').selectOption('android');
  await page.locator('label.field').filter({ hasText: 'Internet access' }).locator('select').selectOption('yes');
  await page.getByText(/Result: potentially eligible|Result: not currently eligible/).waitFor();
  await page.getByRole('heading', { name: 'What to do' }).waitFor();
  await page.getByRole('button', { name: 'Start this opportunity in my local tracker' }).click();
  await page.getByRole('heading', { name: 'Track what you actually do.' }).waitFor();
  const card = page.locator('.local-experiment').first();
  await card.locator('.eyebrow').filter({ hasText: /opportunity.*Started/ }).waitFor();
  await card.locator(".progress-line").getByText(/0 of [1-9]\d* steps completed/).waitFor({ timeout: 10000 });
  assert.match(await card.locator('.progress-line').innerText(), /0 of [1-9]\d* steps completed/);
  await card.locator('.tracker-step input').first().check();
  await card.getByLabel('Time spent in minutes').fill('30'); await card.getByRole('button', { name: 'Add time' }).click();
  await card.getByLabel('Actual cost amount').fill('2'); await card.getByLabel('Cost currency').fill('USD'); await card.getByRole('button', { name: 'Record cost' }).click();
  await card.getByLabel('Income amount').fill('10'); await card.getByLabel('Income currency').fill('USD'); await card.getByLabel('Payment status').selectOption('pending'); await card.getByRole('button', { name: 'Record payment' }).click();
  await card.getByLabel('Income amount').fill('10'); await card.getByLabel('Income currency').fill('USD'); await card.getByLabel('Payment status').selectOption('received'); await card.getByLabel('Payment date').fill(today); await card.getByRole('button', { name: 'Record payment' }).click();
  await card.getByLabel('Attempt type').selectOption('sale'); await card.getByLabel('Attempt description').fill('Browser test attempt'); await card.getByLabel('Attempt outcome').fill('Recorded in the local tracker'); await card.getByRole('button', { name: 'Record attempt' }).click();
  await page.reload();
  const saved = page.locator('.local-experiment').first();
  await saved.getByText('Received gross: USD 10.00').waitFor();
  await saved.getByText('Pending: USD 10.00').waitFor();
  await saved.getByText('Browser test attempt').waitFor();
  await saved.locator(".progress-line").getByText(/1 of [1-9]\d* steps completed/).waitFor({ timeout: 10000 });
  assert.match(await saved.locator('.progress-line').innerText(), /1 of [1-9]\d* steps completed/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export my data/ }).click()]);
  assert.equal(download.suggestedFilename(), 'digital-youth-my-experiments.json');
  page.once('dialog', dialog => dialog.accept());
  await saved.getByRole('button', { name: 'Remove' }).click();
  await page.getByText('No experiments started on this device.').waitFor();
  assert.deepEqual(failures, [], `Participant workflow API/browser failures at ${viewport.width}px`);
  await context.close();
}

async function adminWorkflow() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {
    const url = response.url();
    const expected = (response.status() === 401 && url.endsWith('/api/auth/me')) || (response.status() === 400 && url.includes('/api/admin/opportunities/') && (url.endsWith('/publication') || (url.includes('/evidence/') && url.endsWith('/review'))));
    if (url.includes('/api/') && response.status() >= 400 && !expected) failures.push(`${response.status()} ${url}`);
  });
  await routeToTestApi(page, true);
  await page.goto(`${base}/admin/login`);
  await page.getByLabel('Administrator email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /Sign in/ }).click();
  await page.waitForURL('**/admin');
  await page.waitForTimeout(3300);
  assert.equal(new URL(page.url()).pathname, '/admin', 'A stale initial auth/me failure must not clear the newer login session.');
  await page.getByRole('link', { name: 'Opportunities' }).click();
  await page.waitForURL('**/admin/opportunities');
  await page.getByRole('heading', { name: 'Create opportunity' }).waitFor();
  const fill = async (label, value) => page.locator('label.field').filter({ hasText: label }).locator('input,textarea').first().fill(value);
  await fill('Slug', slug); await fill('Title', title); await fill('Provider / platform', 'Browser test'); await fill('Category', 'Research'); await fill('Description', 'A disposable local browser workflow candidate.'); await fill('What participant does', 'Performs an independently testable workflow.');
  await page.getByRole('button', { name: 'Create opportunity' }).click(); await page.getByText('Saved successfully.').waitFor();
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await fill('Title', `${title} edited`); await page.getByRole('button', { name: 'Save opportunity' }).click(); await page.getByText('Saved successfully.').waitFor();
  await page.getByRole('button', { name: 'Publish as qualified (evidence gate)' }).click();
  await page.getByRole('alert').filter({ hasText: 'Cannot qualify' }).waitFor();

  await fill('Source title', 'Browser test source'); await fill('Source URL', 'https://example.test/browser-e2e'); await fill('Claim supported', 'A test source with enough detail for this browser workflow.'); await fill('Reviewed date', today); await fill('Next review date', new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Add source' }).click(); await page.getByText('Saved successfully.').waitFor();
  let sourceRow = page.locator('.source-row').filter({ hasText: 'Browser test source' });
  const sourceId = Number((await sourceRow.innerText()).match(/Source #(\d+)/)?.[1]); assert.ok(sourceId > 0);
  await sourceRow.getByRole('button', { name: 'Approve' }).click(); await page.getByText('Saved successfully.').waitFor();
  await sourceRow.getByRole('button', { name: 'Edit' }).click();
  await fill('Claim supported', 'Edited source claim remains sufficiently detailed for review.');
  await page.getByRole('button', { name: /Save source/ }).click(); await page.getByText('Saved successfully.').waitFor();
  sourceRow = page.locator('.source-row').filter({ hasText: 'Browser test source' });
  assert.match(await sourceRow.innerText(), /pending/i);
  await sourceRow.getByRole('button', { name: 'Approve' }).click(); await page.getByText('Saved successfully.').waitFor();

  const criteriaSection = page.locator('.editor-section').filter({ hasText: 'Four-condition review' });
  for (let index = 0; index < 4; index++) {
    const editor = criteriaSection.locator('.criterion-editor').nth(index);
    await editor.locator('select').selectOption('pass');
    await editor.locator('textarea').fill('This current approved source supports this criterion.');
    await editor.getByLabel(`Source #${sourceId}`).check();
    await editor.getByRole('button', { name: 'Save criterion review' }).click();
    await page.getByText('Saved successfully.').waitFor();
  }

  await fill('hypothesis', 'A repeated local test produces an observable output.');
  await fill('test design', 'Follow the same steps once on a phone.');
  await fill('starting conditions', 'New test profile, no existing audience.');
  await fill('actual output', 'One output was generated.');
  await fill('time minutes', '40'); await fill('expenses', '3'); await fill('expense currency', 'USD');
  await fill('rejections', 'First application rejected.'); await fill('final assessment', 'Output completed; payment evidence is being reviewed.');
  await page.getByRole('button', { name: 'Create experiment' }).click(); await page.getByText('Saved successfully.').waitFor();
  const experimentCard = page.locator('.criterion-editor').filter({ has: page.getByRole('heading', { name: /A repeated local test produces an observable output\./ }) });
  await experimentCard.waitFor();
  assert.equal(await experimentCard.count(), 1, 'The experiment locator must identify the single experiment created by this run.');
  const experimentId = Number((await experimentCard.locator('h3').innerText()).match(/Experiment #(\d+)/)?.[1]); assert.ok(experimentId > 0);
  await experimentCard.getByRole('button', { name: 'Edit experiment' }).click();
  await fill('actual output', 'Edited experiment output is visible.');
  await page.getByRole('button', { name: 'Save experiment' }).click(); await page.getByText('Saved successfully.').waitFor();
  await page.getByText('Edited experiment output is visible.').waitFor();

  const addEvidence = async (captureDate) => {
    await fill('Evidence title', captureDate ? 'Dated payment evidence' : 'Undated payment evidence');
    await fill('Evidence description', 'Payment receipt retained as evidence for this experiment.');
    await page.locator('label.field').filter({ hasText: 'Evidence type' }).locator('select').selectOption('income_record');
    if (captureDate) await fill('Evidence captured on', captureDate);
    await page.getByRole('button', { name: new RegExp(`Add evidence to experiment #${experimentId}`) }).click();
    await page.getByText('Saved successfully.').waitFor();
  };
  await addEvidence('');
  let evidenceRow = experimentCard.locator('.ledger-entry').filter({ hasText: 'Undated payment evidence' });
  await evidenceRow.getByRole('button', { name: 'Approve evidence' }).click();
  await page.getByRole('alert').filter({ hasText: 'capture date' }).waitFor();

  await page.locator('label.field').filter({ hasText: 'Experiment' }).locator('select').selectOption(String(experimentId));
  await page.locator('label.field').filter({ hasText: 'Status' }).last().locator('select').selectOption('received');
  await fill('Amount', '8'); await fill('Currency', 'USD'); await fill('Payment date (required when received)', today);
  assert.equal(await page.getByRole('button', { name: new RegExp(`Record payment for experiment #${experimentId}`) }).isDisabled(), true, 'Received payment remains disabled until dated income evidence is approved.');

  await addEvidence(today);
  evidenceRow = experimentCard.locator('.ledger-entry').filter({ hasText: /^income_record: Dated payment evidence ·/ });
  assert.equal(await evidenceRow.count(), 1, `Exactly one dated evidence record must appear for this experiment after one submission; found ${await evidenceRow.count()}: ${await evidenceRow.allInnerTexts()}`);
  await evidenceRow.getByRole('button', { name: 'Approve evidence' }).click();
  await page.getByRole('status').filter({ hasText: 'Saved successfully.' }).waitFor();
  await page.locator('label.field').filter({ hasText: 'Status' }).last().locator('select').selectOption('pending');
  await fill('Amount', '20'); await fill('Currency', 'USD');
  await page.getByRole('button', { name: new RegExp(`Record payment for experiment #${experimentId}`) }).click(); await page.getByText('Saved successfully.').waitFor();
  await page.locator('label.field').filter({ hasText: 'Status' }).last().locator('select').selectOption('received');
  await fill('Amount', '8'); await fill('Currency', 'USD'); await fill('Payment date (required when received)', today);
  await page.getByRole('button', { name: new RegExp(`Record payment for experiment #${experimentId}`) }).click(); await page.getByText('Saved successfully.').waitFor();
  await experimentCard.getByText(/pending: 20(?:\.00)? USD/i).waitFor();
  await experimentCard.getByText(/received: 8(?:\.00)? USD/i).waitFor();

  await page.getByRole('button', { name: 'Publish as qualified (evidence gate)' }).click(); await page.getByText('Saved successfully.').waitFor();
  await page.locator('.editor-section').filter({ hasText: 'Publication controls' }).getByRole('button', { name: 'Archive', exact: true }).click(); await page.getByText('Saved successfully.').waitFor();
  const publicLookup = await fetch(`http://127.0.0.1:${apiPort}/api/opportunities/${slug}`);
  assert.equal(publicLookup.status, 404, 'Archived opportunity must disappear from the public directory.');
  assert.deepEqual(failures, [], 'Admin journey must have no unexpected API or browser errors.');
  await context.close();
}

async function cleanup() {
  if (browser) await browser.close().catch(error => { cleanupFailure ||= error; });
  for (const child of children.reverse()) {
    if (child.exitCode === null) {
      try {
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch (error) {
        if (child.exitCode === null) cleanupFailure ||= error;
      }
      await Promise.race([
        new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 5000))
      ]);
      if (child.exitCode === null) cleanupFailure ||= new Error(`Could not stop owned service process tree ${child.pid}.`);
    }
  }
  if (db) {
    try {
      if (adminId) {
        await db.execute('DELETE FROM admin_sessions WHERE admin_user_id=?', [adminId]);
        await db.execute('DELETE FROM admin_users WHERE id=?', [adminId]);
        const [[remaining]] = await db.execute('SELECT COUNT(*) AS total FROM admin_users WHERE id=?', [adminId]);
        assert.equal(Number(remaining.total), 0, 'Temporary administrator must be removed.');
      }
      const [opportunities] = await db.execute('SELECT id FROM earning_opportunities WHERE slug=?', [slug]);
      for (const opportunity of opportunities) {
        await db.execute('DELETE p FROM opportunity_research_payments p INNER JOIN opportunity_research_experiments e ON e.id=p.experiment_id WHERE e.opportunity_id=?', [opportunity.id]);
        await db.execute('DELETE ev FROM opportunity_research_evidence ev INNER JOIN opportunity_research_experiments e ON e.id=ev.experiment_id WHERE e.opportunity_id=?', [opportunity.id]);
        await db.execute('DELETE FROM opportunity_research_experiments WHERE opportunity_id=?', [opportunity.id]);
      }
      await db.execute('DELETE FROM earning_opportunities WHERE slug=?', [slug]);
      const [[remaining]] = await db.execute('SELECT COUNT(*) AS total FROM earning_opportunities WHERE slug=?', [slug]);
      assert.equal(Number(remaining.total), 0, 'Temporary opportunity must be removed.');
      const [[after]] = await db.query('SELECT COUNT(*) AS total FROM earning_opportunities');
      assert.equal(Number(after.total), opportunityCountBefore, 'Browser test cleanup must leave the test opportunity count unchanged.');
      if (!runFailure) {
        console.log('PASS: participant opportunity workflow, desktop 1440x980 and mobile 390x844; persistence, navigation, API, export, delete.');
        console.log('PASS: admin login, create/edit, source create/edit/review, all criteria, experiment edit, evidence review, payment evidence gate, qualification and archive.');
        console.log('PASS: disposable administrator and opportunity cleaned; isolated test opportunity count unchanged.');
      }
    } catch (error) { cleanupFailure ||= error; }
    await db.end().catch(error => { cleanupFailure ||= error; });
  }
}

main().catch(error => { runFailure = error; }).finally(async () => {
  await cleanup();
  if (runFailure) { console.error(runFailure); process.exitCode = 1; }
  if (cleanupFailure) { console.error('E2E cleanup failed:', cleanupFailure); process.exitCode = 1; }
});
