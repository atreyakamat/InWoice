import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import { Building2, CheckCircle2, LogOut, Pencil, Plus } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Modal, Select, Spinner, Table, Td, Textarea, Th } from '../../components/ui';
import { useToast } from '../../components/toast';
import { errorMessage } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { date, dateTime, isoDate } from '../../lib/format';
import type { PlatformInfo } from '../../lib/platformInfo';

/**
 * The platform's own site (multi-business mode, root address): sign-up for new
 * businesses and the platform admin. It has its own API client: business sessions
 * don't apply here.
 */
const platform = axios.create({ baseURL: '/api/platform', timeout: 120_000 });
const ADMIN_KEY = 'inwoice_platform_admin';
const adminToken = {
  get: () => {
    try {
      return sessionStorage.getItem(ADMIN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) sessionStorage.setItem(ADMIN_KEY, t);
      else sessionStorage.removeItem(ADMIN_KEY);
    } catch {
      /* private mode */
    }
  },
};

export default function PlatformSite({ info }: { info: PlatformInfo }) {
  return (
    <Routes>
      <Route path="/" element={<Home info={info} />} />
      <Route path="/platform" element={<Admin info={info} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Shell({ info, children }: { info: PlatformInfo; children: ReactNode }) {
  return (
    <div className="min-h-full bg-gradient-to-br from-brand-50 via-white to-slate-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Link to="/" className="flex items-center gap-2 font-bold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm text-white">In</span>
          {info.platformName}
        </Link>
        {info.supportEmail && (
          <a href={`mailto:${info.supportEmail}`} className="text-sm text-slate-500 hover:text-slate-800">
            {info.supportEmail}
          </a>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16">{children}</main>
    </div>
  );
}

function Home({ info }: { info: PlatformInfo }) {
  const [form, setForm] = useState({ businessName: '', slug: '', name: '', email: '', password: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ url: string; trialEndsAt: string | null } | null>(null);
  const [slugStatus, setSlugStatus] = useState<{ available: boolean; reason: string | null } | null>(null);

  const suggest = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/^[^a-z]+/, '')
      .slice(0, 30);
  const setName = (businessName: string) => setForm((f) => ({ ...f, businessName, slug: slugTouched ? f.slug : suggest(businessName) }));

  const checkSlug = async (slug: string) => {
    if (!slug) return setSlugStatus(null);
    try {
      setSlugStatus((await platform.get('/check-slug', { params: { slug } })).data.data);
    } catch {
      setSlugStatus(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await platform.post('/signup', form);
      setDone(res.data.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const trial = info.plans.find((p) => p.key === 'TRIAL');
  return (
    <Shell info={info}>
      <div className="grid gap-10 pt-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Invoicing, GST and stock for your business, in one place.</h1>
          <p className="text-lg text-slate-600">
            GST invoices with UPI QR codes, quotes, recurring billing, payment reminders, bills and expenses, profit and GSTR reports. Works on any phone.
          </p>
          <ul className="space-y-2 text-slate-700">
            {['GSTR-1 and GSTR-3B figures every month', 'Customers pay by UPI from their own portal', 'Automatic reminders, statements and daily backups', 'Your team with the right access for each role'].map(
              (x) => (
                <li key={x} className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-600" /> {x}
                </li>
              ),
            )}
          </ul>
          {info.plans.length > 0 && (
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {info.plans.map((p) => (
                <div key={p.key} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="font-semibold text-slate-900">{p.label}</div>
                  <div className="text-xs text-slate-500">
                    {p.users} users · {p.invoicesPerMonth === null ? 'unlimited' : p.invoicesPerMonth} invoices/month
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-sm text-slate-500">
            Already have an account? Open your business at its own address, e.g. <span className="font-mono">yourshop.{info.baseDomain ?? 'example.com'}</span>
          </p>
        </div>

        <Card title={info.signupEnabled ? (trial ? 'Start your free trial' : 'Create your account') : 'Get an account'}>
          {done ? (
            <div className="space-y-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-emerald-700">
                <CheckCircle2 size={18} /> Your business is ready.
              </p>
              {done.trialEndsAt && <p className="text-slate-600">Your free trial runs until {date(done.trialEndsAt)}.</p>}
              <p className="text-slate-600">Bookmark your address and sign in there:</p>
              <a href={`${done.url}/login`} className="block break-all font-mono text-brand-700 underline">
                {done.url}
              </a>
              <a href={`${done.url}/login`}>
                <Button className="mt-2 w-full">Go to my business</Button>
              </a>
            </div>
          ) : !info.signupEnabled ? (
            <p className="text-sm text-slate-600">
              New accounts are set up for you. {info.supportEmail ? <>Write to <a className="underline" href={`mailto:${info.supportEmail}`}>{info.supportEmail}</a>.</> : 'Contact us to get started.'}
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <Field label="Business name">
                <Input value={form.businessName} onChange={(e) => setName(e.target.value)} required minLength={2} autoFocus />
              </Field>
              <Field
                label="Your address"
                hint={
                  slugStatus && !slugStatus.available ? (
                    <span className="text-red-600">{slugStatus.reason}</span>
                  ) : (
                    <>
                      {form.slug || 'yourshop'}.{info.baseDomain ?? 'example.com'}
                    </>
                  )
                }
              >
                <Input
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }));
                  }}
                  onBlur={() => void checkSlug(form.slug)}
                  required
                  pattern="[a-z][a-z0-9-]{2,30}"
                  aria-label="Address"
                />
              </Field>
              <Field label="Your name">
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required minLength={2} autoComplete="name" />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required autoComplete="email" />
              </Field>
              <Field label="Password" hint="At least 8 characters">
                <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} autoComplete="new-password" />
              </Field>
              <Button type="submit" loading={busy} className="w-full">
                Create my business
              </Button>
            </form>
          )}
        </Card>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Platform admin
// ---------------------------------------------------------------------------

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: 'ACTIVE' | 'SUSPENDED';
  customDomain: string | null;
  trialEndsAt: string | null;
  paidUntil: string | null;
  ownerEmail: string | null;
  notes: string | null;
  createdAt: string;
  account: { state: 'ok' | 'suspended' | 'expired'; message?: string };
  usage: { users: number; invoicesThisMonth: number; customers: number; lastActivityAt: string | null } | null;
}

function Admin({ info }: { info: PlatformInfo }) {
  const [token, setToken] = useState(adminToken.get());
  if (!token) {
    return (
      <AdminLogin
        info={info}
        onToken={(t) => {
          adminToken.set(t);
          setToken(t);
        }}
      />
    );
  }
  return (
    <AdminHome
      info={info}
      token={token}
      onSignOut={() => {
        adminToken.set(null);
        setToken(null);
      }}
    />
  );
}

function AdminLogin({ info, onToken }: { info: PlatformInfo; onToken: (t: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onToken((await platform.post('/admin/login', { email, password })).data.token);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell info={info}>
      <form onSubmit={submit} className="mx-auto mt-10 max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Platform admin</h1>
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" loading={busy} className="w-full">
          Sign in
        </Button>
        <p className="text-xs text-slate-500">Create an admin on the server with: npm run platform -- create-admin you@example.com &lt;password&gt;</p>
      </form>
    </Shell>
  );
}

const stateTone = (t: TenantRow) => (t.account.state === 'ok' ? 'green' : t.account.state === 'suspended' ? 'red' : 'amber');

function AdminHome({ info, token, onSignOut }: { info: PlatformInfo; token: string; onSignOut: () => void }) {
  const toast = useToast();
  const headers = { Authorization: `Bearer ${token}` };
  const { data, loading, error, reload } = useLoad(async () => {
    try {
      return (await platform.get('/admin/tenants', { headers })).data.data as TenantRow[];
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) onSignOut();
      throw err;
    }
  }, [token]);
  const [editing, setEditing] = useState<TenantRow | null>(null);
  const [creating, setCreating] = useState(false);

  const totals = (data ?? []).reduce(
    (s, t) => ({ businesses: s.businesses + 1, active: s.active + (t.account.state === 'ok' ? 1 : 0), invoices: s.invoices + (t.usage?.invoicesThisMonth ?? 0) }),
    { businesses: 0, active: 0, invoices: 0 },
  );

  return (
    <Shell info={info}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Businesses</h1>
          <p className="text-sm text-slate-500">
            {totals.businesses} businesses · {totals.active} active · {totals.invoices} invoices this month
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreating(true)}>
            <Plus size={15} /> New business
          </Button>
          <Button variant="secondary" onClick={onSignOut}>
            <LogOut size={15} /> Sign out
          </Button>
        </div>
      </div>
      <Card bodyClassName="p-0">
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState title="No businesses yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Business</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th className="text-right">Users</Th>
                <Th className="text-right">Invoices (month)</Th>
                <Th>Last activity</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((t) => (
                <tr key={t.id}>
                  <Td>
                    <div className="font-medium text-slate-900">{t.name}</div>
                    <div className="text-xs text-slate-500">
                      {t.customDomain ?? `${t.slug}.${info.baseDomain ?? ''}`} · {t.ownerEmail}
                    </div>
                  </Td>
                  <Td>
                    {info.plans.find((p) => p.key === t.plan)?.label ?? t.plan}
                    <div className="text-xs text-slate-500">
                      {t.plan === 'TRIAL' && t.trialEndsAt ? `trial to ${date(t.trialEndsAt)}` : t.paidUntil ? `paid to ${date(t.paidUntil)}` : ''}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={stateTone(t)}>{t.account.state === 'ok' ? 'Active' : t.account.state === 'suspended' ? 'Suspended' : 'Expired'}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{t.usage?.users ?? '—'}</Td>
                  <Td className="text-right tabular-nums">{t.usage?.invoicesThisMonth ?? '—'}</Td>
                  <Td className="whitespace-nowrap text-slate-500">{t.usage?.lastActivityAt ? dateTime(t.usage.lastActivityAt) : '—'}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                      <Pencil size={14} />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && (
        <EditTenant
          tenant={editing}
          plans={info.plans}
          headers={headers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success('Saved');
            void reload();
          }}
        />
      )}
      {creating && (
        <CreateTenant
          info={info}
          headers={headers}
          onClose={() => setCreating(false)}
          onSaved={(url) => {
            setCreating(false);
            toast.success(`Created: ${url}`);
            void reload();
          }}
        />
      )}
    </Shell>
  );
}

function EditTenant({ tenant, plans, headers, onClose, onSaved }: { tenant: TenantRow; plans: PlatformInfo['plans']; headers: Record<string, string>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: tenant.name,
    plan: tenant.plan,
    status: tenant.status,
    trialEndsAt: isoDate(tenant.trialEndsAt),
    paidUntil: isoDate(tenant.paidUntil),
    customDomain: tenant.customDomain ?? '',
    notes: tenant.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setSaving(true);
    try {
      await platform.patch(`/admin/tenants/${tenant.id}`, form, { headers });
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
      title={tenant.name}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Status" hint="Suspended = read-only; they can still view and export">
          <Select value={form.status} onChange={set('status')}>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </Select>
        </Field>
        <Field label="Plan">
          <Select value={form.plan} onChange={set('plan')}>
            {plans.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Trial ends">
          <Input type="date" value={form.trialEndsAt} onChange={set('trialEndsAt')} />
        </Field>
        <Field label="Paid until" hint="Read-only after this date until renewed">
          <Input type="date" value={form.paidUntil} onChange={set('paidUntil')} />
        </Field>
        <Field label="Custom domain" hint="Point its DNS (CNAME) at this server first">
          <Input value={form.customDomain} onChange={set('customDomain')} placeholder="billing.client.in" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={set('notes')} placeholder="Billing contact, how they pay, anything to remember" />
        </Field>
      </div>
    </Modal>
  );
}

function CreateTenant({ info, headers, onClose, onSaved }: { info: PlatformInfo; headers: Record<string, string>; onClose: () => void; onSaved: (url: string) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ businessName: '', slug: '', name: '', email: '', password: '', plan: 'TRIAL' });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setSaving(true);
    try {
      onSaved((await platform.post('/admin/tenants', form, { headers })).data.data.url);
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
      title="New business"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            <Building2 size={15} /> Create
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name">
          <Input value={form.businessName} onChange={set('businessName')} />
        </Field>
        <Field label="Address" hint={`${form.slug || 'shop'}.${info.baseDomain ?? ''}`}>
          <Input value={form.slug} onChange={set('slug')} placeholder="shop-name" />
        </Field>
        <Field label="Owner's name">
          <Input value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Owner's email">
          <Input type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Temporary password" hint="Ask them to change it after signing in">
          <Input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        <Field label="Plan">
          <Select value={form.plan} onChange={set('plan')}>
            {info.plans.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="mt-3 text-xs text-slate-500">The business gets its own database schema, settings and owner account straight away.</p>
    </Modal>
  );
}
