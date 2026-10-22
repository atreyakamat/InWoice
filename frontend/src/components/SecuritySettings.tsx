import { useState, type ChangeEvent } from 'react';
import { Cloud, KeyRound, Lock, ShieldCheck, Unlock } from 'lucide-react';
import { Badge, Button, Card, Field, Input } from './ui';
import { useToast } from './toast';
import { useAuth } from '../context/AuthContext';
import { http, post, put } from '../lib/api';
import { date, dateTime, isoDate } from '../lib/format';
import type { Settings } from '../lib/types';

/** Two-factor sign-in for the current user: set up with an authenticator app, or turn off. */
export function TwoFactorCard() {
  const toast = useToast();
  const { user, refreshUser } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  if (codes) {
    return (
      <Card title="Save your recovery codes">
        <p className="mb-3 text-sm text-slate-600">
          If you lose your phone, each of these codes lets you sign in once. Store them somewhere safe (a password manager, or printed). They won&apos;t be shown
          again.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 font-mono text-sm sm:grid-cols-4">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(codes.join('\n'));
                toast.success('Codes copied');
              } catch {
                toast.error('Copy them by hand');
              }
            }}
          >
            Copy
          </Button>
          <Button onClick={() => setCodes(null)}>I&apos;ve saved them</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Two-step sign-in">
      {user?.totpEnabled ? (
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2 text-emerald-700">
            <ShieldCheck size={16} /> On. You&apos;ll be asked for a code from your authenticator app when you sign in.
          </p>
          {typeof user.recoveryCodesLeft === 'number' && (
            <p className={user.recoveryCodesLeft <= 2 ? 'text-amber-700' : 'text-slate-500'}>{user.recoveryCodesLeft} recovery codes left.</p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Your password" className="w-full sm:w-64">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button
              variant="secondary"
              loading={busy}
              onClick={() =>
                run(async () => {
                  await post('/auth/2fa/disable', { password });
                  setPassword('');
                  await refreshUser();
                  toast.success('Two-step sign-in is off');
                })
              }
            >
              Turn off
            </Button>
          </div>
        </div>
      ) : setup ? (
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            Scan this with Google Authenticator, Microsoft Authenticator, Authy or any authenticator app, then enter the 6-digit code it shows.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <img src={setup.qr} alt="QR code for your authenticator app" className="h-44 w-44 rounded-lg border border-slate-200" />
            <div className="space-y-2">
              <p className="text-xs text-slate-500">Can&apos;t scan? Enter this key in the app:</p>
              <code className="block break-all rounded bg-slate-50 px-2 py-1 text-xs">{setup.secret}</code>
              <Field label="Code from the app">
                <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className="w-40" />
              </Field>
              <Button
                loading={busy}
                onClick={() =>
                  run(async () => {
                    const res = await http.post('/auth/2fa/enable', { code });
                    setCodes(res.data.data.recoveryCodes);
                    setSetup(null);
                    setCode('');
                    await refreshUser();
                    toast.success('Two-step sign-in is on');
                  })
                }
              >
                Turn on
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-slate-600">
          <p>Protect your account with a code from your phone as well as your password. Recommended for owners and anyone who handles money.</p>
          <Button loading={busy} onClick={() => run(async () => setSetup((await http.post('/auth/2fa/setup')).data.data))}>
            <KeyRound size={15} /> Set up
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Lock a period (e.g. after filing GST) so nothing dated in it can change. */
export function PeriodLockCard({ settings, disabled }: { settings: Settings; disabled: boolean }) {
  const toast = useToast();
  const { refreshSettings } = useAuth();
  const [until, setUntil] = useState(isoDate(settings.lockedUntil));
  const [busy, setBusy] = useState(false);
  const lastMonthEnd = () => {
    const d = new Date();
    return isoDate(new Date(d.getFullYear(), d.getMonth(), 0));
  };
  const save = async (value: string) => {
    setBusy(true);
    try {
      await put('/settings', { lockedUntil: value });
      await refreshSettings();
      setUntil(value);
      toast.success(value ? `Locked up to ${date(value)}` : 'Unlocked');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Lock past periods">
      <p className="mb-4 text-sm text-slate-500">
        Once a month&apos;s GST return is filed, lock it: invoices, payments, credit notes, bills and expenses dated on or before the lock date can no longer
        be created, edited or cancelled. Payments received today on old invoices still work.
      </p>
      <div className="mb-3 text-sm">
        {settings.lockedUntil ? (
          <Badge tone="amber">
            <Lock size={12} className="mr-1" /> Locked up to {date(settings.lockedUntil)}
          </Badge>
        ) : (
          <Badge tone="gray">Nothing is locked</Badge>
        )}
      </div>
      <fieldset disabled={disabled} className="flex flex-wrap items-end gap-2">
        <Field label="Lock everything up to and including">
          <Input type="date" value={until} max={isoDate(new Date())} onChange={(e) => setUntil(e.target.value)} className="w-48" aria-label="Lock date" />
        </Field>
        <Button variant="secondary" onClick={() => setUntil(lastMonthEnd())}>
          End of last month
        </Button>
        <Button loading={busy} onClick={() => void save(until)} disabled={!until}>
          <Lock size={14} /> Lock
        </Button>
        {settings.lockedUntil && (
          <Button variant="ghost" loading={busy} onClick={() => void save('')}>
            <Unlock size={14} /> Unlock
          </Button>
        )}
      </fieldset>
    </Card>
  );
}

/** Off-site copies of the daily backup to S3-compatible storage. */
export function OffsiteBackupCard({ settings, status, onChange }: { settings: Settings; status: { configured: boolean; lastAt: string | null; lastError: string | null }; onChange: () => void }) {
  const toast = useToast();
  const { refreshSettings } = useAuth();
  const [form, setForm] = useState({
    s3Endpoint: settings.s3Endpoint ?? '',
    s3Region: settings.s3Region ?? '',
    s3Bucket: settings.s3Bucket ?? '',
    s3Prefix: settings.s3Prefix ?? '',
    s3AccessKey: settings.s3AccessKey ?? '',
    s3SecretKey: '',
  });
  const [busy, setBusy] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
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
  const save = () =>
    run('save', async () => {
      const { s3SecretKey, ...rest } = form;
      await put('/settings', { ...rest, ...(s3SecretKey ? { s3SecretKey } : {}) });
      await refreshSettings();
      setForm((f) => ({ ...f, s3SecretKey: '' }));
      toast.success('Storage settings saved');
      onChange();
    });

  return (
    <Card title="Off-site copies">
      <p className="mb-4 text-sm text-slate-500">
        Copy each daily backup to cloud storage so it survives a dead disk or a lost server. Works with Cloudflare R2, Backblaze B2, Wasabi, AWS S3,
        DigitalOcean Spaces or MinIO. Use a bucket only InWoice writes to, with a key limited to that bucket.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Endpoint" hint="Blank for AWS S3. R2: https://<account id>.r2.cloudflarestorage.com" className="sm:col-span-2">
          <Input value={form.s3Endpoint} onChange={set('s3Endpoint')} placeholder="https://" />
        </Field>
        <Field label="Region" hint="e.g. ap-south-1 (R2: auto)">
          <Input value={form.s3Region} onChange={set('s3Region')} placeholder="auto" />
        </Field>
        <Field label="Bucket">
          <Input value={form.s3Bucket} onChange={set('s3Bucket')} />
        </Field>
        <Field label="Folder" hint="Default inwoice-backups">
          <Input value={form.s3Prefix} onChange={set('s3Prefix')} placeholder="inwoice-backups" />
        </Field>
        <Field label="Access key ID">
          <Input value={form.s3AccessKey} onChange={set('s3AccessKey')} autoComplete="off" />
        </Field>
        <Field label="Secret access key" className="sm:col-span-2">
          <Input type="password" autoComplete="new-password" value={form.s3SecretKey} onChange={set('s3SecretKey')} placeholder={settings.s3SecretKeySet ? '•••• saved — leave blank to keep' : ''} />
        </Field>
      </div>
      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
        {!status.configured ? (
          <p className="text-slate-600">Not set up yet.</p>
        ) : status.lastError ? (
          <p className="text-red-700">Last copy failed: {status.lastError}</p>
        ) : status.lastAt ? (
          <p className="flex items-center gap-2 text-emerald-700">
            <Cloud size={14} /> Last copied {dateTime(status.lastAt)}
          </p>
        ) : (
          <p className="text-slate-600">Set up. The next daily backup will be copied.</p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {status.configured && (
          <>
            <Button
              variant="secondary"
              loading={busy === 'test'}
              onClick={() =>
                run('test', async () => {
                  toast.success((await http.post('/backups/offsite/test')).data.message);
                })
              }
            >
              Test connection
            </Button>
            <Button
              variant="secondary"
              loading={busy === 'copy'}
              onClick={() =>
                run('copy', async () => {
                  toast.success((await http.post('/backups/offsite/upload', {})).data.message);
                  onChange();
                })
              }
            >
              Copy latest backup now
            </Button>
          </>
        )}
        <Button loading={busy === 'save'} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </Card>
  );
}

