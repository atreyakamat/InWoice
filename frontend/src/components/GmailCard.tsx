import { useEffect, useState } from 'react';
import { Copy, Mail } from 'lucide-react';
import { Badge, Button, Card, Field, Input, Select } from './ui';
import { useToast } from './toast';
import { useAuth } from '../context/AuthContext';
import { get, post, put } from '../lib/api';
import type { Settings } from '../lib/types';

export interface GmailStatus {
  configured: boolean;
  redirectUri: string;
  connected: string | null;
  expired: boolean;
  automaticSender: { userId: string; email: string } | null;
  accounts?: { id: string; name: string; gmailAddress: string }[];
}

/**
 * Settings › Email › Gmail: connect your own Gmail (send-only permission) so emails go out
 * from it with the PDF attached. Admins set up the Google sign-in once and can choose a
 * connected Gmail for the automatic emails.
 */
export function GmailCard({ settings, isAdmin }: { settings: Settings; isAdmin: boolean }) {
  const toast = useToast();
  const { refreshSettings } = useAuth();
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [clientId, setClientId] = useState(settings.googleClientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [autoUser, setAutoUser] = useState(settings.autoMailUserId ?? '');
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => get<GmailStatus>('/google/status').then(setStatus);
  useEffect(() => {
    void load().catch(() => undefined);
  }, []);

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

  if (!status) return null;

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <Mail size={15} /> Gmail {status.connected ? <Badge tone="green">Connected</Badge> : <Badge tone="gray">Not connected</Badge>}
        </span>
      }
    >
      <p className="mb-4 text-sm text-slate-500">
        Connect your Gmail and invoices are sent from it with the PDF attached, straight from InWoice. No mail server settings needed. InWoice only gets permission to send email, never to read
        your inbox.
      </p>

      {status.connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm">
          <span>
            Sending as <strong>{status.connected}</strong>
          </span>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'disconnect'}
            onClick={() =>
              void run('disconnect', async () => {
                await post('/google/disconnect');
                await Promise.all([load(), refreshSettings()]);
                toast.success('Gmail disconnected');
              })
            }
          >
            Disconnect
          </Button>
        </div>
      ) : status.configured ? (
        <div>
          {status.expired && <p className="mb-2 text-sm text-amber-700">Your Gmail connection stopped working (access was removed or expired). Connect it again.</p>}
          <Button
            loading={busy === 'connect'}
            onClick={() =>
              void run('connect', async () => {
                const { url } = await post<{ url: string }>('/google/connect');
                window.location.href = url;
              })
            }
          >
            <Mail size={15} /> Connect Gmail
          </Button>
        </div>
      ) : (
        <p className="text-sm text-amber-700">{isAdmin ? 'Set up Google sign-in below first (once for the business).' : 'Ask an admin to set up Google sign-in in Settings › Email.'}</p>
      )}

      {isAdmin && (
        <div className="mt-5 space-y-4 border-t border-slate-100 pt-4">
          {status.accounts && status.accounts.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Send automatic emails from" hint="Reminders, statements and the monthly summary. Mail server = your SMTP settings above." className="min-w-[16rem] flex-1">
                <Select value={autoUser} onChange={(e) => setAutoUser(e.target.value)}>
                  <option value="">Mail server (SMTP)</option>
                  {status.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.gmailAddress} ({a.name})
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                variant="secondary"
                loading={busy === 'auto'}
                onClick={() =>
                  void run('auto', async () => {
                    await put('/settings', { autoMailUserId: autoUser });
                    await Promise.all([load(), refreshSettings()]);
                    toast.success(autoUser ? 'Automatic emails will go out through Gmail' : 'Automatic emails use the mail server');
                  })
                }
              >
                Save
              </Button>
            </div>
          )}

          <details className="text-sm" open={!status.configured}>
            <summary className="cursor-pointer font-medium text-slate-700">Google sign-in setup {status.configured && <span className="font-normal text-emerald-700">(done)</span>}</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600">
              <li>
                Open{' '}
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                  Google Cloud › Credentials
                </a>{' '}
                (any Google account), create a project, and enable the <strong>Gmail API</strong>.
              </li>
              <li>OAuth consent screen: type External, add your Gmail as a test user, then press &ldquo;Publish app&rdquo; so access doesn&apos;t expire after 7 days.</li>
              <li>
                Create credentials › OAuth client ID › <strong>Web application</strong>, with this authorised redirect URI:
              </li>
            </ol>
            <div className="my-2 flex items-center gap-2 rounded-lg bg-slate-50 p-2">
              <code className="min-w-0 flex-1 truncate text-xs">{status.redirectUri}</code>
              <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard.writeText(status.redirectUri).then(() => toast.success('Copied'))}>
                <Copy size={13} /> Copy
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client ID">
                <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="…apps.googleusercontent.com" />
              </Field>
              <Field label="Client secret" hint={settings.googleClientSecretSet ? 'Saved. Leave blank to keep it.' : undefined}>
                <Input type="password" autoComplete="new-password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={settings.googleClientSecretSet ? '•••• saved' : ''} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">Google shows &ldquo;Google hasn&apos;t verified this app&rdquo; the first time: it is your own app, so choose Advanced › Continue.</p>
            <div className="mt-3 flex justify-end">
              <Button
                loading={busy === 'client'}
                onClick={() =>
                  void run('client', async () => {
                    await put('/settings', { googleClientId: clientId, ...(clientSecret ? { googleClientSecret: clientSecret } : {}) });
                    setClientSecret('');
                    await Promise.all([load(), refreshSettings()]);
                    toast.success('Google sign-in saved');
                  })
                }
              >
                Save
              </Button>
            </div>
          </details>
        </div>
      )}
    </Card>
  );
}
