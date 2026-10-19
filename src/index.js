import { DurableObject } from 'cloudflare:workers';
import { DASHBOARD_HTML } from './dashboard.js';
import { beijingDay, atBeijing, inSignWindow, randomTarget, randomInt, parseAccounts, accountKey, nextDay } from './utils.js';
import { signAccount } from './ablesci.js';
import { notify } from './notify.js';

function reply(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}
function secureEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/') {
      const bytes = new Uint8Array(18);
      crypto.getRandomValues(bytes);
      const nonce = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      const html = DASHBOARD_HTML.replace('<script>', '<script nonce="' + nonce + '">');
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, max-age=0',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Content-Security-Policy': "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        }
      });
    }
    if (request.method === 'GET' && path === '/health') {
      return reply({ ok: true, service: 'ablesign' });
    }
    if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32 || !env.ABLESCI_ACCOUNTS) {
      return reply({ error: 'Configure ABLESCI_ACCOUNTS and ADMIN_TOKEN (at least 32 characters) as Worker Secrets.' }, 503);
    }
    if (!secureEqual(request.headers.get('Authorization'), 'Bearer ' + env.ADMIN_TOKEN)) {
      return reply({ error: 'unauthorized' }, 401);
    }
    if (!((request.method === 'GET' && path === '/status') ||
          (request.method === 'POST' && (path === '/init' || path === '/run')))) {
      return reply({ error: 'not_found' }, 404);
    }
    const id = env.SIGNER.idFromName('global');
    const stub = env.SIGNER.get(id);
    return stub.fetch('https://do.internal' + path, { method: request.method });
  },
  async scheduled(event, env, ctx) {
    if (!env.ABLESCI_ACCOUNTS) {
      console.error('ABLESCI_ACCOUNTS Secret is missing');
      return;
    }
    const id = env.SIGNER.idFromName('global');
    const stub = env.SIGNER.get(id);
    // Cron triggers use UTC; fallback 15:45 UTC = 23:45 Beijing.
    const action = event.cron === '45 15 * * *' ? '/fallback' : '/init';
    ctx.waitUntil(stub.fetch('https://do.internal' + action, { method: 'POST' }));
  }
};

export class SignScheduler extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.busy = false;
  }
  async current() {
    return await this.ctx.storage.get('daily') || null;
  }
  async save(state) {
    await this.ctx.storage.put('daily', state);
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/status') {
      const state = await this.current();
      const keys = Object.values(state?.results || {});
      return reply({
        date: state?.date || null,
        targetBeijing: state?.target ? new Date(state.target + 8 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' (UTC+8)' : null,
        completed: keys.filter(x => x.ok).length,
        attempted: keys.filter(x => x.attempts > 0).length,
        nextWake: await this.ctx.storage.getAlarm(),
        lastRun: state?.lastRun || null,
        lastError: state?.lastError || null,
        busy: this.busy
      });
    }
    if (request.method !== 'POST' || !['/init', '/run', '/fallback'].includes(path)) {
      return reply({ error: 'not_found' }, 404);
    }
    if (this.busy) return reply({ ok: false, detail: 'already_running' }, 409);
    try {
      if (path === '/init') {
        const state = await this.ensureToday();
        return reply({ ok: true, date: state.date, target: state.target, alreadyScheduled: true });
      }
      if (!inSignWindow()) return reply({ ok: false, detail: 'outside_sign_window' }, 403);
      const state = await this.ensureToday();
      return reply(await this.execute(state, path === '/fallback'));
    } catch (error) {
      console.error('SignScheduler: internal execution error (sensitive data omitted)');
      return reply({ ok: false, detail: 'internal_error' }, 500);
    }
  }
  async ensureToday(schedule = true) {
    const now = Date.now();
    const day = beijingDay(now);
    let state = await this.current();
    if (state?.date !== day) {
      state = { date: day, target: randomTarget(day), results: {}, lastRun: null, lastError: null };
      await this.save(state);
    }
    // If no alarm exists, restore it. A target in the past is scheduled immediately
    // within allowed hours; after 21:30 use 23:45 fallback instead.
    if (schedule && await this.ctx.storage.getAlarm() === null) {
      const fallback = atBeijing(day, 23, 45);
      const earliest = atBeijing(day, 7, 30);
      const latest = atBeijing(day, 21, 30);
      const allSucceeded = await this.allDone(state);
      if (!allSucceeded) {
        if (now < earliest) await this.ctx.storage.setAlarm(state.target);
        else if (now < latest) await this.ctx.storage.setAlarm(Math.max(now + 1000, state.target));
        else if (now < fallback) await this.ctx.storage.setAlarm(fallback);
      }
    }
    return state;
  }
  async allDone(state) {
    const accounts = parseAccounts(this.env.ABLESCI_ACCOUNTS);
    if (!accounts.length) return true;
    for (const account of accounts) {
      const key = await accountKey(account.email);
      if (!state.results?.[key]?.ok) return false;
    }
    return true;
  }
  async execute(state, final = false) {
    if (this.busy) return { ok: false, detail: 'already_running' };
    this.busy = true;
    try {
      const now = Date.now();
      if (state.date !== beijingDay(now) || !inSignWindow(now)) {
        return { ok: false, detail: 'outside_sign_window' };
      }
      const accounts = parseAccounts(this.env.ABLESCI_ACCOUNTS);
      if (!accounts.length) return { ok: false, detail: 'no_accounts' };
      let attempted = 0;
      for (const account of accounts) {
        const key = await accountKey(account.email);
        const prior = state.results[key] || { ok: false, attempts: 0 };
        if (prior.ok) continue;
        const result = await signAccount(account.email, account.password);
        state.results[key] = {
          ok: result.ok,
          detail: result.detail,
          attempts: prior.attempts + 1,
          checked: Date.now()
        };
        attempted++;
        // Persist after each account: a crash cannot erase previous successes.
        await this.save(state);
      }
      state.lastRun = Date.now();
      state.lastError = null;
      await this.save(state);
      const success = Object.values(state.results).filter(x => x.ok).length;
      const failed = accounts.length - success;
      if (failed === 0) {
        await this.ctx.storage.deleteAlarm();
      } else if (failed > 0 && !final) {
        const deadline = atBeijing(state.date, 23, 45);
        const when = Date.now() + (5 * 60 + randomInt(26 * 60)) * 1000;
        if (when < deadline) await this.ctx.storage.setAlarm(when);
        else if (Date.now() < deadline) await this.ctx.storage.setAlarm(deadline);
      }
      try {
        if (attempted > 0) {
          await notify(this.env, '科研通随机签到', '北京时间日期：' + state.date +
            '\n账号总数：' + accounts.length + '\n成功/已签到：' + success +
            '\n待补签：' + failed + '\n本轮尝试：' + attempted);
        }
      } catch { console.warn('notification request failed'); }
      return { ok: failed === 0, date: state.date, attempted, completed: success, pending: failed };
    } finally {
      this.busy = false;
    }
  }
  async alarm() {
    if (this.busy) return;
    let state = await this.ensureToday(false);
    const now = Date.now();
    if (now < state.target || !inSignWindow(now)) {
      if (now < state.target) await this.ctx.storage.setAlarm(state.target);
      return;
    }
    // Do not sign on an expired day / outside the 07:30–23:59 window.
    const final = now >= atBeijing(state.date, 23, 45);
    await this.execute(state, final);
  }
}
