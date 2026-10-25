import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { Bot, Cloud, Cpu, Download, HardDriveDownload, Lock, Plus, Power, Upload } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, StatusBadge, Table, Td, Textarea, Th } from '../components/ui';
import { useToast } from '../components/toast';
import { OffsiteBackupCard, PeriodLockCard, TwoFactorCard } from '../components/SecuritySettings';
import { useAuth } from '../context/AuthContext';
import { useLoad } from '../lib/useLoad';
import { downloadFile, errorMessage, get, http, patch, post, put } from '../lib/api';
import { dateTime, money } from '../lib/format';
import { cn } from '../lib/utils';
import type { Role, Settings as SettingsT } from '../lib/types';

const TABS = ['Business', 'Invoicing', 'Payments', 'Email', 'Shop', 'AI', 'Team', 'Backups', 'Account'] as const;
type Tab = (typeof TABS)[number];

const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const MODEL_NOTES: Record<string, string> = {
  'claude-opus-5-5': 'Most capable (default)',
  'claude-sonnet-5-5': 'Balanced speed and quality',
  'claude-haiku-5-5': 'Fastest and cheapest',
};

/** Simple string-keyed form state. */
function useForm<T extends Record<string, string>>(initial: T) {
  const [form, setForm] = useState<T>(initial);
  const set = (k: keyof T) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return { form, setForm, set };
}

const s = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));

export default function Settings() {
  const { user, settings, refreshSettings } = useAuth();
  const [tab, setTab] = useState<Tab>('Business');
  const [fresh, setFresh] = useState(false);
  const isAdmin = user?.role === 'ADMIN';

  // Forms initialise from settings once, so load the latest values before rendering them
  // (e.g. the invoice counter advances every time an invoice is created).
  useEffect(() => {
    refreshSettings()
      .catch(() => undefined)
      .finally(() => setFresh(true));
  }, [refreshSettings]);
  if (!fresh) return <Spinner />;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Business details, invoicing, payments, email and reminders, your online shop, AI, your team and backups." />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 sm:inline-flex">
        {TABS.filter((t) => (t !== 'Team' && t !== 'Backups') || isAdmin).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn('whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium', tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
          >
            {t}
          </button>
        ))}
      </div>

      {!isAdmin && tab !== 'Account' && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <Lock size={14} /> Only admins can change these settings. You can view them here.
        </div>
      )}

      {!settings ? (
        <Spinner />
      ) : (
        <div className="max-w-3xl">
          {tab === 'Business' && <BusinessTab settings={settings} disabled={!isAdmin} />}
          {tab === 'Invoicing' && (
            <div className="space-y-4">
              <InvoicingTab settings={settings} disabled={!isAdmin} />
              <PeriodLockCard settings={settings} disabled={!isAdmin} />
            </div>
          )}
          {tab === 'Payments' && <PaymentsTab settings={settings} disabled={!isAdmin} />}
          {tab === 'Email' && <EmailTab settings={settings} disabled={!isAdmin} />}
          {tab === 'Shop' && <ShopTab settings={settings} disabled={!isAdmin} />}
          {tab === 'AI' && <AiTab settings={settings} disabled={!isAdmin} />}
          {tab === 'Team' && isAdmin && <TeamTab />}
          {tab === 'Backups' && isAdmin && <BackupsTab />}
          {tab === 'Account' && <AccountTab />}
        </div>
      )}
    </div>
  );
}

/** Save a subset of settings, refresh the global copy, and toast. */
function useSave() {
  const toast = useToast();
  const { refreshSettings } = useAuth();
  const [saving, setSaving] = useState(false);
  const save = async (fields: Record<string, unknown>, message = 'Settings saved') => {
    setSaving(true);
    try {
      await put('/settings', fields);
      await refreshSettings();
      toast.success(message);
      return true;
    } catch (err) {
      toast.error(err);
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { save, saving };
}

function SaveBar({ onSave, saving, disabled }: { onSave: () => void; saving: boolean; disabled: boolean }) {
  if (disabled) return null;
  return (
    <div className="mt-5 flex justify-end">
      <Button loading={saving} onClick={onSave}>
        Save changes
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BusinessTab({ settings, disabled }: { settings: SettingsT; disabled: boolean }) {
  const toast = useToast();
  const { save, saving } = useSave();
  const { form, setForm, set } = useForm({
    businessName: s(settings.businessName),
    logoUrl: s(settings.logoUrl),
    address: s(settings.address),
    state: s(settings.state),
    phone: s(settings.phone),
    email: s(settings.email),
    website: s(settings.website),
    gstNumber: s(settings.gstNumber),
    appUrl: s(settings.appUrl),
  });

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) return toast.error('Logo must be a PNG or JPEG image');
    if (file.size > 500 * 1024) return toast.error('Logo is too large (max 500 KB)');
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logoUrl: String(reader.result) }));
    reader.onerror = () => toast.error('Could not read that file');
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!form.businessName.trim()) return toast.error('Business name is required');
    void save(form);
  };

  return (
    <Card title="Business profile">
      <div className="mb-5 flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {form.logoUrl ? <img src={form.logoUrl} alt="Logo" className="h-full w-full object-contain" /> : <span className="text-xs text-slate-400">No logo</span>}
        </div>
        {!disabled && (
          <div className="flex flex-col gap-2">
            <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Upload logo
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onLogo} />
            </label>
            {form.logoUrl && (
              <button className="text-left text-xs text-red-600 hover:underline" onClick={() => setForm((f) => ({ ...f, logoUrl: '' }))}>
                Remove
              </button>
            )}
            <span className="text-xs text-slate-500">PNG or JPEG, up to 500 KB. Shown on invoice PDFs.</span>
          </div>
        )}
      </div>
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name *" className="sm:col-span-2">
          <Input value={form.businessName} onChange={set('businessName')} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Textarea value={form.address} onChange={set('address')} />
        </Field>
        <Field label="State" hint="Used for GST: same state as the customer → CGST + SGST, different state → IGST.">
          <Input value={form.state} onChange={set('state')} placeholder="e.g. Goa" />
        </Field>
        <Field label="GSTIN">
          <Input value={form.gstNumber} onChange={set('gstNumber')} placeholder="Optional" />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Website" className="sm:col-span-2">
          <Input value={form.website} onChange={set('website')} placeholder="https://" />
        </Field>
        <Field
          label="InWoice web address"
          className="sm:col-span-2"
          hint="The address customers and staff use to reach this InWoice, e.g. https://billing.mybusiness.in. Used for customer portal and password reset links in emails."
        >
          <Input value={form.appUrl} onChange={set('appUrl')} placeholder={typeof window !== 'undefined' ? window.location.origin : 'https://'} />
        </Field>
      </fieldset>
      <SaveBar onSave={submit} saving={saving} disabled={disabled} />
    </Card>
  );
}

function InvoicingTab({ settings, disabled }: { settings: SettingsT; disabled: boolean }) {
  const toast = useToast();
  const { save, saving } = useSave();
  const { form, set } = useForm({
    currency: s(settings.currency),
    currencySymbol: s(settings.currencySymbol),
    defaultTaxRate: s(settings.defaultTaxRate),
    invoicePrefix: s(settings.invoicePrefix),
    nextInvoiceNumber: s(settings.nextInvoiceNumber),
    creditNotePrefix: s(settings.creditNotePrefix),
    nextCreditNoteNumber: s(settings.nextCreditNoteNumber),
    debitNotePrefix: s(settings.debitNotePrefix),
    quotePrefix: s(settings.quotePrefix),
    nextQuoteNumber: s(settings.nextQuoteNumber),
    quoteValidityDays: s(settings.quoteValidityDays),
    paymentTermsDays: s(settings.paymentTermsDays),
    termsConditions: s(settings.termsConditions),
    thankYouMessage: s(settings.thankYouMessage),
    invoiceFooter: s(settings.invoiceFooter),
  });

  const submit = () => {
    if (!/^[A-Za-z]{3}$/.test(form.currency)) return toast.error('Currency must be a 3-letter code like INR or USD');
    if (!form.currencySymbol.trim()) return toast.error('Currency symbol is required');
    const tax = Number(form.defaultTaxRate);
    const next = Number(form.nextInvoiceNumber);
    const nextCn = Number(form.nextCreditNoteNumber);
    const nextQt = Number(form.nextQuoteNumber);
    const validity = Number(form.quoteValidityDays);
    const terms = Number(form.paymentTermsDays);
    if (!(tax >= 0 && tax <= 100)) return toast.error('Default tax rate must be between 0 and 100');
    if (!(Number.isInteger(next) && next >= 1)) return toast.error('Next invoice number must be a whole number ≥ 1');
    if (!(Number.isInteger(nextCn) && nextCn >= 1)) return toast.error('Next credit note number must be a whole number ≥ 1');
    if (!(Number.isInteger(terms) && terms >= 0)) return toast.error('Payment terms must be a whole number of days');
    if (!(Number.isInteger(nextQt) && nextQt >= 1)) return toast.error('Next quote number must be a whole number ≥ 1');
    if (!(Number.isInteger(validity) && validity >= 1 && validity <= 365)) return toast.error('Quote validity must be between 1 and 365 days');
    // Only send the counter if it was changed here: the server advances it with every
    // invoice, so echoing back the value loaded earlier would roll it back.
    const rest: Partial<typeof form> = { ...form };
    delete rest.nextInvoiceNumber;
    delete rest.nextCreditNoteNumber;
    delete rest.nextQuoteNumber;
    void save({
      ...rest,
      currency: form.currency.toUpperCase(),
      defaultTaxRate: tax,
      ...(next !== settings.nextInvoiceNumber ? { nextInvoiceNumber: next } : {}),
      ...(nextCn !== settings.nextCreditNoteNumber ? { nextCreditNoteNumber: nextCn } : {}),
      ...(nextQt !== settings.nextQuoteNumber ? { nextQuoteNumber: nextQt } : {}),
      quoteValidityDays: validity,
      paymentTermsDays: terms,
    });
  };

  const preview = `${form.invoicePrefix}${String(Number(form.nextInvoiceNumber) || 1).padStart(4, '0')}`;

  return (
    <Card title="Invoicing">
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <Field label="Currency code">
          <Input value={form.currency} onChange={set('currency')} maxLength={3} placeholder="INR" />
        </Field>
        <Field label="Currency symbol">
          <Input value={form.currencySymbol} onChange={set('currencySymbol')} maxLength={4} placeholder="₹" />
        </Field>
        <Field label="Default tax rate (%)" hint="Used when a product has no tax rate of its own. Use 0 if not GST-registered.">
          <Input type="number" min={0} max={100} step="0.01" value={form.defaultTaxRate} onChange={set('defaultTaxRate')} />
        </Field>
        <Field label="Payment terms (days)" hint="Default due date = invoice date + this.">
          <Input type="number" min={0} step={1} value={form.paymentTermsDays} onChange={set('paymentTermsDays')} />
        </Field>
        <Field label="Invoice number prefix">
          <Input value={form.invoicePrefix} onChange={set('invoicePrefix')} maxLength={12} />
        </Field>
        <Field label="Next invoice number" hint={`Next invoice will be ${preview}`}>
          <Input type="number" min={1} step={1} value={form.nextInvoiceNumber} onChange={set('nextInvoiceNumber')} />
        </Field>
        <Field label="Credit note prefix">
          <Input value={form.creditNotePrefix} onChange={set('creditNotePrefix')} maxLength={12} />
        </Field>
        <Field label="Next credit note number" hint={`Next credit note will be ${form.creditNotePrefix}${String(Number(form.nextCreditNoteNumber) || 1).padStart(4, '0')}`}>
          <Input type="number" min={1} step={1} value={form.nextCreditNoteNumber} onChange={set('nextCreditNoteNumber')} />
        </Field>
        <Field label="Debit note prefix" hint="For returns and price reductions to suppliers">
          <Input value={form.debitNotePrefix} onChange={set('debitNotePrefix')} maxLength={12} />
        </Field>
        <Field label="Quote prefix">
          <Input value={form.quotePrefix} onChange={set('quotePrefix')} maxLength={12} />
        </Field>
        <Field label="Next quote number" hint={`Next quote will be ${form.quotePrefix}${String(Number(form.nextQuoteNumber) || 1).padStart(4, '0')}`}>
          <Input type="number" min={1} step={1} value={form.nextQuoteNumber} onChange={set('nextQuoteNumber')} />
        </Field>
        <Field label="Quotes valid for (days)" hint="Default 'valid until' date on new quotes.">
          <Input type="number" min={1} max={365} step={1} value={form.quoteValidityDays} onChange={set('quoteValidityDays')} />
        </Field>
        <Field label="Terms & conditions" className="sm:col-span-2">
          <Textarea value={form.termsConditions} onChange={set('termsConditions')} />
        </Field>
        <Field label="Thank-you message">
          <Input value={form.thankYouMessage} onChange={set('thankYouMessage')} placeholder="Thank you for your business!" />
        </Field>
        <Field label="Footer text">
          <Input value={form.invoiceFooter} onChange={set('invoiceFooter')} />
        </Field>
      </fieldset>
      <SaveBar onSave={submit} saving={saving} disabled={disabled} />
    </Card>
  );
}

function PaymentsTab({ settings, disabled }: { settings: SettingsT; disabled: boolean }) {
  const { save, saving } = useSave();
  const { form, set } = useForm({
    upiId: s(settings.upiId),
    bankName: s(settings.bankName),
    accountNumber: s(settings.accountNumber),
    ifscCode: s(settings.ifscCode),
  });
  return (
    <Card title="Payment details">
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <Field label="UPI ID" className="sm:col-span-2" hint="When set, invoice PDFs include a UPI QR code for the balance due, so customers can scan and pay.">
          <Input value={form.upiId} onChange={set('upiId')} placeholder="yourname@upi" />
        </Field>
        <Field label="Bank name">
          <Input value={form.bankName} onChange={set('bankName')} />
        </Field>
        <Field label="Account number">
          <Input value={form.accountNumber} onChange={set('accountNumber')} />
        </Field>
        <Field label="IFSC code">
          <Input value={form.ifscCode} onChange={set('ifscCode')} />
        </Field>
      </fieldset>
      <SaveBar onSave={() => void save(form)} saving={saving} disabled={disabled} />
    </Card>
  );
}

/** Password input for a stored secret: blank keeps it; "Clear" removes it. */
function SecretField({
  label,
  isSet,
  value,
  onChange,
  cleared,
  onClear,
  disabled,
  hint,
}: {
  label: string;
  isSet: boolean;
  value: string;
  onChange: (v: string) => void;
  cleared: boolean;
  onClear: () => void;
  disabled: boolean;
  hint?: ReactNode;
}) {
  return (
    <Field
      label={label}
      hint={
        <>
          {hint}
          {isSet && !cleared && !disabled && (
            <button type="button" className="ml-1 text-red-600 hover:underline" onClick={onClear}>
              Clear saved value
            </button>
          )}
          {cleared && <span className="ml-1 text-amber-700">Will be removed when you save.</span>}
        </>
      }
    >
      <Input
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isSet && !cleared ? '•••• saved — leave blank to keep' : ''}
        disabled={disabled}
      />
    </Field>
  );
}

function EmailTab({ settings, disabled }: { settings: SettingsT; disabled: boolean }) {
  const toast = useToast();
  const { save, saving } = useSave();
  const { form, set } = useForm({
    smtpHost: s(settings.smtpHost),
    smtpPort: s(settings.smtpPort),
    smtpUsername: s(settings.smtpUsername),
    smtpFrom: s(settings.smtpFrom),
  });
  const [password, setPassword] = useState('');
  const [cleared, setCleared] = useState(false);
  const [testTo, setTestTo] = useState(settings.email ?? '');
  const [testing, setTesting] = useState(false);

  const submit = async () => {
    const fields: Record<string, unknown> = { ...form };
    if (password) fields.smtpPassword = password;
    else if (cleared) fields.smtpPassword = '';
    if (await save(fields)) {
      setPassword('');
      setCleared(false);
    }
  };

  const test = async () => {
    if (!testTo.trim()) return toast.error('Enter an address to send the test to');
    setTesting(true);
    try {
      const res = await http.post('/settings/test-email', { to: testTo.trim() });
      toast.success(res.data.message ?? 'Test email sent');
    } catch (err) {
      toast.error(err);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Outgoing email (SMTP)">
        <p className="mb-4 text-sm text-slate-500">
          Used to email invoices to customers. For Gmail: host <code className="rounded bg-slate-100 px-1">smtp.gmail.com</code>, port{' '}
          <code className="rounded bg-slate-100 px-1">587</code>, your Gmail address as username, and an{' '}
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
            App Password
          </a>{' '}
          (not your normal password).
        </p>
        <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
          <Field label="SMTP host">
            <Input value={form.smtpHost} onChange={set('smtpHost')} placeholder="smtp.gmail.com" />
          </Field>
          <Field label="Port" hint="587 (STARTTLS) or 465 (SSL)">
            <Input value={form.smtpPort} onChange={set('smtpPort')} placeholder="587" />
          </Field>
          <Field label="Username">
            <Input value={form.smtpUsername} onChange={set('smtpUsername')} autoComplete="off" />
          </Field>
          <SecretField
            label="Password"
            isSet={settings.smtpPasswordSet}
            value={password}
            onChange={setPassword}
            cleared={cleared}
            onClear={() => setCleared(true)}
            disabled={disabled}
          />
          <Field label="From address" className="sm:col-span-2" hint="Defaults to the username if blank.">
            <Input value={form.smtpFrom} onChange={set('smtpFrom')} placeholder="billing@yourbusiness.com" />
          </Field>
        </fieldset>
        <SaveBar onSave={() => void submit()} saving={saving} disabled={disabled} />
      </Card>
      {!disabled && (
        <Card title="Send a test email">
          <p className="mb-3 text-sm text-slate-500">Uses the saved settings — save first if you changed anything.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" className="sm:max-w-xs" />
            <Button variant="secondary" loading={testing} onClick={test}>
              Send test
            </Button>
          </div>
        </Card>
      )}
      <RemindersCard settings={settings} disabled={disabled} />
      <StatementsCard settings={settings} disabled={disabled} />
      <OwnerDigestCard settings={settings} disabled={disabled} />
    </div>
  );
}

interface ShopSyncResult {
  skipped: string | null;
  created: string[];
  updated: string[];
  failed: { order: string; error: string }[];
}

function ShopTab({ settings, disabled }: { settings: SettingsT; disabled: boolean }) {
  const toast = useToast();
  const { save, saving } = useSave();
  const { refreshSettings } = useAuth();
  const [enabled, setEnabled] = useState(settings.shopSyncEnabled);
  const [url, setUrl] = useState(s(settings.shopUrl));
  const [token, setToken] = useState('');
  const [cleared, setCleared] = useState(false);
  const [running, setRunning] = useState(false);

  const submit = async () => {
    const fields: Record<string, unknown> = { shopSyncEnabled: enabled, shopUrl: url };
    if (token) fields.shopSyncToken = token;
    else if (cleared) fields.shopSyncToken = '';
    if (await save(fields, enabled ? 'Shop sync is on' : 'Saved')) {
      setToken('');
      setCleared(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const r = await post<ShopSyncResult>('/settings/shop-sync/run');
      await refreshSettings();
      if (r.skipped) toast.error(r.skipped);
      else if (r.failed.length) toast.error(r.failed.map((f) => (f.order ? `${f.order}: ${f.error}` : f.error)).join('; '));
      else if (r.created.length || r.updated.length) toast.success(`${r.created.length} new order${r.created.length === 1 ? '' : 's'}, ${r.updated.length} updated`);
      else toast.success('Up to date: no new orders');
    } catch (err) {
      toast.error(err);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card title="Online shop">
      <p className="mb-4 text-sm text-slate-500">
        Every 30 minutes InWoice reads changed orders from your shop. Once you confirm an order in the shop, it adds or matches the customer (by
        mobile number) and becomes an issued invoice; unconfirmed orders are ignored, so spam never uses up invoice numbers. Marking it paid records a
        UPI payment, and cancelling it cancels the invoice. If this server is off for a while, it catches up when it&apos;s back.
      </p>
      <fieldset disabled={disabled} className="grid gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Sync orders from the shop
        </label>
        <Field label="Shop address">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://shop.stixnvibes.com" />
        </Field>
        <SecretField
          label="Sync token"
          hint="The same value as INWOICE_SYNC_TOKEN in the shop's settings on Netlify."
          isSet={settings.shopSyncTokenSet}
          value={token}
          onChange={setToken}
          cleared={cleared}
          onClear={() => setCleared(true)}
          disabled={disabled}
        />
      </fieldset>
      <p className="mt-4 text-sm text-slate-500">
        Last sync: {settings.shopSyncLastAt ? dateTime(settings.shopSyncLastAt) : 'never'}
        {settings.shopSyncLastError && <span className="mt-1 block text-red-600">{settings.shopSyncLastError}</span>}
      </p>
      {!disabled && (
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" loading={running} onClick={() => void runNow()} disabled={!settings.shopUrl || !settings.shopSyncTokenSet}>
            Sync now
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            Save changes
          </Button>
        </div>
      )}
    </Card>
  );
}

interface ReminderPreview {
  enabled: boolean;
  emailConfigured: boolean;
  due: { id: string; invoiceNumber: string; customer: string; email: string; balance: number; daysFromDue: number }[];
}

const describeDay = (d: number) => (d < 0 ? `${-d} day${d === -1 ? '' : 's'} before` : d === 0 ? 'on' : `${d} day${d === 1 ? '' : 's'} after`);

function RemindersCard({ settings, disabled }: { settings: SettingsT; disabled: boolean }) {
  const toast = useToast();
  const { save, saving } = useSave();
  const [enabled, setEnabled] = useState(settings.remindersEnabled);
  const [days, setDays] = useState(settings.reminderDays);
  const [running, setRunning] = useState(false);
  const preview = useLoad(() => get<ReminderPreview>('/settings/reminders/preview'), []);

  const list = days.split(',').map((x) => x.trim()).filter(Boolean).map(Number);
  const schedule = list.length && list.every(Number.isInteger) ? [...new Set(list)].sort((a, b) => a - b).map(describeDay).join(', ') : '';

  const submit = async () => {
    if (await save({ remindersEnabled: enabled, reminderDays: days }, enabled ? 'Automatic reminders are on' : 'Reminder settings saved')) void preview.reload();
  };
  const runNow = async () => {
    setRunning(true);
    try {
      const r = await post<{ skipped: string | null; sent: string[]; failed: { invoiceNumber: string; error: string }[] }>('/settings/reminders/run');
      if (r.skipped) toast.error(r.skipped);
      else if (r.failed.length) toast.error(`Sent ${r.sent.length}, failed ${r.failed.length}: ${r.failed[0]!.error}`);
      else toast.success(r.sent.length ? `Sent ${r.sent.length} reminder${r.sent.length === 1 ? '' : 's'}` : 'No reminders are due right now');
      void preview.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card title="Automatic payment reminders">
      <p className="mb-4 text-sm text-slate-500">
        InWoice emails customers with unpaid invoices on a schedule, attaching the invoice PDF with your UPI QR code. Each reminder goes out once
        per invoice and nobody gets more than one email a day. Customers without an email address are skipped (use WhatsApp from the invoice).
      </p>
      <fieldset disabled={disabled} className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Send reminders automatically
        </label>
        <Field
          label="When to remind (days from the due date)"
          hint={schedule ? `Reminders go out ${schedule} the due date.` : 'Comma-separated whole numbers, e.g. -1,3,7,15 (negative = before the due date).'}
        >
          <Input value={days} onChange={(e) => setDays(e.target.value)} placeholder="-1,3,7,15" className="sm:max-w-xs" />
        </Field>
      </fieldset>
      {preview.data && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
          {!preview.data.emailConfigured ? (
            <p className="text-amber-700">Set up outgoing email above first. Reminders need it.</p>
          ) : preview.data.due.length === 0 ? (
            <p className="text-slate-600">No invoices are due a reminder right now.</p>
          ) : (
            <>
              <p className="mb-1 font-medium text-slate-700">
                {preview.data.due.length} invoice{preview.data.due.length === 1 ? ' is' : 's are'} due a reminder now:
              </p>
              <ul className="space-y-0.5 text-slate-600">
                {preview.data.due.slice(0, 8).map((d) => (
                  <li key={d.id}>
                    {d.invoiceNumber} · {d.customer} · {money(d.balance)} ·{' '}
                    {d.daysFromDue > 0 ? `${d.daysFromDue} days overdue` : d.daysFromDue === 0 ? 'due today' : `due in ${-d.daysFromDue} day(s)`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {!disabled && (
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" loading={running} onClick={() => void runNow()} disabled={!settings.remindersEnabled}>
            Send due reminders now
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            Save changes
          </Button>
        </div>
      )}
    </Card>
  );
}

function StatementsCard({ settings, disabled }: { settings: SettingsT; disabled: boolean }) {
  const toast = useToast();
  const { save, saving } = useSave();
  const [enabled, setEnabled] = useState(settings.statementsEnabled);
  const [running, setRunning] = useState(false);
  const runNow = async () => {
    setRunning(true);
    try {
      const r = await post<{ skipped: string | null; sent: string[]; failed: unknown[] }>('/settings/statements/run');
      if (r.skipped) toast.error(r.skipped);
      else toast.success(r.sent.length ? `Sent ${r.sent.length} statement${r.sent.length === 1 ? '' : 's'}` : 'Every customer who owes money already got this month\'s statement');
    } catch (err) {
      toast.error(err);
    } finally {
      setRunning(false);
    }
  };
  return (
    <Card title="Monthly statements">
      <p className="mb-4 text-sm text-slate-500">
        On the 1st of each month, every customer who still owes you money gets last month&apos;s statement of account by email, with a UPI QR code for
        the amount due and a link to their portal. Each customer gets at most one a month.
      </p>
      <fieldset disabled={disabled}>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Email monthly statements automatically
        </label>
      </fieldset>
      {!disabled && (
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" loading={running} onClick={() => void runNow()} disabled={!settings.statementsEnabled}>
            Send this month&apos;s now
          </Button>
          <Button loading={saving} onClick={() => void save({ statementsEnabled: enabled }, enabled ? 'Monthly statements are on' : 'Saved')}>
            Save changes
          </Button>
        </div>
      )}
    </Card>
  );
}

function OwnerDigestCard({ settings, disabled }: { settings: SettingsT; disabled: boolean }) {
  const toast = useToast();
  const { save, saving } = useSave();
  const [enabled, setEnabled] = useState(settings.ownerDigestEnabled);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card title="Monthly summary for owners">
      <p className="mb-4 text-sm text-slate-500">
        On the 1st of each month every admin gets last month&apos;s sales, profit, cash, GST to pay and who to chase, by email. With AI on, it starts with a
        short note on what matters most.
      </p>
      <fieldset disabled={disabled}>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Email the monthly summary
        </label>
      </fieldset>
      {preview && <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{preview}</pre>}
      {!disabled && (
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" loading={busy === 'preview'} onClick={() => void act('preview', async () => setPreview((await get<{ text: string }>('/actions/digest/preview')).text))}>
            Preview
          </Button>
          <Button
            variant="secondary"
            loading={busy === 'send'}
            onClick={() =>
              void act('send', async () => {
                const r = await post<{ skipped: string | null; sent: string[] }>('/actions/digest/send');
                if (r.skipped) toast.error(r.skipped);
                else toast.success(`Sent to ${r.sent.join(', ')}`);
              })
            }
          >
            Send now
          </Button>
          <Button loading={saving} onClick={() => void save({ ownerDigestEnabled: enabled }, enabled ? 'Monthly summary is on' : 'Saved')}>
            Save changes
          </Button>
        </div>
      )}
    </Card>
  );
}

function AiTab({ settings, disabled }: { settings: SettingsT; disabled: boolean }) {
  const toast = useToast();
  const { save, saving } = useSave();
  const [provider, setProvider] = useState<SettingsT['aiProvider']>(settings.aiProvider);
  const [model, setModel] = useState(settings.aiModel ?? '');
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollamaUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [cleared, setCleared] = useState(false);
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ reply: string; provider: string; model: string; ms: number } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    http
      .get('/settings')
      .then((res) => {
        const list = res.data?.meta?.claudeModels;
        if (Array.isArray(list) && list.length) setModels(list as string[]);
      })
      .catch(() => undefined);
  }, []);

  // Model field means different things per provider; reset to a sensible value when switching.
  const choose = (p: SettingsT['aiProvider']) => {
    setProvider(p);
    setResult(null);
    setTestError(null);
    if (p === settings.aiProvider) setModel(settings.aiModel ?? '');
    else if (p === 'ANTHROPIC') setModel(models[0] ?? FALLBACK_MODELS[0]!);
    else if (p === 'OLLAMA') setModel('');
  };

  const claudeModel = model && models.includes(model) ? model : models[0] ?? FALLBACK_MODELS[0]!;

  const payload = () => {
    const body: Record<string, unknown> = {
      aiProvider: provider,
      aiModel: provider === 'ANTHROPIC' ? claudeModel : provider === 'OLLAMA' ? model : '',
      ollamaUrl,
    };
    if (apiKey) body.aiApiKey = apiKey;
    return body;
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    setTestError(null);
    try {
      setResult(await post('/settings/test-ai', payload()));
    } catch (err) {
      setTestError(errorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  const submit = async () => {
    if (provider === 'ANTHROPIC' && !apiKey && (!settings.aiApiKeySet || cleared)) {
      return toast.error('Enter a Claude API key');
    }
    const body = payload();
    if (!apiKey && cleared) body.aiApiKey = '';
    if (await save(body, 'AI settings saved')) {
      setApiKey('');
      setCleared(false);
    }
  };

  const options: { id: SettingsT['aiProvider']; title: string; icon: typeof Power; text: string }[] = [
    { id: 'NONE', title: 'Off', icon: Power, text: 'No AI. Dashboards, health scores, risks and forecasts still work using built-in rules.' },
    { id: 'ANTHROPIC', title: 'Claude (cloud)', icon: Cloud, text: 'Best quality. Needs an API key from console.anthropic.com. Uses no local compute.' },
    { id: 'OLLAMA', title: 'Local AI (Ollama)', icon: Cpu, text: 'Private and offline. Runs on your own CPU — choose a small model on older machines.' },
  ];

  return (
    <div className="space-y-4">
      <Card title="AI assistant">
        <p className="mb-4 text-sm text-slate-500">
          AI writes the daily briefing and answers questions about your business on the Insights page. Everything else works without it.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              onClick={() => choose(o.id)}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed',
                provider === o.id ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 bg-white hover:border-slate-300',
              )}
            >
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <o.icon size={16} className={provider === o.id ? 'text-brand-600' : 'text-slate-400'} /> {o.title}
              </div>
              <p className="mt-1 text-xs text-slate-500">{o.text}</p>
            </button>
          ))}
        </div>

        {provider === 'ANTHROPIC' && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Model" hint={MODEL_NOTES[claudeModel]}>
              <Select value={claudeModel} onChange={(e) => setModel(e.target.value)} disabled={disabled}>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                    {MODEL_NOTES[m] ? ` — ${MODEL_NOTES[m]}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <SecretField
              label="Claude API key"
              isSet={settings.aiApiKeySet}
              value={apiKey}
              onChange={setApiKey}
              cleared={cleared}
              onClear={() => setCleared(true)}
              disabled={disabled}
              hint={
                <>
                  Create one at{' '}
                  <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                    console.anthropic.com
                  </a>
                  . Stored on your server, never shown again.
                </>
              }
            />
          </div>
        )}

        {provider === 'OLLAMA' && (
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ollama URL">
                <Input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} placeholder="http://localhost:11434" disabled={disabled} />
              </Field>
              <Field label="Model">
                <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen2.5:1.5b" disabled={disabled} />
              </Field>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              Install Ollama from{' '}
              <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                ollama.com
              </a>
              , then run <code className="rounded bg-white px-1">ollama pull qwen2.5:1.5b</code>. On older CPUs prefer small models like{' '}
              <code className="rounded bg-white px-1">qwen2.5:1.5b</code> or <code className="rounded bg-white px-1">llama3.2:1b</code>; replies may take
              10–60 seconds.
            </div>
          </div>
        )}

        {(result || testError) && (
          <div
            className={cn(
              'mt-4 rounded-lg border px-3 py-2.5 text-sm',
              result ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700',
            )}
          >
            {result ? (
              <>
                <div className="flex items-center gap-2 font-medium">
                  <Bot size={14} /> Connected — {result.provider} / {result.model} ({(result.ms / 1000).toFixed(1)}s)
                </div>
                <div className="mt-1 text-emerald-700">“{result.reply}”</div>
              </>
            ) : (
              testError
            )}
          </div>
        )}

        {!disabled && (
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {provider !== 'NONE' && (
              <Button variant="secondary" loading={testing} onClick={test}>
                Test connection
              </Button>
            )}
            <Button loading={saving} onClick={() => void submit()}>
              Save changes
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_OPTIONS: { value: Role; label: string; help: string }[] = [
  { value: 'ADMIN', label: 'Admin', help: 'Everything, including settings, team and backups' },
  { value: 'STAFF', label: 'Staff', help: 'All day-to-day work, no settings' },
  { value: 'SALES', label: 'Sales', help: 'Customers, quotes, invoices and payments' },
  { value: 'STORES', label: 'Stores', help: 'Stock, purchase orders, suppliers, production, dispatch' },
  { value: 'ACCOUNTANT', label: 'Accountant', help: 'Sees everything, enters bills and expenses' },
];

function TeamTab() {
  const toast = useToast();
  const { user: me } = useAuth();
  const { data: users, loading, error, reload } = useLoad(() => get<TeamUser[]>('/auth/users'));
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const update = async (u: TeamUser, fields: Partial<Pick<TeamUser, 'role' | 'isActive'>> & { resetTwoFactor?: boolean }) => {
    setBusy(u.id);
    try {
      await patch(`/auth/users/${u.id}`, fields);
      toast.success('User updated');
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title="Team"
      actions={
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus size={14} /> Add user
        </Button>
      }
      bodyClassName="p-0"
    >
      <ul className="space-y-0.5 px-4 pt-3 text-sm text-slate-500">
        {ROLE_OPTIONS.map((r) => (
          <li key={r.value}>
            <span className="font-medium text-slate-700">{r.label}:</span> {r.help}
          </li>
        ))}
      </ul>
      {loading && !users ? (
        <Spinner />
      ) : error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : !users?.length ? (
        <EmptyState title="No users" />
      ) : (
        <div className="mt-3">
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Last sign-in</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <Td>
                      <div className="font-medium text-slate-900">
                        {u.name} {self && <Badge tone="indigo">You</Badge>}
                      </div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </Td>
                    <Td>
                      <Select
                        value={u.role}
                        disabled={self || busy === u.id}
                        onChange={(e) => update(u, { role: e.target.value as TeamUser['role'] })}
                        className="w-32 py-1"
                        aria-label={`Role for ${u.name}`}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={u.isActive ? 'ACTIVE' : 'INACTIVE'} />
                        {u.totpEnabled && <Badge tone="green">2-step</Badge>}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{u.lastLoginAt ? dateTime(u.lastLoginAt) : <span className="text-slate-400">Never</span>}</Td>
                    <Td className="whitespace-nowrap text-right">
                      {!self && u.totpEnabled && (
                        <Button size="sm" variant="ghost" loading={busy === u.id} onClick={() => update(u, { resetTwoFactor: true })} title="For a lost phone: they can sign in with just the password and set it up again">
                          Reset 2-step
                        </Button>
                      )}
                      {!self && (
                        <Button size="sm" variant="secondary" loading={busy === u.id} onClick={() => update(u, { isActive: !u.isActive })}>
                          {u.isActive ? 'Disable' : 'Enable'}
                        </Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}
      {adding && (
        <AddUserModal
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}
    </Card>
  );
}

function AddUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { form, set } = useForm({ name: '', email: '', password: '', role: 'STAFF' });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (form.name.trim().length < 2) return toast.error('Name is required');
    if (!form.email.includes('@')) return toast.error('Enter a valid email');
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters');
    setSaving(true);
    try {
      await post('/auth/users', form);
      toast.success(`${form.name} added`);
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add team member"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={submit}>
            Add user
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input value={form.name} onChange={set('name')} autoFocus />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Temporary password" hint="At least 8 characters. Ask them to change it after signing in.">
          <Input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        <Field label="Role">
          <Select value={form.role} onChange={set('role')}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function AccountTab() {
  const toast = useToast();
  const { user, setToken } = useAuth();
  const { form, setForm, set } = useForm({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.currentPassword) return toast.error('Enter your current password');
    if (form.newPassword.length < 8) return toast.error('New password must be at least 8 characters');
    if (form.newPassword !== form.confirm) return toast.error('New passwords do not match');
    setSaving(true);
    try {
      const res = await http.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      // Other devices are signed out; keep this one signed in with the new token.
      if (res.data.token) setToken(res.data.token);
      toast.success(res.data.message ?? 'Password updated');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Your account">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">Name</dt>
            <dd className="font-medium">{user?.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Email</dt>
            <dd className="font-medium">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Role</dt>
            <dd>
              <Badge tone={user?.role === 'ADMIN' ? 'indigo' : 'gray'}>{ROLE_OPTIONS.find((r) => r.value === user?.role)?.label ?? user?.role}</Badge>
            </dd>
          </div>
        </dl>
      </Card>
      <Card title="Change password">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password" className="sm:col-span-2">
            <Input type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} className="sm:max-w-xs" />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <Input type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <Button loading={saving} onClick={submit}>
            Update password
          </Button>
        </div>
      </Card>
      <TwoFactorCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

interface BackupInfo {
  enabled: boolean;
  directory: string | null;
  keep: number;
  files: { name: string; size: number; createdAt: string }[];
  offsite: { configured: boolean; lastAt: string | null; lastError: string | null };
}

const fileSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function BackupsTab() {
  const toast = useToast();
  const { settings } = useAuth();
  const { data, loading, error, reload } = useLoad(() => get<BackupInfo>('/backups'), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };

  const backupNow = () =>
    run('now', async () => {
      const b = await post<{ name: string }>('/backups');
      toast.success(`Backup ${b.name} saved`);
      await reload();
    });

  const restore = () =>
    run('restore', async () => {
      if (!file) return;
      const res = await http.post('/backups/restore?confirm=REPLACE', file, { headers: { 'Content-Type': 'application/octet-stream' }, timeout: 600_000 });
      const rows = Object.values(res.data.data.rows as Record<string, number>).reduce((a, b) => a + b, 0);
      toast.success(`Restored ${rows} records. Reloading…`);
      setTimeout(() => window.location.assign('/'), 1500);
    });

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Spinner />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card
        title="Backups"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'download'}
              onClick={() => run('download', () => downloadFile('/backups/export', `inwoice-export-${new Date().toISOString().slice(0, 10)}.json.gz`))}
            >
              <Download size={14} /> Download a copy
            </Button>
            {data.enabled && (
              <Button size="sm" loading={busy === 'now'} onClick={() => void backupNow()}>
                <HardDriveDownload size={14} /> Back up now
              </Button>
            )}
          </div>
        }
        bodyClassName="p-0"
      >
        <p className="px-4 pt-4 text-sm text-slate-500">
          {data.enabled ? (
            <>
              All your data is backed up automatically once a day on the server, in <code className="rounded bg-slate-100 px-1">{data.directory}</code>,
              keeping the last {data.keep}. Keep a copy <b>off the server</b> too: download one regularly, or sync that folder to Google Drive or S3
              (see the deployment guide).
            </>
          ) : (
            <>Automatic backups to disk are switched off on this server (BACKUP_DIR=off). Use “Download a copy” to keep your own backups.</>
          )}
        </p>
        {data.files.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No backups on the server yet.</p>
        ) : (
          <div className="mt-3">
            <Table>
              <thead>
                <tr>
                  <Th>Backup</Th>
                  <Th>Saved</Th>
                  <Th className="text-right">Size</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.files.map((f) => (
                  <tr key={f.name}>
                    <Td className="font-mono text-xs">
                      {f.name} {f.name.includes('-manual') && <Badge>Manual</Badge>}
                    </Td>
                    <Td className="whitespace-nowrap">{dateTime(f.createdAt)}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{fileSize(f.size)}</Td>
                    <Td className="text-right">
                      <button
                        onClick={() => run(f.name, () => downloadFile(`/backups/files/${f.name}`, f.name))}
                        disabled={busy === f.name}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                        aria-label={`Download ${f.name}`}
                        title="Download"
                      >
                        <Download size={15} />
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <Card title="Restore from a backup">
        <p className="mb-3 text-sm text-slate-500">
          Replaces <b>all</b> current data with a backup file, for example when moving to a new server. A safety backup of the current data is saved
          first (when disk backups are on). Afterwards, sign in with an account from the backup.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Backup file (.json.gz)">
            <Input type="file" accept=".gz,.json,application/gzip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Field label='Type "REPLACE" to confirm'>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="REPLACE" autoComplete="off" />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="danger" disabled={!file || confirmText !== 'REPLACE'} loading={busy === 'restore'} onClick={() => void restore()}>
            <Upload size={15} /> Replace all data
          </Button>
        </div>
      </Card>
      {settings && <OffsiteBackupCard settings={settings} status={data.offsite} onChange={() => void reload()} />}
    </div>
  );
}
