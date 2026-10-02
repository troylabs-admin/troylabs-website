/**
 * Phone numbers are stored in E.164 (+13105550101), the one format every texting provider takes
 * (Twilio, Sendblue, Telnyx all reject anything else). Most members are in the US, so a bare 10-digit
 * number (or 11 starting with 1) is read as North American; anything else must start with + and a
 * country code. North American numbers are checked against the NANP rules (area code and exchange
 * can't start with 0 or 1) so a typo like 555-0101 is caught before a text bounces.
 * The database enforces the same shape (migration 20261002000200).
 */
export function toE164(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/[^\d\s().\-+]/.test(raw) || raw.lastIndexOf('+') > 0) return null;   // letters (an extension, a word) or a stray +: can't be texted
  const digits = raw.replace(/\D/g, '');
  const intl = raw.startsWith('+');
  const nanp = (ten: string) => (/^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? `+1${ten}` : null);
  if (intl) {
    if (digits.startsWith('1')) return digits.length === 11 ? nanp(digits.slice(1)) : null;
    return /^[2-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;   // E.164: country code never starts with 0, at most 15 digits
  }
  if (digits.length === 10) return nanp(digits);
  if (digits.length === 11 && digits.startsWith('1')) return nanp(digits.slice(1));
  return null;
}

/** +13105550101 → (310) 555-0101; other countries stay in E.164 */
export function prettyPhone(e164: string | null | undefined): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 ?? '');
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (e164 ?? '');
}
