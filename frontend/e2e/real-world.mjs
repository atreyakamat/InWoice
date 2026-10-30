// Real-world walkthrough in a real browser, against a running InWoice (real database).
//
//   npm run e2e:real                               (defaults as in smoke.mjs)
//
// Creates customers and different kinds of invoices exactly as a person would in the UI,
// checks the totals on screen against hand-worked figures, records payments, saves every
// invoice PDF to e2e/real-world-output/, and opens "Email › Gmail" to check the compose
// window is filled in correctly. Gmail itself is never contacted: the compose URL is
// captured and the page is stubbed, so no email is sent. It creates real records, so run it
// on demo or staging data.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

const BASE = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const EMAIL = process.env.E2E_EMAIL || 'demo@inwoice.local';
const PASSWORD = process.env.E2E_PASSWORD || 'demo12345';
const OUT = path.resolve('e2e/real-world-output');
fs.mkdirSync(OUT, { recursive: true });

const tag = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '');
const problems = [];
const created = [];
let passed = 0;
const step = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    problems.push(`${name}: ${err.message.split('\n')[0]}`);
    console.log(`  ✗ ${name}\n      ${err.message.split('\n')[0]}`);
  }
};
const rupees = (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amountOf = (text) => Number(text.replace(/[^\d.-]/g, ''));

let browser;
for (const channel of ['chrome', 'msedge']) {
  try {
    browser = await chromium.launch({ channel, headless: true });
    break;
  } catch {
    /* next */
  }
}
if (!browser) throw new Error('Chrome or Edge is needed');
const context = await browser.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true });
// Never reach the real Gmail/Outlook: answer with a stub page and keep the URL for checking.
const composeUrls = [];
for (const host of ['https://mail.google.com/**', 'https://outlook.office.com/**']) {
  await context.route(host, (route) => {
    composeUrls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>compose stub</title>' });
  });
}
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`JS error: ${e.message}`));
page.on('response', (r) => r.status() >= 500 && errors.push(`HTTP ${r.status()} ${r.url()}`));

console.log(`Real-world walkthrough against ${BASE}`);

let token = '';
await step('sign in', async () => {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: /Hello/ }).waitFor({ timeout: 15000 });
  token = await page.evaluate(() => localStorage.getItem('inwoice_token'));
});

const apiCall = async (method, url, data) => {
  const r = await page.request[method](`${BASE}/api${url}`, { headers: { Authorization: `Bearer ${token}` }, data });
  if (!r.ok()) throw new Error(`${method.toUpperCase()} ${url}: ${r.status()} ${await r.text()}`);
  return (await r.json()).data;
};

// Business must be in Goa for the CGST/SGST vs IGST checks below.
let settings;
await step('business is set up for GST in Goa', async () => {
  settings = await apiCall('get', '/settings');
  if (!/goa/i.test(settings.state ?? '')) throw new Error(`business state is "${settings.state}", expected Goa (the demo data uses Goa)`);
});

const customers = {};
await step('add real-looking customers', async () => {
  const add = async (key, body) => (customers[key] = await apiCall('post', '/customers', { ...body, name: `${body.name} [${tag}]` }));
  await add('cafe', { name: 'Bean There Café', email: 'accounts@beanthere.example', phone: '+91 98220 12345', state: 'Goa' });
  await add('mumbai', { name: 'Kala Retail LLP', email: 'purchase@kalaretail.example', state: 'Maharashtra' });
  await add('walkin', { name: 'Riya Naik', phone: '9850012345', state: 'Goa' });
  await add('mural', { name: 'Arjun Rao', email: 'arjun.rao@example.com', state: 'Karnataka' });
});

const field = (scope, caption) => scope.locator('label').filter({ has: page.locator('span', { hasText: new RegExp(`^${caption}`) }) });

/** Fill the invoice form like a person: customer, custom lines, discount, shipping. */
async function makeInvoice(name, customerKey, lines, { discount = 0, shipping = 0 } = {}, expected) {
  let result;
  await step(`invoice: ${name}`, async () => {
    await page.goto(`${BASE}/invoices/new`);
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Customer').selectOption(customers[customerKey].id);
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) await page.getByRole('button', { name: /Add line/ }).click();
      const row = page.locator('div.rounded-lg.border').filter({ has: field(page, 'Type') }).nth(i);
      await field(row, 'Type').locator('select').selectOption('CUSTOM');
      await field(row, 'Description').locator('input').fill(lines[i].name);
      await field(row, 'Qty').locator('input').fill(String(lines[i].qty));
      await field(row, 'Unit price').locator('input').fill(String(lines[i].price));
      await field(row, 'Tax %').locator('input').fill(String(lines[i].tax));
      await field(row, 'HSN/SAC').locator('input').fill(lines[i].hsn);
    }
    if (discount) await field(page, 'Discount').locator('input').fill(String(discount));
    if (shipping) await field(page, 'Shipping').locator('input').fill(String(shipping));
    // The live total on the form must match the hand-worked figure before saving.
    const live = amountOf(await page.locator('dl div', { hasText: /^Total/ }).last().locator('dd').innerText());
    if (Math.abs(live - expected.grandTotal) > 0.005) throw new Error(`form shows total ${live}, expected ${expected.grandTotal}`);
    await page.getByRole('button', { name: 'Save & issue' }).click();
    await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/, { timeout: 15000 });
    const id = page.url().split('/').pop();
    const inv = await apiCall('get', `/invoices/${id}`);
    for (const [k, v] of Object.entries(expected)) {
      if (Math.abs(inv[k] - v) > 0.005) throw new Error(`${k} saved as ${inv[k]}, expected ${v}`);
    }
    if (inv.status !== 'PENDING') throw new Error(`status ${inv.status}, expected PENDING`);
    await page.screenshot({ path: path.join(OUT, `${inv.invoiceNumber.replace(/[^\w-]/g, '_')}.png`), fullPage: true });
    created.push({ scenario: name, number: inv.invoiceNumber, customer: inv.customer.name, total: inv.grandTotal, cgst: inv.cgst, sgst: inv.sgst, igst: inv.igst, id });
    result = { id, number: inv.invoiceNumber };
  });
  return result;
}

const cafe = await makeInvoice(
  'B2B in Goa, two GST rates, 10% discount, shipping (CGST+SGST)',
  'cafe',
  [
    { name: 'Vinyl sticker (die-cut)', qty: 200, price: 15, tax: 12, hsn: '4911' },
    { name: 'A3 art poster', qty: 10, price: 250, tax: 18, hsn: '4911' },
  ],
  { discount: 550, shipping: 100 },
  { subtotal: 5500, taxAmount: 729, cgst: 364.5, sgst: 364.5, igst: 0, grandTotal: 5779 },
);
const mumbai = await makeInvoice(
  'Inter-state to Maharashtra (IGST)',
  'mumbai',
  [{ name: 'Sticker sheet (bulk)', qty: 500, price: 12, tax: 12, hsn: '4911' }],
  { shipping: 250 },
  { subtotal: 6000, igst: 720, cgst: 0, grandTotal: 6970 },
);
const walkin = await makeInvoice(
  'Walk-in customer, odd prices',
  'walkin',
  [{ name: 'Enamel keychain', qty: 3, price: 199, tax: 18, hsn: '7117' }],
  {},
  { subtotal: 597, cgst: 53.73, sgst: 53.73, grandTotal: 704.46 },
);
const mural = await makeInvoice(
  'Large job for Karnataka client (B2C large, IGST)',
  'mural',
  [{ name: 'Hand-painted café mural (design + installation)', qty: 1, price: 120000, tax: 18, hsn: '9983' }],
  {},
  { subtotal: 120000, igst: 21600, grandTotal: 141600 },
);

await step('part payment by UPI, then the rest: invoice becomes Paid', async () => {
  if (!cafe) throw new Error('no café invoice');
  await page.goto(`${BASE}/invoices/${cafe.id}`);
  for (const [amount, method] of [
    ['3000', 'UPI'],
    ['2779', 'BANK_TRANSFER'],
  ]) {
    await page.getByRole('button', { name: /Record payment/ }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await field(dialog, 'Amount').locator('input').fill(amount);
    await field(dialog, 'Method').locator('select').selectOption(method);
    await dialog.getByRole('button', { name: /Record payment|Save/ }).last().click();
    await dialog.waitFor({ state: 'hidden' });
  }
  await page.locator('span.ring-1', { hasText: /^Paid$/ }).first().waitFor({ timeout: 15000 });
});

await step('advance on the mural leaves ₹91,600 due', async () => {
  if (!mural) throw new Error('no mural invoice');
  await apiCall('post', `/invoices/${mural.id}/payments`, { amount: 50000, paymentMethod: 'BANK_TRANSFER' });
  const inv = await apiCall('get', `/invoices/${mural.id}`);
  if (inv.balanceDue !== 91600 || inv.status !== 'PARTIAL') throw new Error(`balance ${inv.balanceDue}, status ${inv.status}`);
});

await step('every invoice PDF downloads and is saved', async () => {
  for (const inv of [cafe, mumbai, walkin, mural].filter(Boolean)) {
    await page.goto(`${BASE}/invoices/${inv.id}`);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Download$/ }).click()]);
    const file = path.join(OUT, download.suggestedFilename());
    await download.saveAs(file);
    const head = fs.readFileSync(file).subarray(0, 5).toString();
    if (head !== '%PDF-') throw new Error(`${file} is not a PDF`);
    const row = created.find((c) => c.id === inv.id);
    if (row) row.pdf = path.basename(file);
  }
});

await step('Email › Gmail opens a filled-in compose window and downloads the PDF to attach', async () => {
  if (!mumbai) throw new Error('no Mumbai invoice');
  await page.goto(`${BASE}/invoices/${mumbai.id}`);
  await page.getByRole('button', { name: /^Email$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: /Gmail/ }).click();
  await field(dialog, 'Send from').locator('input').fill('owner.stixnvibes@gmail.com');
  await page.screenshot({ path: path.join(OUT, 'email-dialog.png') });
  const to = await field(dialog, 'To').locator('input').inputValue();
  if (to !== customers.mumbai.email) throw new Error(`To is "${to}"`);
  const before = composeUrls.length;
  const [popup, download] = await Promise.all([
    context.waitForEvent('page'),
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Open in Gmail' }).click(),
  ]);
  await download.saveAs(path.join(OUT, `gmail-attachment-${download.suggestedFilename()}`));
  await popup.waitForLoadState();
  await page.waitForTimeout(300);
  const url = new URL(composeUrls[before] ?? popup.url());
  const p = url.searchParams;
  if (url.hostname !== 'mail.google.com') throw new Error(`opened ${url.hostname}`);
  if (p.get('authuser') !== 'owner.stixnvibes@gmail.com') throw new Error(`account ${p.get('authuser')}`);
  if (p.get('to') !== customers.mumbai.email) throw new Error(`to ${p.get('to')}`);
  if (!p.get('su')?.includes(mumbai.number)) throw new Error(`subject ${p.get('su')}`);
  const body = p.get('body') ?? '';
  if (!body.includes('/api/portal/') || !body.includes('₹6,970.00')) throw new Error(`body missing PDF link or amount:\n${body}`);
  fs.writeFileSync(path.join(OUT, 'gmail-compose.txt'), `URL: ${url}\n\nTo: ${p.get('to')}\nSubject: ${p.get('su')}\n\n${body}\n`);
  await popup.close();
  // The PDF link in the email works without signing in.
  const link = body.match(/https?:\/\/\S+\/api\/portal\/\S+\/pdf/)?.[0];
  const anon = await browser.newContext();
  const r = await anon.request.get(link);
  if (r.status() !== 200 || !(r.headers()['content-type'] ?? '').includes('pdf')) throw new Error(`PDF link returned ${r.status()}`);
  await anon.close();
});

await step('Email › Outlook works the same way', async () => {
  if (!walkin) throw new Error('no walk-in invoice');
  await page.goto(`${BASE}/invoices/${cafe.id}`);
  await page.getByRole('button', { name: /^Email$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: /Outlook/ }).click();
  await dialog.getByRole('checkbox').uncheck();
  const before = composeUrls.length;
  const [popup] = await Promise.all([context.waitForEvent('page'), dialog.getByRole('button', { name: 'Open in Outlook' }).click()]);
  await popup.waitForLoadState();
  await page.waitForTimeout(300);
  const url = new URL(composeUrls[before] ?? popup.url());
  if (url.hostname !== 'outlook.office.com' || url.searchParams.get('to') !== customers.cafe.email) throw new Error(`opened ${url}`);
  await popup.close();
});

await step('the sent invoices show in the customer activity', async () => {
  const c = await apiCall('get', `/customers/${customers.mumbai.id}`);
  const acts = c.activities ?? c.activity ?? [];
  if (!JSON.stringify(acts).includes('prepared in your mail app')) throw new Error('no "prepared in your mail app" activity found');
});

await step('GST report for this month includes the new invoices', async () => {
  const month = new Date().toISOString().slice(0, 7);
  const r = await apiCall('get', `/reports/gst?month=${month}`);
  const numbers = new Set([...r.b2b, ...r.b2cl].map((x) => x.invoiceNumber));
  if (mural && !r.b2cl.some((x) => x.invoiceNumber === mural.number)) throw new Error('mural invoice is not in B2CL');
  if (cafe && !numbers.has(cafe.number) && !r.b2cs.length) throw new Error('café invoice missing');
});

// --- Online payment with YouPI-PG (a fake gateway that speaks its API) --------------------
const SECRET = 'e2e-webhook-secret';
const sessions = new Map();
const gateway = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/api/v1/payments') {
      const p = JSON.parse(body);
      const paymentId = crypto.randomUUID();
      sessions.set(paymentId, p);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ paymentId, orderId: p.orderId, amount: p.amount, status: 'ACTIVE', checkoutUrl: `/checkout/${paymentId}` }));
    }
    const m = req.url.match(/^\/checkout\/([\w-]+)$/);
    if (m && sessions.has(m[1])) {
      const p = sessions.get(m[1]);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<title>YouPI checkout</title><h1>Pay ₹${p.amount}</h1><p>${p.description}</p><a id="back" href="${p.returnUrl}">Done</a>`);
    }
    res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"NOT_FOUND"}');
  });
});
await new Promise((r) => gateway.listen(0, '127.0.0.1', r));
const gatewayUrl = `http://127.0.0.1:${gateway.address().port}`;
let saved = null;

await step('YouPI: connect the gateway in Settings › Payments', async () => {
  saved = await apiCall('get', '/settings');
  await page.goto(`${BASE}/settings`);
  await page.getByRole('button', { name: 'Payments', exact: true }).click();
  const card = page.locator('section.rounded-xl', { hasText: 'Online payments (YouPI)' }).last();
  await card.getByLabel('Offer online payment').check();
  await field(card, 'Gateway address').locator('input').fill(gatewayUrl);
  await field(card, 'Merchant ID').locator('input').fill('e2e-merchant');
  await field(card, 'Webhook secret').locator('input').fill(SECRET);
  await card.getByRole('button', { name: 'Test connection' }).click();
  await card.getByText(/Connected in \d+ ms/).waitFor({ timeout: 10000 });
  await card.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText('Online payments are on').waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, 'youpi-settings.png'), fullPage: true });
});

let youpiInvoice;
await step('YouPI: customer opens Pay now, pays, and the invoice turns Paid by itself', async () => {
  youpiInvoice = await apiCall('post', '/invoices', { customerId: customers.walkin.id, issue: true, items: [{ name: 'Custom name sticker', quantity: 2, unitPrice: 149, taxRate: 18 }] });
  await page.goto(`${BASE}/invoices/${youpiInvoice.id}`);
  const card = page.locator('section.rounded-xl', { hasText: 'Online payment' }).filter({ has: page.getByRole('button', { name: /Copy Pay now link/ }) });
  await card.waitFor({ timeout: 10000 });
  const { link } = await apiCall('get', `/invoices/${youpiInvoice.id}/online-payments`);
  // The customer, signed out, follows the link from their email.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(link);
  await visitor.waitForURL(`${gatewayUrl}/checkout/**`);
  const heading = await visitor.locator('h1').innerText();
  if (heading !== 'Pay ₹351.64') throw new Error(`checkout shows "${heading}"`);
  // YouPI sees the money and calls the webhook, signed with the shared secret.
  const [paymentId, req] = [...sessions.entries()].at(-1);
  const raw = JSON.stringify({ event: 'SUCCESS', orderId: req.orderId, paymentId, amount: req.amount, amountPaise: Math.round(Number(req.amount) * 100), utr: '512345678901', verificationLevel: 2 });
  const hook = await page.request.post(`${BASE}/api/payments/youpi/webhook`, {
    headers: { 'Content-Type': 'application/json', 'X-Gateway-Signature': `sha256=${crypto.createHmac('sha256', SECRET).update(raw).digest('hex')}`, 'X-Gateway-Event': 'SUCCESS' },
    data: raw,
  });
  if (hook.status() !== 200) throw new Error(`webhook answered ${hook.status()}`);
  // Back to the portal with a thank-you note.
  await visitor.click('#back');
  await visitor.getByText(/Thank you! Your payment for/).waitFor({ timeout: 10000 });
  await visitor.screenshot({ path: path.join(OUT, 'youpi-portal-after-payment.png'), fullPage: true });
  await visitor.context().close();
  await page.reload();
  await page.locator('span.ring-1', { hasText: /^Paid$/ }).first().waitFor({ timeout: 10000 });
  await page.getByText('UTR 512345678901').first().waitFor();
  await page.screenshot({ path: path.join(OUT, 'youpi-invoice-paid.png'), fullPage: true });
  created.push({ scenario: 'Paid online through YouPI (webhook)', number: youpiInvoice.invoiceNumber, customer: customers.walkin.name, total: 351.64, cgst: 26.82, sgst: 26.82, igst: 0, id: youpiInvoice.id });
});

await step('YouPI: a forged webhook is rejected', async () => {
  const r = await page.request.post(`${BASE}/api/payments/youpi/webhook`, { headers: { 'Content-Type': 'application/json', 'X-Gateway-Signature': `sha256=${'ab'.repeat(32)}` }, data: '{"event":"SUCCESS","orderId":"x"}' });
  if (r.status() !== 401) throw new Error(`forged webhook got ${r.status()}`);
});

await step('Settings › Email lists this computer\'s browsers and Chrome profiles', async () => {
  const r = await apiCall('get', '/mail/browsers');
  if (!r.available) throw new Error('browser choice not available on localhost');
  await page.goto(`${BASE}/settings`);
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  const card = page.locator('section.rounded-xl', { hasText: 'Open Gmail in' }).last();
  await card.waitFor();
  const options = await field(card, 'Browser').locator('option').allInnerTexts();
  if (options.length < 2) throw new Error(`no browsers listed (${options.join(', ')})`);
  fs.writeFileSync(path.join(OUT, 'browsers.json'), JSON.stringify(r.browsers.map((b) => ({ name: b.name, profiles: b.profiles.map((p) => `${p.name}${p.email ? ` <${p.email}>` : ''}`) })), null, 2));
  await page.screenshot({ path: path.join(OUT, 'mail-browser-settings.png'), fullPage: true });
});

// Put the payment settings back as they were.
if (saved) await apiCall('put', '/settings', { youpiEnabled: saved.youpiEnabled, youpiApiUrl: saved.youpiApiUrl ?? '', youpiMerchantId: saved.youpiMerchantId ?? '', ...(saved.youpiWebhookSecretSet ? {} : { youpiWebhookSecret: '' }) }).catch(() => undefined);
gateway.close();

// --- Point of sale ------------------------------------------------------------------------
const posTotal = async () => amountOf(await page.getByTestId('pos-total').innerText());

await step('POS: cash sale with change, then a printed receipt', async () => {
  await page.goto(`${BASE}/pos`);
  await page.getByRole('heading', { name: 'Point of sale' }).waitFor();
  const tiles = page.getByTestId('pos-tile').filter({ hasNotText: '/sq ft' });
  await tiles.first().waitFor({ timeout: 10000 });
  await tiles.nth(0).click();
  await tiles.nth(0).click();
  if ((await tiles.count()) > 1) await tiles.nth(1).click();
  const total = await posTotal();
  if (!(total > 0)) throw new Error(`total is ${total}`);
  await page.getByRole('button', { name: 'Cash', exact: true }).click();
  const tender = Math.ceil(total) + 100;
  await page.getByRole('dialog').getByLabel('Cash received').fill(String(tender));
  const shown = amountOf(await page.getByTestId('pos-change').innerText());
  const expected = Math.round((tender - total) * 100) / 100;
  if (Math.abs(shown - expected) > 0.005) throw new Error(`dialog change ${shown}, expected ${expected}`);
  await page.getByRole('button', { name: 'Complete sale' }).click();
  const done = amountOf(await page.getByTestId('pos-done-change').innerText());
  if (Math.abs(done - expected) > 0.005) throw new Error(`change after sale ${done}, expected ${expected}`);
  await page.screenshot({ path: path.join(OUT, 'pos-cash-done.png'), fullPage: true });
  const [receipt] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: /Print receipt/ }).click()]);
  await receipt.waitForLoadState();
  await receipt.getByText('TOTAL', { exact: true }).waitFor({ timeout: 10000 });
  const text = await receipt.locator('.receipt').innerText();
  if (!/TAX INVOICE/.test(text) || !text.includes('cash')) throw new Error(`receipt:\n${text}`);
  await receipt.screenshot({ path: path.join(OUT, 'pos-receipt.png') });
  await receipt.close();
  await page.keyboard.press('Enter'); // New sale
  await page.getByText('Tap items to add them.').waitFor();
});

await step('POS: UPI sale shows the QR and completes', async () => {
  const tiles = page.getByTestId('pos-tile').filter({ hasNotText: '/sq ft' });
  await tiles.nth(0).click();
  await page.getByRole('button', { name: 'UPI', exact: true }).click();
  await page.getByRole('dialog').getByAltText('UPI QR code').waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, 'pos-upi.png'), fullPage: true });
  await page.getByRole('dialog').getByLabel('UPI reference (optional)').fill('612345678901');
  await page.getByRole('button', { name: 'Payment received' }).click();
  await page.getByText(/^Paid · /).waitFor({ timeout: 10000 });
  await page.keyboard.press('Enter');
  const s = await apiCall('get', '/pos/summary');
  if (!(s.sales >= 2) || !(s.byMethod.CASH > 0) || !(s.byMethod.UPI > 0)) throw new Error(`summary ${JSON.stringify(s)}`);
});

// --- GST invoice PDF -----------------------------------------------------------------------
await step('invoice PDF uses the ₹ font and is titled by its GST status', async () => {
  if (!cafe) throw new Error('no café invoice');
  const r = await page.request.get(`${BASE}/api/invoices/${cafe.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  const raw = (await r.body()).toString('latin1');
  if (!raw.includes('NotoSans')) throw new Error('Noto Sans font is not embedded');
  fs.writeFileSync(path.join(OUT, 'tax-invoice.pdf'), await r.body());
});

// --- Connect Gmail (Google is stubbed: nothing is sent to Google) ----------------------------
await step('Connect Gmail sends you to Google with send-only permission, and back', async () => {
  const before = await apiCall('get', '/settings');
  const googleUrls = [];
  await context.route('https://accounts.google.com/**', (route) => {
    googleUrls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Google sign-in stub</title>' });
  });
  try {
    if (!before.googleClientId) await apiCall('put', '/settings', { googleClientId: 'e2e-client.apps.googleusercontent.com', googleClientSecret: 'e2e-secret' });
    await page.goto(`${BASE}/settings?tab=Email`);
    const card = page.locator('section.rounded-xl', { hasText: 'Connect your Gmail' }).first();
    await card.waitFor({ timeout: 10000 });
    await page.screenshot({ path: path.join(OUT, 'gmail-card.png'), fullPage: true });
    if (await card.getByRole('button', { name: 'Connect Gmail' }).count()) {
      await card.getByRole('button', { name: 'Connect Gmail' }).click();
      await page.waitForURL(/accounts\.google\.com/, { timeout: 10000 });
      const u = new URL(googleUrls.at(-1));
      if (!u.searchParams.get('scope')?.includes('https://www.googleapis.com/auth/gmail.send')) throw new Error(`scope ${u.searchParams.get('scope')}`);
      if (u.searchParams.get('redirect_uri') !== `${BASE}/api/google/callback`) throw new Error(`redirect ${u.searchParams.get('redirect_uri')}`);
      if (u.searchParams.get('access_type') !== 'offline') throw new Error('no offline access requested');
    }
    // The person cancels on Google's screen: back on Settings › Email with a message.
    await page.goto(`${BASE}/api/google/callback?error=access_denied`);
    await page.waitForURL(/\/settings\?tab=Email$/, { timeout: 10000 });
    await page.getByText('Google sign-in was cancelled').waitFor({ timeout: 10000 });
  } finally {
    await context.unroute('https://accounts.google.com/**');
    if (!before.googleClientId) await apiCall('put', '/settings', { googleClientId: '', googleClientSecret: '' }).catch(() => undefined);
  }
});

// --- Jobs priced per square foot ------------------------------------------------------------
let sqftProduct;
await step('per sq ft job: 24 × 36 in × 2 copies at ₹80/sq ft on an invoice', async () => {
  sqftProduct = await apiCall('post', '/products', { name: `Custom vinyl sticker [${tag}]`, price: 80, unit: 'sqft', taxRate: 18, hsnCode: '4911' });
  await page.goto(`${BASE}/invoices/new`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Customer').selectOption(customers.cafe.id);
  const row = page.locator('div.rounded-lg.border').filter({ has: field(page, 'Type') }).first();
  await field(row, 'Product').locator('select').selectOption(sqftProduct.id);
  // Picking the product switches the line to sq ft and shows the size calculator.
  await row.getByLabel('Width').fill('24');
  await row.getByLabel('Height').fill('36');
  await row.getByLabel('Size unit').selectOption('in');
  await row.getByLabel('Copies').fill('2');
  const result = await row.getByTestId('size-result').innerText();
  if (!result.includes('12.00 sq ft')) throw new Error(`calculator shows "${result}"`);
  const qty = await field(row, 'Qty').locator('input').inputValue();
  if (qty !== '12') throw new Error(`quantity is ${qty}`);
  const live = amountOf(await page.locator('dl div', { hasText: /^Total/ }).last().locator('dd').innerText());
  if (Math.abs(live - 1132.8) > 0.005) throw new Error(`form total ${live}, expected 1132.80`);
  await page.screenshot({ path: path.join(OUT, 'sqft-invoice-form.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save & issue' }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const inv = await apiCall('get', `/invoices/${page.url().split('/').pop()}`);
  const it = inv.items[0];
  if (it.quantity !== 12 || it.unit !== 'sqft' || it.details !== '24 × 36 in × 2' || inv.grandTotal !== 1132.8) throw new Error(`saved ${JSON.stringify(it)} total ${inv.grandTotal}`);
  await page.getByText('12 sq ft').first().waitFor();
  await page.screenshot({ path: path.join(OUT, 'sqft-invoice.png'), fullPage: true });
  const pdf = await page.request.get(`${BASE}/api/invoices/${inv.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  fs.writeFileSync(path.join(OUT, 'sqft-invoice.pdf'), await pdf.body());
  created.push({ scenario: 'Sticker job 24 × 36 in × 2 = 12 sq ft at ₹80/sq ft', number: inv.invoiceNumber, customer: inv.customer.name, total: inv.grandTotal, cgst: inv.cgst, sgst: inv.sgst, igst: inv.igst, id: inv.id, pdf: 'sqft-invoice.pdf' });
});

await step('per sq ft job at the till: 18 × 12 in = 1.5 sq ft', async () => {
  if (!sqftProduct) throw new Error('no sq ft product');
  await page.goto(`${BASE}/pos`);
  await page.getByLabel('Search products').fill(sqftProduct.name);
  await page.getByTestId('pos-tile').first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Width').fill('18');
  await dialog.getByLabel('Height').fill('12');
  await dialog.getByLabel('Size unit').selectOption('in');
  await dialog.getByLabel('Copies').fill('1');
  const amount = await dialog.getByTestId('measure-amount').innerText();
  if (!amount.includes('1.5 sq ft') || !amount.includes('120.00')) throw new Error(`dialog shows "${amount}"`);
  await dialog.getByRole('button', { name: 'Add to bill' }).click();
  const total = amountOf(await page.getByTestId('pos-total').innerText());
  if (Math.abs(total - 141.6) > 0.005) throw new Error(`till total ${total}, expected 141.60`);
  await page.screenshot({ path: path.join(OUT, 'sqft-pos.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cash', exact: true }).click();
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await page.getByText(/^Paid · /).waitFor({ timeout: 10000 });
  await page.keyboard.press('Enter');
});

await step('small job: 7 × 5 in rounds up to 0.25 sq ft and the ₹150 minimum applies', async () => {
  const settingsNow = await apiCall('get', '/settings');
  const before = settingsNow.areaRoundUp;
  try {
    await page.goto(`${BASE}/settings`);
    await page.getByRole('button', { name: 'Invoicing', exact: true }).click();
    const card = page.locator('section.rounded-xl', { hasText: 'Jobs priced by area' });
    await card.getByLabel('Round area up to').selectOption('0.25');
    await card.getByRole('button', { name: 'Save changes' }).click();
    await page.getByText('Settings saved').waitFor({ timeout: 10000 });
    await page.screenshot({ path: path.join(OUT, 'area-rounding-setting.png'), fullPage: true });

    const small = await apiCall('post', '/products', { name: `Die-cut sticker (min ₹150) [${tag}]`, price: 80, unit: 'sqft', minCharge: 150, taxRate: 18, hsnCode: '4911' });
    await page.goto(`${BASE}/pos`);
    await page.getByLabel('Search products').fill(small.name);
    await page.getByTestId('pos-tile').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Width').fill('7');
    await dialog.getByLabel('Height').fill('5');
    await dialog.getByLabel('Size unit').selectOption('in');
    await dialog.getByLabel('Copies').fill('1');
    const result = await dialog.getByTestId('size-result').innerText();
    if (!result.includes('0.25 sq ft') || !result.includes('rounded up from 0.24')) throw new Error(`calculator shows "${result}"`);
    const amount = await dialog.getByTestId('measure-amount').innerText();
    if (!amount.includes('150.00') || !amount.includes('minimum charge')) throw new Error(`dialog shows "${amount}"`);
    await page.screenshot({ path: path.join(OUT, 'min-charge-pos.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Add to bill' }).click();
    const total = amountOf(await page.getByTestId('pos-total').innerText());
    if (Math.abs(total - 177) > 0.005) throw new Error(`till total ${total}, expected 177.00`);
    await page.getByRole('button', { name: 'Cash', exact: true }).click();
    await page.getByRole('button', { name: 'Complete sale' }).click();
    await page.getByText(/^Paid · /).waitFor({ timeout: 10000 });
    const sale = await apiCall('get', `/invoices/${(await page.locator('a[href^="/invoices/"]').first().getAttribute('href')).split('/').pop()}`);
    const it = sale.items[0];
    if (it.quantity !== 0.25 || it.total !== 150 || it.minCharge !== 150 || sale.grandTotal !== 177) throw new Error(`saved ${JSON.stringify(it)} total ${sale.grandTotal}`);
    await page.keyboard.press('Enter');
  } finally {
    await apiCall('put', '/settings', { areaRoundUp: before }).catch(() => undefined);
  }
});

if (errors.length) problems.push(...errors);
const report = [
  `# Real-world walkthrough (${new Date().toLocaleString('en-IN')})`,
  '',
  `Against ${BASE}. ${passed} steps passed, ${problems.length} problem(s).`,
  '',
  '| Scenario | Invoice | Customer | CGST | SGST | IGST | Total | PDF |',
  '|---|---|---|---|---|---|---|---|',
  ...created.map((c) => `| ${c.scenario} | ${c.number} | ${c.customer} | ${rupees(c.cgst)} | ${rupees(c.sgst)} | ${rupees(c.igst)} | ${rupees(c.total)} | ${c.pdf ?? ''} |`),
  '',
  ...(problems.length ? ['## Problems', '', ...problems.map((p) => `- ${p}`)] : []),
].join('\n');
fs.writeFileSync(path.join(OUT, 'REPORT.md'), report + '\n');
await browser.close();
console.log(`\n${passed} steps passed, ${problems.length} problem(s). Output: ${OUT}`);
for (const p of problems) console.log(`  - ${p}`);
process.exit(problems.length ? 1 : 0);
