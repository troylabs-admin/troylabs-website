/** Text and links that came from a member, made safe for the DOM-rendered portal pages. */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** an http(s) URL or nothing: keeps `javascript:` and other schemes out of href attributes */
export function webUrl(value: string): string | null {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !!u.hostname && !/\s/.test(value) ? u.href : null; } catch { return null; }
}
