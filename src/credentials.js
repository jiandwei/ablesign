import { parseAccounts } from './utils.js';

/**
 * Cookies are strictly secrets supplied at runtime; they must not appear in
 * GitHub files, logs, status endpoints or error responses.
 * ABLESCI_COOKIE: a single account's raw Cookie header value.
 * ABLESCI_COOKIES: JSON object mapping email addresses to Cookie strings.
 */
export function configuredAccounts(env) {
  const accounts = parseAccounts(env.ABLESCI_ACCOUNTS || '');
  let mapped = {};
  if (env.ABLESCI_COOKIES) {
    try {
      const parsed = JSON.parse(env.ABLESCI_COOKIES);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) mapped = parsed;
    } catch {
      throw new Error('Invalid ABLESCI_COOKIES JSON Secret');
    }
  }
  if (env.ABLESCI_COOKIE && accounts.length !== 1) {
    throw new Error('ABLESCI_COOKIE requires exactly one account; use ABLESCI_COOKIES for multiple accounts');
  }
  const normalized = new Map();
  for (const [email, cookie] of Object.entries(mapped)) {
    normalized.set(email.toLowerCase(), cookie);
  }
  return accounts.map(account => ({
    ...account,
    cookie: cleanCookie(accounts.length === 1 && env.ABLESCI_COOKIE
      ? env.ABLESCI_COOKIE
      : normalized.get(account.email.toLowerCase()) || '')
  }));
}
export function cleanCookie(value) {
  if (!value) return '';
  if (typeof value !== 'string' || /[\r\n\0-\x1f\x7f]/.test(value)) {
    throw new Error('Invalid cookie Secret');
  }
  const trimmed = value.trim().replace(/^cookie:\s*/i, '');
  if (trimmed.length > 16000) throw new Error('Cookie Secret is too long');
  return trimmed;
}
