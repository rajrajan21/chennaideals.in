/** Mobile-number sign in / sign up with a 6-digit code (Better Auth phoneNumber plugin). */
import { phoneNumber } from 'better-auth/plugins';
import { APIError } from 'better-auth/api';
import { normalizeIndianMobile } from '@/lib/phone';
import { sendOtpSms } from '@/server/lib/sms';

const COOLDOWN_MS = 45_000;
const PER_NUMBER_PER_DAY = 6;
const lastSent = new Map<string, number>();
const perDay = new Map<string, { day: string; n: number }>();

export function buildPhonePlugin() {
  return phoneNumber({
    otpLength: 6,
    expiresIn: 5 * 60,
    allowedAttempts: 5,
    phoneNumberValidator: (value: string) => normalizeIndianMobile(value) === value,
    sendOTP: async ({ phoneNumber: phone, code }: { phoneNumber: string; code: string }) => {
      const now = Date.now();
      const last = lastSent.get(phone) ?? 0;
      if (now - last < COOLDOWN_MS) {
        throw new APIError('TOO_MANY_REQUESTS', { message: 'Please wait a minute before asking for another code.' });
      }
      const today = new Date().toISOString().slice(0, 10);
      const rec = perDay.get(phone);
      const n = rec && rec.day === today ? rec.n : 0;
      if (n >= PER_NUMBER_PER_DAY) {
        throw new APIError('TOO_MANY_REQUESTS', { message: 'Too many codes were requested for this number today. Try again tomorrow.' });
      }
      lastSent.set(phone, now);
      perDay.set(phone, { day: today, n: n + 1 });
      if (lastSent.size > 5000) lastSent.clear();
      await sendOtpSms(phone, code);
    },
    signUpOnVerification: {
      getTempEmail: (phone: string) => `${phone.replace('+', '')}@phone.chennaideals.in`,
      getTempName: (phone: string) => `User ${phone.slice(-4)}`,
    },
  });
}
