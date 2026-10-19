import { isRiskHttp, isRiskText, failure } from './policy.js';
const HOME = 'https://www.ablesci.com/';
const LOGIN = HOME + 'site/login';
const SIGN = HOME + 'user/sign';
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
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
    // Each Set-Cookie line begins with exactly one cookie-pair.
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
  const resp = await fetch(url, { ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  updateCookies(jar, resp);
  return resp;
}
async function responseJson(resp) {
  try { return await resp.json(); } catch { return null; }
}
export async function signAccount(email, password) {
  const jar = new Map();
  try {
    const page = await request(LOGIN, { method: 'GET' }, jar);
    if (isRiskHttp(page.status)) return failure('login_page_restricted', true);
    if (!page.ok) return failure('login_page_http_' + page.status);
    const loginHtml = await page.text();
    if (isRiskText(loginHtml)) return failure('login_page_challenge', true);
    const csrf = extractCsrf(loginHtml);
    if (!csrf) return failure('csrf_missing', true);
    const form = new URLSearchParams({ _csrf: csrf, email, password, remember: 'off' });
    const login = await request(LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Referer': LOGIN },
      body: form.toString()
    }, jar);
    if (isRiskHttp(login.status)) return failure('login_restricted', true);
    if (!login.ok) return failure('login_http_' + login.status);
    const loginText = await login.text();
    let json;
    try { json = JSON.parse(loginText); } catch { json = null; }
    if (isRiskText(loginText)) return failure('login_challenge', true);
    const loggedIn = json ? json.code === 0 : loginText.includes('退出');
    // Unidentified login rejection is treated as a permanent stop for this day:
    // repeated password attempts can lock an account.
    if (!loggedIn) return failure('login_rejected', true);
    const signed = await request(SIGN, { method: 'GET', headers: { Referer: HOME } }, jar);
    if (isRiskHttp(signed.status)) return failure('sign_restricted', true);
    if (!signed.ok) return failure('sign_http_' + signed.status);
    const result = await responseJson(signed);
    if (!result) return failure('invalid_sign_response');
    if (result.code === 0) return { ok: true, detail: 'signed', blocked: false };
    if (typeof result.msg === 'string' && result.msg.includes('您今天已于')) return { ok: true, detail: 'already_signed', blocked: false };
    if (isRiskText(result.msg)) return failure('sign_challenge', true);
    return failure('sign_rejected', true);
  } catch {
    // Never propagate upstream response content or request data into logs.
    return failure('network_error');
  }
}
