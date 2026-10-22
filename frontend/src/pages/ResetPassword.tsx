import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Field, Input, Spinner } from '../components/ui';
import { errorMessage, http } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { AuthShell } from './ForgotPassword';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const check = useLoad(async () => (await http.get(`/auth/reset-password/${encodeURIComponent(token)}`)).data.data as { email: string }, [token]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      await http.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" subtitle={check.data ? `For ${check.data.email}` : 'Reset your InWoice password.'}>
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm shadow-sm">
        {done ? (
          <>
            <p className="text-emerald-700">Your password has been changed.</p>
            <Link to="/login" className="font-medium text-brand-600 hover:underline">
              Sign in
            </Link>
          </>
        ) : check.loading && !check.data ? (
          <Spinner />
        ) : check.error ? (
          <>
            <p className="text-red-700">{check.error}</p>
            <Link to="/forgot-password" className="font-medium text-brand-600 hover:underline">
              Ask for a new link
            </Link>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</div>}
            <Field label="New password" hint="At least 8 characters.">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" autoFocus />
            </Field>
            <Field label="Confirm new password">
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
            </Field>
            <Button type="submit" loading={busy} className="w-full">
              Change password
            </Button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
