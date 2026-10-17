import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { authClient } from '@/lib/auth/auth-client';
import { normalizeIndianMobile } from '@/lib/phone';

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-100';
const buttonClass =
  'w-full rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50';

export default function PhoneAuth({ from }: { from: string }) {
  const navigate = useNavigate();
  const [digits, setDigits] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    const phone = normalizeIndianMobile(digits);
    if (!phone) { setError('Enter a valid 10-digit Indian mobile number (starts with 6, 7, 8 or 9).'); return; }
    if (cooldown > 0) return;
    setLoading(true);
    try {
      const res = await authClient.phoneNumber.sendOtp({ phoneNumber: phone });
      if (res.error) { setError(res.error.message || 'Could not send the code. Please try again.'); return; }
      setSentTo(phone);
      setCode('');
      setCooldown(60);
    } catch {
      setError('Could not send the code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!sentTo) return;
    setError('');
    if (!/^\d{6}$/.test(code.trim())) { setError('Enter the 6-digit code.'); return; }
    setLoading(true);
    try {
      const res = await authClient.phoneNumber.verify({ phoneNumber: sentTo, code: code.trim() });
      if (res.error) { setError(res.error.message || 'That code is not correct or has expired.'); return; }
      if (name.trim()) {
        try { await authClient.updateUser({ name: name.trim().slice(0, 80) }); } catch { /* the name is optional */ }
      }
      navigate(from, { replace: true });
    } catch {
      setError('Could not verify the code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div>}

      {!sentTo ? (
        <form onSubmit={sendCode} className="space-y-4">
          <div>
            <label htmlFor="mobile" className="mb-1 block text-sm font-medium text-gray-700">Mobile number (WhatsApp / SMS)</label>
            <div className="flex">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 border-gray-300 bg-background px-3 text-sm text-gray-600">+91</span>
              <input
                id="mobile" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14}
                value={digits} onChange={(e) => setDigits(e.target.value)} disabled={loading}
                placeholder="98765 43210"
                className="w-full rounded-r-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-100"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">Indian numbers only. We send a 6-digit code to verify it.</p>
          </div>
          <div>
            <label htmlFor="pname" className="mb-1 block text-sm font-medium text-gray-700">Your name <span className="font-normal text-gray-400">(optional)</span></label>
            <input id="pname" type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={loading} className={inputClass} placeholder="Your name" />
          </div>
          <button type="submit" disabled={loading} className={buttonClass}>{loading ? 'Sending...' : 'Send code'}</button>
          <p className="text-center text-xs text-gray-500">New here? Verifying your number creates your account automatically.</p>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-sm text-gray-700">
            We sent a 6-digit code to <strong>{sentTo.replace('+91', '+91 ')}</strong>. It is valid for 5 minutes.
          </p>
          <div>
            <label htmlFor="otp" className="mb-1 block text-sm font-medium text-gray-700">Verification code</label>
            <input
              id="otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} disabled={loading}
              className={`${inputClass} text-center text-lg tracking-[0.5em]`} placeholder="------" autoFocus
            />
          </div>
          <button type="submit" disabled={loading} className={buttonClass}>{loading ? 'Checking...' : 'Verify and continue'}</button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={() => { setSentTo(null); setCode(''); setError(''); }} className="font-medium text-secondary hover:underline">Change number</button>
            <button type="button" onClick={() => sendCode()} disabled={loading || cooldown > 0} className="font-medium text-secondary hover:underline disabled:text-gray-400 disabled:no-underline">
              {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
