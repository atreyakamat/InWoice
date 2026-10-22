// Real-browser smoke test for a running InWoice instance.
//
//   npm run e2e                                   (defaults below)
//   BASE_URL=http://my-server:5000 E2E_EMAIL=... E2E_PASSWORD=... npm run e2e
//
// Uses your installed Chrome (or Edge) via playwright-core, so no browser download.
// It visits every page, fails on JS errors / 5xx responses, and runs one full
// sale: create invoice -> issue -> record payment -> PDF, plus a supplier bill,
// an expense and the accounts reports. It creates real data,
// so point it at a demo or staging database (e.g. after `npm run seed`).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const EMAIL = process.env.E2E_EMAIL || 'demo@inwoice.local';
const PASSWORD = process.env.E2E_PASSWORD || 'demo12345';
const SHOTS = path.resolve('e2e/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const PAGES = [
  ['/', 'Hello'],
  ['/quotes', 'Quotes'],
  ['/invoices', 'Invoices'],
  ['/recurring', 'Recurring invoices'],
  ['/customers', 'Customers'],
  ['/reports', 'GST reports'],
  ['/accounts', 'Accounts'],
  ['/bills', 'Bills'],
  ['/expenses', 'Expenses'],
  ['/executive', 'Insights & AI'],
  ['/products', 'Products'],
  ['/packs', 'Packs'],
  ['/fulfillment', 'Fulfillment'],
  ['/inventory', 'Inventory'],
  ['/purchase-orders', 'Purchase Orders'],
  ['/suppliers', 'Suppliers'],
  ['/production', 'Production'],
  ['/events', 'Events'],
  ['/activity', 'Activity log'],
  ['/bank', 'Bank'],
  ['/actions', 'Actions'],
  ['/settings', 'Settings'],
];

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* try next */
    }
  }
  throw new Error('Could not find Chrome or Edge. Install one, or set PLAYWRIGHT executable via channel.');
}

const problems = [];
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

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
const runtimeErrors = [];
page.on('pageerror', (e) => runtimeErrors.push(`JS error: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && runtimeErrors.push(`console: ${m.text()}`));
page.on('response', (r) => r.status() >= 500 && runtimeErrors.push(`HTTP ${r.status()} ${r.url()}`));

console.log(`InWoice smoke test against ${BASE}`);

await step('login', async () => {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: /Hello/ }).waitFor({ timeout: 15000 });
});

for (const [route, heading] of PAGES) {
  await step(`page ${route}`, async () => {
    await page.goto(`${BASE}${route}`);
    await page.getByRole('heading', { level: 1, name: new RegExp(heading.replace(/[&]/g, '.')) }).waitFor({ timeout: 15000 });
    await page.waitForLoadState('networkidle');
    const errorBox = await page.locator('.bg-red-50.border-red-200').count();
    if (errorBox) throw new Error(`error box shown: ${await page.locator('.bg-red-50.border-red-200').first().innerText()}`);
    await page.screenshot({ path: path.join(SHOTS, `${route === '/' ? 'dashboard' : route.slice(1)}.png`), fullPage: true });
  });
}

let invoiceUrl = '';
await step('create & issue invoice via UI', async () => {
  await page.goto(`${BASE}/invoices/new`);
  // Labels wrap their controls, so find the <select> inside the label by its caption.
  const field = (caption) => page.locator('label').filter({ has: page.locator('span', { hasText: new RegExp(`^${caption}`) }) });
  await page.waitForLoadState('networkidle');
  await field('Customer').locator('select').selectOption({ index: 1 });
  await field('Product').first().locator('select').selectOption({ index: 1 });
  await field('Qty').first().locator('input').fill('2');
  await page.getByRole('button', { name: 'Save & issue' }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/, { timeout: 15000 });
  invoiceUrl = page.url();
  await page.locator('span.ring-1', { hasText: /^Pending$/ }).first().waitFor();
  await page.screenshot({ path: path.join(SHOTS, 'invoice-issued.png'), fullPage: true });
});

await step('record full payment via UI', async () => {
  if (!invoiceUrl) throw new Error('no invoice created');
  await page.getByRole('button', { name: /Record payment/ }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('button', { name: /Record payment|Save/ }).last().click();
  // The status badge (not the "Paid" summary row) must switch to Paid.
  await page.locator('span.ring-1', { hasText: /^Paid$/ }).first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(SHOTS, 'invoice-paid.png'), fullPage: true });
});

await step('issue a return credit note via UI', async () => {
  if (!invoiceUrl) throw new Error('no invoice created');
  await page.goto(invoiceUrl);
  await page.getByRole('button', { name: /Credit note/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.locator('input[type="number"]').first().fill('1');
  // The invoice is fully paid, so the preview must flag a refund.
  await dialog.getByText(/is a refund you owe them/).waitFor();
  await dialog.getByRole('button', { name: /Issue credit note/ }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 15000 });
  await page.getByRole('heading', { name: 'Credit notes' }).waitFor();
  await page.screenshot({ path: path.join(SHOTS, 'invoice-credit-note.png'), fullPage: true });
});

await step('GST report reflects the credit note', async () => {
  await page.goto(`${BASE}/reports`);
  await page.waitForLoadState('networkidle');
  const stat = page.locator('div.rounded-xl', { has: page.getByText('Credit notes', { exact: true }) }).first();
  const count = Number((await stat.locator('div.text-2xl').innerText()).trim());
  if (!(count >= 1)) throw new Error(`expected at least one credit note in the report, saw ${count}`);
  await page.getByRole('button', { name: /HSN summary/ }).click();
  await page.getByRole('heading', { name: /HSN-wise summary/ }).waitFor();
  await page.screenshot({ path: path.join(SHOTS, 'reports-hsn.png'), fullPage: true });
});

let quoteUrl = '';
await step('create a quote and convert it to an invoice via UI', async () => {
  await page.goto(`${BASE}/quotes/new`);
  const field = (caption) => page.locator('label').filter({ has: page.locator('span', { hasText: new RegExp(`^${caption}`) }) });
  await page.waitForLoadState('networkidle');
  await field('Customer').locator('select').selectOption({ index: 1 });
  await field('Product').first().locator('select').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Save quote' }).click();
  await page.waitForURL(/\/quotes\/[0-9a-f-]{36}$/, { timeout: 15000 });
  quoteUrl = page.url();
  await page.locator('span.ring-1', { hasText: /^Draft$/ }).first().waitFor();
  await page.getByRole('button', { name: /Accepted/ }).click();
  await page.locator('span.ring-1', { hasText: /^Accepted$/ }).first().waitFor();
  await page.screenshot({ path: path.join(SHOTS, 'quote.png'), fullPage: true });
  await page.getByRole('button', { name: /Convert to invoice/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create invoice' }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await page.locator('span.ring-1', { hasText: /^Draft$/ }).first().waitFor();
});

await step('set up a recurring invoice via UI', async () => {
  await page.goto(`${BASE}/recurring/new`);
  const field = (caption) => page.locator('label').filter({ has: page.locator('span', { hasText: new RegExp(`^${caption}`) }) });
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Schedule name').fill(`E2E retainer ${Date.now()}`);
  await field('Customer').locator('select').selectOption({ index: 1 });
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  await page.getByLabel('Start date').fill(nextMonth.toISOString().slice(0, 10));
  await field('Product').first().locator('select').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Create schedule' }).click();
  await page.waitForURL(/\/recurring$/, { timeout: 15000 });
  await page.getByText(/E2E retainer/).first().waitFor();
  await page.screenshot({ path: path.join(SHOTS, 'recurring.png'), fullPage: true });
});

await step('customer portal: create link and open it signed out', async () => {
  await page.goto(`${BASE}/customers`);
  await page.waitForLoadState('networkidle');
  await page.locator('tbody tr').first().click();
  await page.waitForURL(/\/customers\/[0-9a-f-]{36}$/);
  const create = page.getByRole('button', { name: /Create portal link/ });
  await page.getByText('Customer portal').waitFor();
  await page.waitForLoadState('networkidle');
  if (await create.count()) await create.click();
  const link = page.getByLabel('Portal link');
  await link.waitFor({ timeout: 15000 });
  const url = await link.inputValue();
  await page.getByText('Statement of account').waitFor();
  await page.screenshot({ path: path.join(SHOTS, 'customer-portal-card.png'), fullPage: true });
  const visitor = await browser.newPage({ viewport: { width: 390, height: 844 } });
  visitor.on('pageerror', (e) => runtimeErrors.push(`portal JS error: ${e.message}`));
  await visitor.goto(url.replace(/^https?:\/\/[^/]+/, BASE));
  await visitor.getByText('Amount due').waitFor({ timeout: 15000 });
  await visitor.screenshot({ path: path.join(SHOTS, 'portal-mobile.png'), fullPage: true });
  const overflow = await visitor.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await visitor.close();
  if (overflow > 1) throw new Error(`portal overflows by ${overflow}px on a phone`);
});

await step('forgot-password page works signed out', async () => {
  const visitor = await browser.newPage();
  await visitor.goto(`${BASE}/login`);
  await visitor.getByRole('link', { name: /Forgot your password/ }).click();
  await visitor.getByRole('heading', { name: /Forgot your password/ }).waitFor();
  await visitor.getByLabel('Email').fill('nobody@example.com');
  await visitor.getByRole('button', { name: 'Send reset link' }).click();
  await visitor.getByText(/reset link is on its way|can't send email yet/).waitFor({ timeout: 15000 });
  await visitor.close();
});

let billUrl = '';
await step('record a supplier bill via UI', async () => {
  await page.goto(`${BASE}/bills/new`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Supplier', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Bill number', { exact: true }).fill(`E2E-${Date.now()}`);
  await page.getByLabel('Line 1 description').fill('E2E printing ink');
  await page.getByLabel('Line 1 quantity').fill('2');
  await page.getByLabel('Line 1 unit price').fill('500');
  await page.getByRole('button', { name: 'Save bill' }).click();
  await page.waitForURL(/\/bills\/[0-9a-f-]{36}$/, { timeout: 15000 });
  billUrl = page.url();
  await page.locator('span.ring-1', { hasText: /^Pending$/ }).first().waitFor();
  await page.screenshot({ path: path.join(SHOTS, 'bill-recorded.png'), fullPage: true });
});

await step('pay the supplier bill via UI', async () => {
  if (!billUrl) throw new Error('no bill created');
  await page.getByRole('button', { name: /Record payment/ }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Save payment' }).click();
  await page.locator('span.ring-1', { hasText: /^Paid$/ }).first().waitFor({ timeout: 15000 });
});

await step('issue a debit note against the bill via UI', async () => {
  if (!billUrl) throw new Error('no bill created');
  await page.goto(billUrl);
  await page.getByRole('button', { name: /Debit note/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Reduce the price' }).click();
  await dialog.getByLabel(/Reduction for/).first().fill('10');
  await dialog.getByText(/Total .*11\.80/).waitFor();
  await dialog.getByRole('button', { name: 'Issue debit note' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 15000 });
  await page.getByRole('heading', { name: 'Debit notes' }).waitFor();
  await page.screenshot({ path: path.join(SHOTS, 'bill-debit-note.png'), fullPage: true });
});

await step('import a bank statement via UI', async () => {
  await page.goto(`${BASE}/bank`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /Import statement/ }).first().click();
  const dialog = page.getByRole('dialog');
  const d = new Date();
  const dd = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const unique = (Date.now() % 100000) / 100 + 1000;
  const csv = `Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance\n${dd},E2E BANK CHARGES ${Date.now()},,${unique.toFixed(2)},,100000.00\n`;
  await dialog.getByLabel('Statement file').setInputFiles({ name: 'statement.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await dialog.getByText('First lines as read').waitFor({ timeout: 15000 });
  await dialog.getByRole('button', { name: 'Import' }).click();
  await page.getByText(/Imported 1 line/).waitFor({ timeout: 15000 });
  await page.getByText(/E2E BANK CHARGES/).first().waitFor();
  await page.screenshot({ path: path.join(SHOTS, 'bank.png'), fullPage: true });
});

await step('add an expense via UI', async () => {
  await page.goto(`${BASE}/expenses`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /Add expense/ }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByLabel('Category', { exact: true }).fill('Transport & courier');
  await dialog.getByLabel('Description', { exact: true }).fill('E2E courier');
  await dialog.getByLabel('Amount', { exact: true }).fill('118');
  await dialog.getByLabel('GST rate', { exact: true }).selectOption('18');
  await dialog.getByText(/Before GST .*100\.00/).waitFor();
  await dialog.getByRole('button', { name: 'Add expense' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 15000 });
  await page.getByText('E2E courier').first().waitFor();
  await page.screenshot({ path: path.join(SHOTS, 'expenses.png'), fullPage: true });
});

await step('accounts: profit & loss, GSTR-3B, cash & dues', async () => {
  await page.goto(`${BASE}/accounts`);
  await page.waitForLoadState('networkidle');
  await page.getByText('Net profit', { exact: true }).first().waitFor();
  await page.getByText('Transport & courier').first().waitFor();
  await page.screenshot({ path: path.join(SHOTS, 'accounts-pnl.png'), fullPage: true });
  await page.getByRole('button', { name: 'GSTR-3B' }).click();
  await page.getByText(/GSTR-3B summary/).waitFor();
  await page.getByText('6.1 Tax payable in cash').waitFor();
  await page.screenshot({ path: path.join(SHOTS, 'accounts-gstr3b.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cash & dues' }).click();
  await page.getByText(/You owe suppliers/).first().waitFor();
  await page.getByRole('button', { name: 'TDS', exact: true }).click();
  await page.getByText('TDS deducted by customers').waitFor();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SHOTS, 'accounts-cash.png'), fullPage: true });
});

await step('settings: reminders and backups', async () => {
  await page.goto(`${BASE}/settings`);
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByRole('heading', { name: 'Automatic payment reminders' }).waitFor();
  await page.getByRole('button', { name: 'Invoicing', exact: true }).click();
  await page.getByRole('heading', { name: 'Lock past periods' }).waitFor();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('heading', { name: 'Two-step sign-in' }).waitFor();
  await page.getByRole('button', { name: 'Backups', exact: true }).click();
  await page.getByRole('heading', { name: 'Restore from a backup' }).waitFor();
  await page.getByRole('heading', { name: 'Off-site copies' }).waitFor();
  const backupNow = page.getByRole('button', { name: /Back up now/ });
  if (await backupNow.count()) {
    await backupNow.click();
    await page.getByText(/Backup inwoice-.*saved/).waitFor({ timeout: 15000 });
  }
  await page.screenshot({ path: path.join(SHOTS, 'settings-backups.png'), fullPage: true });
});

await step('a Sales user only sees the sales side', async () => {
  const token = await page.evaluate(() => localStorage.getItem('inwoice_token'));
  const email = `e2e-sales-${Date.now()}@example.com`;
  const created = await page.request.post(`${BASE}/api/auth/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: 'E2E Sales', email, password: 'e2e-password-1', role: 'SALES' },
  });
  if (created.status() !== 201) throw new Error(`could not create user: ${created.status()}`);
  const id = (await created.json()).data.id;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => runtimeErrors.push(`sales-user JS error: ${e.message}`));
  try {
    await p2.goto(`${BASE}/login`);
    await p2.getByLabel('Email').fill(email);
    await p2.getByLabel('Password', { exact: true }).fill('e2e-password-1');
    await p2.getByRole('button', { name: 'Sign in' }).click();
    await p2.getByRole('heading', { name: /Hello/ }).waitFor({ timeout: 15000 });
    const nav = await p2.locator('nav').first().innerText();
    if (!nav.includes('Invoices')) throw new Error('Sales user cannot see Invoices');
    for (const hidden of ['Bills', 'Expenses', 'Profit & Cash', 'Activity log', 'Purchase Orders', 'Actions']) {
      if (nav.includes(hidden)) throw new Error(`Sales user can see ${hidden}`);
    }
    await p2.screenshot({ path: path.join(SHOTS, 'role-sales.png') });
  } finally {
    await ctx.close();
    await page.request.patch(`${BASE}/api/auth/users/${id}`, { headers: { Authorization: `Bearer ${token}` }, data: { isActive: false } });
  }
});

await step('invoice PDF endpoint', async () => {
  const id = invoiceUrl.split('/').pop();
  const token = await page.evaluate(() => localStorage.getItem('inwoice_token'));
  const res = await page.request.get(`${BASE}/api/invoices/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status() !== 200 || !(await res.body()).subarray(0, 4).equals(Buffer.from('%PDF'))) throw new Error(`PDF status ${res.status()}`);
});

await step('mobile layout has no horizontal overflow', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  const wide = [];
  const routes = ['/', '/quotes', '/recurring', '/invoices', '/customers', '/reports', '/accounts', '/bills', '/expenses', '/executive', '/suppliers', '/purchase-orders', '/inventory'];
  for (const route of [...routes, invoiceUrl.replace(BASE, ''), billUrl.replace(BASE, ''), quoteUrl.replace(BASE, '')]) {
    await page.goto(`${BASE}${route}`);
    await page.waitForLoadState('networkidle');
    // The app scrolls inside <main>, so check it as well as the document.
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main');
      return Math.max(document.documentElement.scrollWidth - window.innerWidth, main ? main.scrollWidth - main.clientWidth : 0);
    });
    if (overflow > 1) wide.push(`${route} by ${overflow}px`);
  }
  if (wide.length) throw new Error(`overflow: ${wide.join(', ')}`);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-invoice.png'), fullPage: true });
});

await browser.close();

if (runtimeErrors.length) problems.push(...[...new Set(runtimeErrors)]);
console.log(`\n${passed} checks passed, ${problems.length} problem(s). Screenshots: ${SHOTS}`);
if (problems.length) {
  problems.forEach((p) => console.log(`  - ${p}`));
  process.exit(1);
}
