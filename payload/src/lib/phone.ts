/** Indian mobile numbers only. Used by the sign-in page (browser) and by the server. */

/** Returns "+91XXXXXXXXXX" for a valid Indian mobile number, otherwise null. */
export function normalizeIndianMobile(input: string): string | null {
  let d = String(input ?? '').replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('0091')) d = d.slice(4);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  return `+91${d}`;
}

/** "+919876543210" -> "+91 98xxx xx210" (safe to show on screen and in logs). */
export function maskIndianMobile(e164: string): string {
  const d = e164.replace(/^\+91/, '');
  if (d.length !== 10) return '***';
  return `+91 ${d.slice(0, 2)}xxx xx${d.slice(7)}`;
}
