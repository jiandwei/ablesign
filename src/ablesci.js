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
    if (!page.ok) return { ok: false, detail: 'login_page_http_' + page.status };
    const csrf = extractCsrf(await page.text());
    if (!csrf) return { ok: false, detail: 'csrf_missing' };
    const form = new URLSearchParams({ _csrf: csrf, email, password, remember: 'off' });
    const login = await request(LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Referer': LOGIN },
      body: form.toString()
    }, jar);
    if (!login.ok) return { ok: false, detail: 'login_http_' + login.status };
    const loginText = await login.text();
    let json;
    try { json = JSON.parse(loginText); } catch { json = null; }
    const loggedIn = json ? json.code === 0 : loginText.includes('退出');
    if (!loggedIn) return { ok: false, detail: 'login_rejected_or_captcha' };
    const signed = await request(SIGN, { method: 'GET', headers: { Referer: HOME } }, jar);
    if (!signed.ok) return { ok: false, detail: 'sign_http_' + signed.status };
    const result = await responseJson(signed);
    if (!result) return { ok: false, detail: 'invalid_sign_response' };
    if (result.code === 0) return { ok: true, detail: 'signed' };
    if (typeof result.msg === 'string' && result.msg.includes('您今天已于')) return { ok: true, detail: 'already_signed' };
    return { ok: false, detail: 'sign_rejected' };
  } catch {
    // Never propagate upstream response content or request data into logs.
    return { ok: false, detail: 'network_error' };
  }
}
