/**
 * Sends the sign-in code by SMS.
 *
 *   SMS_PROVIDER=console   (default)  nothing is sent; the code is printed in the server window.
 *                                     Free. For testing on your own computer.
 *   SMS_PROVIDER=fast2sms             real SMS through Fast2SMS (needs FAST2SMS_API_KEY; the
 *                                     Fast2SMS account needs KYC and a wallet recharge, SMS is paid).
 *
 * A daily cap (SMS_DAILY_LIMIT, default 200) stops a bot from running up the SMS bill.
 */
import { getSecret } from '#airo/secrets';
import { maskIndianMobile } from '@/lib/phone';

let day = '';
let sentToday = 0;

function underDailyLimit(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; sentToday = 0; }
  const limit = Number(getSecret('SMS_DAILY_LIMIT') ?? '200') || 200;
  if (sentToday >= limit) return false;
  sentToday++;
  return true;
}

export function smsProvider(): 'console' | 'fast2sms' {
  return String(getSecret('SMS_PROVIDER') ?? 'console').toLowerCase() === 'fast2sms' ? 'fast2sms' : 'console';
}

export async function sendOtpSms(phoneE164: string, code: string): Promise<void> {
  if (!underDailyLimit()) throw new Error('Daily SMS limit reached');

  if (smsProvider() === 'console') {
    console.warn(`\n[SMS TEST MODE] Sign-in code for ${phoneE164} is ${code}  (no SMS was sent)\n`);
    return;
  }

  const apiKey = getSecret('FAST2SMS_API_KEY');
  if (!apiKey) throw new Error('FAST2SMS_API_KEY is not set');
  const number = phoneE164.replace(/^\+91/, '');
  const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: { authorization: apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ route: 'otp', variables_values: code, numbers: number, flash: '0' }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  let data: { return?: boolean; message?: unknown; status_code?: number } = {};
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || data.return !== true) {
    // The reason is printed here (server window) and never sent to the browser.
    console.error('Fast2SMS could not send the code', { number: maskIndianMobile(phoneE164), status: res.status, code: data.status_code, message: data.message });
    throw new Error('SMS provider refused the message');
  }
}
