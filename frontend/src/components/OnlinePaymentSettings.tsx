import { useEffect, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { Badge, Button, Card, Field, Input, Select } from './ui';
import { useToast } from './toast';
import { useAuth } from '../context/AuthContext';
import { get, http, post, put } from '../lib/api';
import type { Settings } from '../lib/types';

const copy = async (text: string) => {
  await navigator.clipboard.writeText(text);
};

/** Settings › Payments: YouPI-PG, the self-hosted UPI gateway behind "Pay now" links. */
export function YoupiCard({ settings, disabled }: { settings: Settings; disabled: boolean }) {
  const toast = useToast();
  const { refreshSettings } = useAuth();
  const [form, setForm] = useState({
    youpiEnabled: settings.youpiEnabled,
    youpiApiUrl: settings.youpiApiUrl ?? '',
    youpiMerchantId: settings.youpiMerchantId ?? '',
  });
  const [secret, setSecret] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [tested, setTested] = useState<string | null>(null);

  useEffect(() => {
    http
      .get('/settings')
      .then((r) => setWebhookUrl(r.data.meta?.youpiWebhookUrl ?? ''))
      .catch(() => undefined);
  }, []);

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

  const test = () =>
    act('test', async () => {
      setTested(null);
      const r = await post<{ ms: number; webhookSecretSet: boolean }>('/settings/test-youpi', { youpiApiUrl: form.youpiApiUrl, youpiMerchantId: form.youpiMerchantId, youpiWebhookSecret: secret || undefined });
      setTested(`Connected in ${r.ms} ms${r.webhookSecretSet ? '' : '. Add the webhook secret so payments are confirmed automatically.'}`);
    });

  const save = () =>
    act('save', async () => {
      if (form.youpiEnabled && !(secret || settings.youpiWebhookSecretSet)) throw new Error('Add the webhook secret from YouPI, or payments will never be confirmed');
      await put('/settings', { ...form, ...(secret ? { youpiWebhookSecret: secret } : {}) });
      setSecret('');
      await refreshSettings();
      toast.success(form.youpiEnabled ? 'Online payments are on' : 'Saved');
    });

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          Online payments (YouPI) {settings.youpiEnabled ? <Badge tone="green">On</Badge> : <Badge tone="gray">Off</Badge>}
        </span>
      }
    >
      <p className="mb-4 text-sm text-slate-500">
        Adds a <strong>Pay now</strong> link to invoices, emails, WhatsApp messages and the customer portal. Customers pay by UPI on your own{' '}
        <a href="https://github.com/youpi-pg/YouPI-PG" target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
          YouPI-PG
        </a>{' '}
        gateway, and the payment is recorded on the invoice automatically.
      </p>
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800 sm:col-span-2">
          <input type="checkbox" checked={form.youpiEnabled} onChange={(e) => setForm({ ...form, youpiEnabled: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
          Offer online payment
        </label>
        <Field label="Gateway address" hint="Where your YouPI payment API runs, e.g. https://pay.mybusiness.in" className="sm:col-span-2">
          <Input value={form.youpiApiUrl} onChange={(e) => setForm({ ...form, youpiApiUrl: e.target.value })} placeholder="https://pay.mybusiness.in" />
        </Field>
        <Field label="Merchant ID" hint="From YouPI's merchant admin">
          <Input value={form.youpiMerchantId} onChange={(e) => setForm({ ...form, youpiMerchantId: e.target.value })} />
        </Field>
        <Field label="Webhook secret" hint={settings.youpiWebhookSecretSet ? 'Saved. Leave blank to keep it.' : 'From YouPI, used to check payments really came from your gateway'}>
          <Input type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={settings.youpiWebhookSecretSet ? '•••• saved' : ''} />
        </Field>
      </fieldset>
      {webhookUrl && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="mb-1 font-medium text-slate-700">Webhook URL to enter in YouPI</div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-xs text-slate-700">{webhookUrl}</code>
            <Button size="sm" variant="secondary" onClick={() => void copy(webhookUrl).then(() => toast.success('Copied'))}>
              <Copy size={13} /> Copy
            </Button>
          </div>
          {/localhost|127\.0\.0\.1/.test(webhookUrl) && (
            <p className="mt-1 text-xs text-amber-700">YouPI must be able to reach this address. Set your public address in Settings › Business when you go live.</p>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        YouPI is an experimental project: it confirms payments by reading bank SMS/email alerts. Keep using Bank › import to check online payments against your bank statement.
      </p>
      {tested && <p className="mt-2 text-sm text-green-700">{tested}</p>}
      {!disabled && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" loading={busy === 'test'} onClick={() => void test()}>
            Test connection
          </Button>
          <Button loading={busy === 'save'} onClick={() => void save()}>
            Save changes
          </Button>
        </div>
      )}
    </Card>
  );
}

interface Browsers {
  available: boolean;
  browsers: { id: string; name: string; path: string; profiles: { dir: string; name: string; email: string | null }[] }[];
}

/** Settings › Email: open Gmail/Outlook in a chosen browser and profile (InWoice on this computer). */
export function MailBrowserCard({ settings, disabled }: { settings: Settings; disabled: boolean }) {
  const toast = useToast();
  const { refreshSettings } = useAuth();
  const [data, setData] = useState<Browsers | null>(null);
  const [browser, setBrowser] = useState(settings.mailBrowser ?? '');
  const [profile, setProfile] = useState(settings.mailBrowserProfile ?? '');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    get<Browsers>('/mail/browsers')
      .then(setData)
      .catch(() => setData({ available: false, browsers: [] }));
  }, []);

  if (!data) return null;
  const chosen = data.browsers.find((b) => b.id === browser);

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

  return (
    <Card title="Open Gmail in">
      {!data.available ? (
        <p className="text-sm text-slate-500">
          Gmail and Outlook open in this browser. Choosing a different browser or Chrome profile works when InWoice runs on this computer (opened at localhost).
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-500">
            When you email an invoice with Gmail or Outlook, open it in this browser and profile, so it goes from the right account even if you use another browser for InWoice.
          </p>
          <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
            <Field label="Browser">
              <Select
                value={browser}
                onChange={(e) => {
                  setBrowser(e.target.value);
                  setProfile('');
                }}
              >
                <option value="">This browser (where InWoice is open)</option>
                {data.browsers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            {chosen && chosen.profiles.length > 0 && (
              <Field label="Profile (Google account)">
                <Select value={profile} onChange={(e) => setProfile(e.target.value)}>
                  <option value="">Last used profile</option>
                  {chosen.profiles.map((p) => (
                    <option key={p.dir} value={p.dir}>
                      {p.name}
                      {p.email ? ` (${p.email})` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </fieldset>
          {!disabled && (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {settings.mailBrowser && (
                <Button
                  variant="secondary"
                  loading={busy === 'test'}
                  onClick={() =>
                    void run('test', async () => {
                      const r = await post<{ browser: string }>('/mail/open', { url: 'https://mail.google.com/mail/' });
                      toast.success(`Opened Gmail in ${r.browser}`);
                    })
                  }
                >
                  <ExternalLink size={14} /> Try it
                </Button>
              )}
              <Button
                loading={busy === 'save'}
                onClick={() =>
                  void run('save', async () => {
                    await put('/settings', { mailBrowser: browser, mailBrowserProfile: profile });
                    await refreshSettings();
                    toast.success('Saved');
                  })
                }
              >
                Save changes
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
