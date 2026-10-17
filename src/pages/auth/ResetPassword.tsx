import { useState, FormEvent } from 'react';
import AuthShell from '@/components/AuthShell';
import { useLocation } from 'react-router';
import { authClient } from '@/lib/auth/auth-client';

function validatePassword(pwd: string): string | null {
  if (pwd.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(pwd)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(pwd)) return 'Password must contain at least one number';
  if (!/[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/`~]/.test(pwd)) return 'Password must contain at least one special character';
  return null;
}

export default function ResetPasswordPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const token = params.get('token') ?? '';
  const linkError = params.get('error');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const problem = validatePassword(password);
    if (problem) { setError(problem); return; }
    if (password !== confirm) { setError('The two passwords do not match'); return; }
    setLoading(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError(result.error.message || 'This reset link is invalid or has expired. Please request a new one.');
        return;
      }
      setDone(true);
    } catch {
      setError('Could not reset the password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const unusable = !token || !!linkError;

  return (
    <AuthShell title="Choose a new password">

        {done ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900" role="status">
            <p className="font-semibold">Password changed</p>
            <p className="mt-1">You can now sign in with your new password.</p>
            <a href="/login" className="mt-3 inline-block rounded-md bg-secondary px-3 py-1.5 font-semibold text-secondary-foreground hover:opacity-90">Sign in</a>
          </div>
        ) : unusable ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            <p className="font-semibold">This reset link is not valid</p>
            <p className="mt-1">It may have expired (links last 1 hour) or already been used.</p>
            <a href="/forgot-password" className="mt-3 inline-block rounded-md bg-secondary px-3 py-1.5 font-semibold text-secondary-foreground hover:opacity-90">Request a new link</a>
          </div>
        ) : (
          <>
            {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-100" placeholder="Min 8 chars, A-Z, 0-9, special" />
                <p className="mt-1 text-xs text-gray-500">Must include uppercase, number, and special character</p>
              </div>
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
                <input id="confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={loading}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-100" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
                {loading ? 'Saving...' : 'Change password'}
              </button>
            </form>
          </>
        )}
    </AuthShell>
  );
}
