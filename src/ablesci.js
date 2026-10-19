import { isRiskHttp, isRiskText, failure } from './policy.js';
const HOME = 'https://www.ablesci.com/';
const LOGIN = HOME + 'site/login';
const SIGN = HOME + 'user/sign';
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'X-Requested-With': 'XMLHttpRequest'
};
export function extractCsrf(html) {
  const meta = html.match(/<meta\b(?=[^>]*\bname\s*=\s*["']csrf-token["'])([^>]+)>/i);
  const input = html.match(/<input\b(?=[^>]*\bname\s*=\s*["']_csrf["'])([^>]+)>/i);
  const tag = meta?.[1] || input?.[1];
  return tag?.match(/\b(?:content|value)\s*=\s*["']([^"']+)["']/i)?.[1] || '';
}
function getCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
  const header = response.headers.get('set-cookie');
  return header ? [header] : [];
}
export function updateCookies(jar, response) {
  for (const item of getCookies(response)) {
    const first = item.split(';', 1)[0];
    const idx = first.indexOf('=');
    if (idx > 0) jar.set(first.slice(0, idx).trim(), first.slice(idx + 1));
  }
}
export function cookieHeader(jar) {
  return [...jar].map(([k, v]) => k + '=' + v).join('; ');
}
async function request(url, options, jar) {
  const headers = new Headers({ ...BROWSER_HEADERS, ...(options.headers || {}) });
  if (jar.size) headers.set('Cookie', cookieHeader(jar));
  const response = await fetch(url, {
    ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(30000)
  });
  updateCookies(jar, response);
  return response;
}
function jarFromCookie(raw = '') {
  const jar = new Map();
  for (const pair of raw.split(';')) {
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  return jar;
}
export function sessionExpiredResponse(status, location = '', message = '') {
  if (status === 401) return true;
  if ([301, 302, 303, 307, 308].includes(status) && /\/site\/login(?:[?#]|$)/i.test(location)) return true;
  return /(?:登录已失效|请先登录|未登录|登录已过期|session expired|login required|unauthorized)/i.test(message);
}
async function signWithJar(jar) {
  try {
    const response = await request(SIGN, { method: 'GET', headers: { Referer: HOME } }, jar);
    if (isRiskHttp(response.status)) return failure('sign_restricted', true);
    if (sessionExpiredResponse(response.status, response.headers.get('location') || '')) {
      return { ok: false, expired: true, detail: 'session_expired' };
    }
    if (!response.ok) return failure('sign_http_' + response.status);
    const body = await response.text();
    if (isRiskText(body)) return failure('sign_challenge', true);
    let result;
    try { result = JSON.parse(body); } catch { return failure('invalid_sign_response'); }
    if (result?.code === 0) return { ok: true, detail: 'signed', blocked: false };
    if (typeof result?.msg === 'string' && result.msg.includes('您今天已于')) {
      return { ok: true, detail: 'already_signed', blocked: false };
    }
    if (sessionExpiredResponse(response.status, '', result?.msg || '')) {
      return { ok: false, expired: true, detail: 'session_expired' };
    }
    return failure('sign_rejected', true);
  } catch {
    return failure('network_error');
  }
}
async function passwordLoginAndSign(email, password) {
  const jar = new Map();
  try {
    const page = await request(LOGIN, { method: 'GET' }, jar);
    if (isRiskHttp(page.status)) return failure('login_page_restricted', true);
    if (!page.ok) return failure('login_page_http_' + page.status);
    const html = await page.text();
    if (isRiskText(html)) return failure('login_page_challenge', true);
    const csrf = extractCsrf(html);
    if (!csrf) return failure('csrf_missing', true);
    const form = new URLSearchParams({ _csrf: csrf, email, password, remember: 'off' });
    const response = await request(LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Referer: LOGIN },
      body: form.toString()
    }, jar);
    if (isRiskHttp(response.status)) return failure('login_restricted', true);
    if (!response.ok) return failure('login_http_' + response.status);
    const text = await response.text();
    if (isRiskText(text)) return failure('login_challenge', true);
    let result;
    try { result = JSON.parse(text); } catch { result = null; }
    if (!(result ? result.code === 0 : text.includes('退出'))) return failure('login_rejected', true);
    return await signWithJar(jar);
  } catch {
    return failure('network_error');
  }
}
// Called once per daily sign attempt. reservePasswordLogin must persist allowance
// BEFORE the first login GET request; a crash cannot grant another login.
export async function signAccount(email, password, cookie = '', reservePasswordLogin = async () => false) {
  let cookieExpired = false;
  let cookieStatus;
  let cookieCheckedAt;
  if (cookie) {
    const result = await signWithJar(jarFromCookie(cookie));
    cookieCheckedAt = Date.now();
    cookieStatus = result.expired ? 'expired' : result.ok ? 'valid' : result.blocked ? 'restricted' : 'unknown';
    if (!result.expired) {
      return { ...result, mode: 'cookie', cookieExpired: false, cookieStatus, cookieCheckedAt };
    }
    cookieExpired = true;
  }
  if (!password) return { ...failure('password_missing', true), cookieExpired, cookieStatus, cookieCheckedAt };
  if (!await reservePasswordLogin()) {
    return { ...failure('password_login_limit_reached'), cookieExpired, cookieStatus, cookieCheckedAt };
  }
  const result = await passwordLoginAndSign(email, password);
  return { ...result, mode: 'password', cookieExpired, cookieStatus, cookieCheckedAt };
}
