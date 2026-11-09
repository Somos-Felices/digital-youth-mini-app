const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'playwright'));

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    assert.match(await page.locator('h1').innerText(), /Real problems/);
    await page.getByRole('link', { name: /Start a business visit/i }).click();
    await page.getByLabel('What is the name of the business?').fill('Language preservation check');
    await page.getByRole('button', { name: 'Bahasa Indonesia' }).click();
    assert.match(await page.locator('h1').innerText(), /Percakapan bersama/);
    assert.equal(await page.getByLabel('Siapa nama usahanya?').inputValue(), 'Language preservation check');
    await page.getByLabel('Siapa nama usahanya?').fill('');
    await page.locator('nav').getByRole('link', { name: 'Cara kerja' }).click();
    await page.getByRole('heading', { name: 'Dari mendengarkan hingga belajar' }).waitFor();
    await page.getByRole('heading', { name: 'Dengarkan', exact: true }).waitFor();
    await page.locator('nav').getByRole('link', { name: 'Program' }).click();
    await page.getByRole('heading', { name: 'Dua lokasi uji coba' }).waitFor();
    await page.locator('nav').getByRole('link', { name: 'Beranda' }).click();
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByRole('link', { name: /Start a business visit/i }).click();
    await page.screenshot({ path: path.join(__dirname, '..', 'test-screenshots', 'digital-youth-mvp-form-mobile.png'), fullPage: true });
    assert.equal(await page.locator('.submit-row').evaluate(el => getComputedStyle(el).position), 'sticky');
    await page.getByRole('button', { name: /Save visit on this device/i }).click();
    assert.match(await page.getByRole('alert').innerText(), /Please enter the business name/);
    await page.getByLabel('What is the name of the business?').fill('Warung Uji Coba');
    await page.getByLabel('What kind of business is it?').fill('Neighborhood repair studio');
    await page.getByRole('button', { name: /Save visit on this device/i }).click();
    assert.match(await page.getByRole('alert').innerText(), /Please describe the main difficulty/);
    await page.getByRole('checkbox', { name: 'WhatsApp', exact: true }).check();
    await page.getByRole('checkbox', { name: 'None', exact: true }).check();
    assert.equal(await page.getByRole('checkbox', { name: 'WhatsApp', exact: true }).isChecked(), false);
    await page.getByRole('checkbox', { name: 'WhatsApp', exact: true }).check();
    await page.getByLabel('What takes the most time in your day, or makes you lose customers?').fill('The owner has to re-enter handwritten orders each evening.');
    await page.getByRole('button', { name: /Save visit on this device/i }).click();
    await page.getByRole('status').waitFor();
    await page.reload();
    await page.goto('http://127.0.0.1:5173/visits');
    await page.getByText('Warung Uji Coba').waitFor();
    await page.getByText('Warung Uji Coba').click();
    assert.match(await page.locator('body').innerText(), /Neighborhood repair studio/);
    assert.match(await page.locator('body').innerText(), /No contact information was saved/);
    await page.getByRole('button', { name: /Edit visit/i }).click();
    await page.getByLabel('The business agrees to be contacted through WhatsApp regarding this visit.').check();
    await page.getByLabel('WhatsApp contact (optional)').fill('+62 812 3456 7890');
    await page.getByRole('button', { name: /Save changes/i }).click();
    await page.waitForTimeout(800);
    assert.match(await page.locator('body').innerText(), /\+62 812 3456 7890/);

    await page.goto('http://127.0.0.1:5173/visits');
    await page.getByPlaceholder('Search businesses').fill('Warung');
    await page.getByText('Warung Uji Coba').waitFor();
    const exportDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export JSON/i }).click();
    assert.equal((await exportDownload).suggestedFilename(), 'digital-youth-visits.json');
    await page.getByText('Warung Uji Coba').click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: /Delete visit/i }).click();
    await page.getByText('No visits saved yet').waitFor();

    await page.goto('http://127.0.0.1:5173/visit/new');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await context.setOffline(true);
    await page.reload();
    await page.getByLabel('What is the name of the business?').fill('Offline visit');
    await page.getByLabel('What takes the most time in your day, or makes you lose customers?').fill('Saved without a network connection.');
    await page.getByRole('button', { name: /Save visit on this device/i }).click();
    await page.getByRole('status').waitFor();
    await page.goto('http://127.0.0.1:5173/visits');
    await page.getByText('Offline visit').waitFor();
    await context.setOffline(false);

    for (const width of [360, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('http://127.0.0.1:5173/');
      const dimensions = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth, overflow: [...document.querySelectorAll('*')].filter(el => { const r=el.getBoundingClientRect(); return r.right>innerWidth+1 || r.left< -1; }).map(el=>({tag:el.tagName,cls:typeof el.className==='string'?el.className:'',right:Math.round(el.getBoundingClientRect().right),text:(el.textContent||'').trim().slice(0,70)})).slice(0,12) }));
      assert.ok(dimensions.body <= dimensions.viewport, `Horizontal overflow at ${width}px: ${JSON.stringify(dimensions)}`);
      if (width === 390) await page.screenshot({ path: path.join(__dirname, '..', 'test-screenshots', 'digital-youth-mvp-mobile.png'), fullPage: true });
      if (width === 1440) await page.screenshot({ path: path.join(__dirname, '..', 'test-screenshots', 'digital-youth-mvp-desktop.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('MVP browser checks passed: language, visit validation and persistence, consent, edit/delete/export, six viewport widths, and no page errors.');
  } finally {
    await context.close();
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exit(1); });
