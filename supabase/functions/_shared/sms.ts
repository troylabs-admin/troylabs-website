/**
 * The text-message version of an Admin › Message (2026-10-02). Shared by the send-message function (what is
 * sent) and the Message page (the live length counter), so the counter always matches what goes out.
 *
 * Industry rules it follows (CTIA messaging principles, carrier toll-free/10DLC review):
 *   - every text names the sender first ("TroyLabs: ...")
 *   - every text says how to stop ("Reply STOP to opt out")
 *   - plain GSM-7 characters where possible: one curly quote or em dash switches the whole text to UCS-2,
 *     which drops a segment from 160 to 70 characters and can double the cost. Smart punctuation is
 *     straightened first (what Twilio's "Smart Encoding" does), so pasted copy from Docs doesn't cost double.
 *   - Twilio takes at most 1,600 characters per message.
 */
export const SMS_MAX = 1600;

const SMART: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'", '′': "'",
  '“': '"', '”': '"', '„': '"', '‟': '"', '″': '"',
  '–': '-', '—': '-', '―': '-', '−': '-', '‐': '-', '‑': '-',
  '…': '...', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '•': '-', '·': '-',
};
export const straighten = (s: string) => s.replace(/[‘’‚‛′“”„‟″–—―−‐‑…    ​•·]/g, (c) => SMART[c]);

// GSM 03.38 default alphabet, and the extension table (each of those costs two characters)
const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€\f';

/** how many SMS segments a body takes (what carriers bill), and in which encoding */
export function segments(text: string): { chars: number; segments: number; unicode: boolean } {
  let gsmLen = 0, unicode = false;
  for (const ch of text) {
    if (GSM.includes(ch)) gsmLen += 1;
    else if (GSM_EXT.includes(ch)) gsmLen += 2;
    else { unicode = true; break; }
  }
  if (unicode) {
    const units = text.length;   // UTF-16 code units; an emoji is two
    return { chars: units, segments: units <= 70 ? 1 : Math.ceil(units / 67), unicode };
  }
  return { chars: gsmLen, segments: gsmLen <= 160 ? 1 : Math.ceil(gsmLen / 153), unicode };
}

export type SmsEvent = { name?: string; when?: string | null; where?: string | null; rsvp?: string | null } | null;

/** the event time as the admin typed it (a wall-clock time in LA, no timezone attached) */
export function eventWhenShort(v?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v ?? ''); if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return d.toLocaleString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PT';
}
const webUrl = (v?: string | null) => { try { const u = new URL(v ?? ''); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } };

export function smsBody(body: string, event: SmsEvent, test = false): string {
  const ev = event?.name ? event : null;
  const when = eventWhenShort(ev?.when); const rsvp = webUrl(ev?.rsvp);
  const lines = [`${test ? '[TEST] ' : ''}TroyLabs: ${body.trim()}`];
  if (ev) lines.push('', [ev.name, when, ev.where].filter(Boolean).join(' - ') + (rsvp ? `\nRSVP: ${rsvp}` : ''));
  lines.push('', 'Reply STOP to opt out.');
  return straighten(lines.join('\n'));
}

/* The automatic texts (2026-10-06), one place for the wording: send-message sends them, Admin › Messages shows them.
   WELCOME_TEXT is word for word the opt-in message registered with the A2P campaign (also Twilio's reply to START).
   GOODBYE_TEXT is the one confirmation after someone turns texts off ON THE WEBSITE (a STOP reply gets STOP_REPLY from
   Twilio instead, never this). STOP_REPLY and HELP_REPLY are what Twilio's opt-out management answers with. */
/** sent when an admin approves someone (Bryan, 2026-10-06: the first text comes with approval, not with signing up) */
export const APPROVED_TEXT = "TroyLabs: You're in! Welcome to the TL Alumni Network. A few event texts a month. Msg & data rates may apply. Reply HELP for help, STOP to cancel.";
export const WELCOME_TEXT = "TroyLabs: You're signed up for TroyLabs event texts, a few msgs a month. Msg & data rates may apply. Reply HELP for help, STOP to cancel.";
export const GOODBYE_TEXT = "TroyLabs: Texts are now off for this number. To turn them back on, reply START or tick the box on your profile at usctroylabs.com.";
export const STOP_REPLY = "TroyLabs: You're unsubscribed and won't get more texts from us. Reply START to sign up again.";
export const HELP_REPLY = "TroyLabs event texts for members and alumni. Questions: troylabs@usc.edu or usctroylabs.com. Msg & data rates may apply. Reply STOP to cancel.";
/** a template's [placeholder] still in a message, e.g. "[Event name]": never send one by accident */
export const placeholderLeft = (...parts: (string | null | undefined)[]) => parts.map((x) => /\[[^\]\n]{2,40}\]/.exec(x ?? '')?.[0]).find(Boolean) ?? null;
