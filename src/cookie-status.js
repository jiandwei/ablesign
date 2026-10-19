// Only store an opaque digest, never the Cookie string itself.
export async function cookieFingerprint(cookie) {
  if (!cookie) return null;
  const bytes = new TextEncoder().encode(cookie);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function maskAccount(email) {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return '***';
  return local.slice(0, 1) + '***@' + domain;
}
export function cookieObservation(fingerprint, record = null) {
  if (!fingerprint) return { status: 'not_configured', checkedAt: null };
  if (!record?.cookieFingerprint || record.cookieFingerprint !== fingerprint) {
    return { status: 'unchecked', checkedAt: null };
  }
  const known = ['valid', 'expired', 'restricted', 'unknown'];
  const status = known.includes(record.cookieStatus) ? record.cookieStatus : 'unchecked';
  return { status, checkedAt: status === 'unchecked' ? null : (record.cookieCheckedAt || null) };
}
export function activeCookieRecord(fingerprint, record = null) {
  const original = record || { ok: false, attempts: 0 };
  if (!fingerprint || fingerprint === original.cookieFingerprint) return original;
  // A replaced Cookie gets a new observation; daily request quotas remain intact.
  return { ...original, cookieExpired: false, cookieFingerprint: fingerprint,
    cookieStatus: 'unchecked', cookieCheckedAt: null };
}
