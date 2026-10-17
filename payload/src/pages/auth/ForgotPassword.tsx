import { useEffect, useState, FormEvent } from 'react';
import AuthShell from '@/components/AuthShell';
import { authClient } from '@/lib/auth/auth-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (cooldown > 0) return;
    setError('');
    setLoading(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error) {
        setError(result.error.message || 'Could not send the reset request. Please try again.');
        return;
      }
      setSentTo(email.trim());
      setCooldown(60);
    } catch {
      setError('Could not send the reset request. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="Enter your account email and we will send you a link to choose a new password.">

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{error}</div>}

        {sentTo && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">
            <p className="font-semibold">Request received - check your email</p>
            <p className="mt-1">
              If <strong>{sentTo}</strong> has a ChennaiDeals.in account, a reset link should arrive within a few minutes (check spam too).
              For security, this page cannot say whether the address has an account. The link works for 1 hour.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-100" placeholder="you@example.com" />
          </div>
          <button type="submit" disabled={loading || cooldown > 0}
            className="w-full rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
            {loading ? 'Sending...' : cooldown > 0 ? `Send again in ${cooldown}s` : 'Send reset link'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          <a href="/login" className="text-secondary hover:underline font-medium">Back to sign in</a>
        </p>
    </AuthShell>
  );
}
