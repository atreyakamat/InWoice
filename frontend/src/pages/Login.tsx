import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlatformInfo } from '../lib/platformInfo';
import { Button, Field, Input, Spinner } from '../components/ui';
import { errorMessage } from '../lib/api';

export default function Login() {
  const { user, loading, setupRequired, login, verifyTwoFactor, setup } = useAuth();
  const navigate = useNavigate();
  const business = usePlatformInfo()?.tenant?.name;
  const [form, setForm] = useState({ name: '', businessName: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Set after a correct password when the account uses two-factor sign-in.
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState('');

  if (loading) return <Spinner label="Starting InWoice…" />;
  if (user) return <Navigate to="/" replace />;

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (setupRequired && form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      if (setupRequired) {
        await setup({ name: form.name, businessName: form.businessName, email: form.email, password: form.password });
      } else if (ticket) {
        await verifyTwoFactor(ticket, code);
      } else {
        const r = await login(form.email, form.password);
        if (r.twoFactorTicket) {
          setTicket(r.twoFactorTicket);
          return;
        }
      }
      navigate('/', { replace: true });
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      // An expired two-factor step means starting again with the password.
      if (ticket && /took too long|sign in again/i.test(message)) setTicket(null);
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setTicket(null);
    setCode('');
    setError('');
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">In</div>
          <h1 className="text-2xl font-bold text-slate-900">{setupRequired ? 'Set up InWoice' : ticket ? 'Two-step sign-in' : `Sign in to ${business ?? 'InWoice'}`}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {setupRequired ? 'Create the owner account for your business.' : 'Invoices, customers and operations in one place.'}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {ticket ? (
            <>
              <p className="text-sm text-slate-600">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
              <Field label="Code">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="text-center text-lg tracking-widest"
                />
              </Field>
              <Button type="submit" loading={busy} className="w-full">
                Verify
              </Button>
              <p className="text-center text-sm">
                <button type="button" className="text-slate-500 hover:text-slate-800" onClick={startOver}>
                  Use a different account
                </button>
              </p>
            </>
          ) : (
            <>
              {setupRequired && (
                <>
                  <Field label="Business name">
                    <Input value={form.businessName} onChange={set('businessName')} required autoFocus placeholder="e.g. Stix N Vibes" />
                  </Field>
                  <Field label="Your name">
                    <Input value={form.name} onChange={set('name')} required minLength={2} autoComplete="name" />
                  </Field>
                </>
              )}
              <Field label="Email">
                <Input type="email" value={form.email} onChange={set('email')} required autoComplete="email" autoFocus={!setupRequired} />
              </Field>
              <Field label="Password" hint={setupRequired ? 'At least 8 characters.' : undefined}>
                <Input
                  type="password"
                  value={form.password}
                  onChange={set('password')}
                  required
                  minLength={setupRequired ? 8 : 1}
                  autoComplete={setupRequired ? 'new-password' : 'current-password'}
                />
              </Field>
              {setupRequired && (
                <Field label="Confirm password">
                  <Input type="password" value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" />
                </Field>
              )}
              <Button type="submit" loading={busy} className="w-full">
                {setupRequired ? 'Create account' : 'Sign in'}
              </Button>
              {!setupRequired && (
                <p className="text-center text-sm">
                  <Link to="/forgot-password" className="text-slate-500 hover:text-slate-800">
                    Forgot your password?
                  </Link>
                </p>
              )}
            </>
          )}
        </form>
      </div>
    </div>
  );
}
