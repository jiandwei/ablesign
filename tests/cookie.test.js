import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredAccounts, cleanCookie } from '../src/credentials.js';
import { sessionExpiredResponse, signAccount } from '../src/ablesci.js';
import { canAttempt } from '../src/policy.js';

test('single account Cookie secret mapping, without exposing values', () => {
  const accounts = configuredAccounts({
    ABLESCI_ACCOUNTS: 'user@example.com:password',
    ABLESCI_COOKIE: 'cookie: sid=example; csrf=test'
  });
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].cookie, 'sid=example; csrf=test');
});
test('multi-account mapping is case-insensitive', () => {
  const accounts = configuredAccounts({
    ABLESCI_ACCOUNTS: 'user@example.com:one\nother@example.com:two',
    ABLESCI_COOKIES: JSON.stringify({ 'USER@EXAMPLE.COM': 'sid=one', 'other@example.com': 'sid=two' })
  });
  assert.deepEqual(accounts.map(a => a.cookie), ['sid=one', 'sid=two']);
});
test('no single Cookie reuse across multiple accounts', () => {
  assert.throws(() => configuredAccounts({
    ABLESCI_ACCOUNTS: 'a@example.com:one\nb@example.com:two', ABLESCI_COOKIE: 'sid=x'
  }));
});
test('cookie secret refuses control characters', () => {
  assert.throws(() => cleanCookie('sid=x\r\nInjected: true'));
});
test('only explicit expiration triggers login fallback', () => {
  assert.equal(sessionExpiredResponse(401), true);
  assert.equal(sessionExpiredResponse(302, '/site/login?return=%2F'), true);
  assert.equal(sessionExpiredResponse(200, '', '请先登录'), true);
  assert.equal(sessionExpiredResponse(200, '', '成功'), false);
  assert.equal(sessionExpiredResponse(403), false);
});
test('successful Cookie sign does not consume password login', async () => {
  const originalFetch = globalThis.fetch;
  let called = 0;
  globalThis.fetch = async (_url, options) => {
    called++;
    assert.match(options.headers.get('cookie'), /sid=example/);
    return new Response(JSON.stringify({ code: 0, msg: '签到成功' }), { status: 200 });
  };
  try {
    let reserved = 0;
    const result = await signAccount('user@example.com', 'pw', 'sid=example', async () => { reserved++; return true; });
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'cookie');
    assert.equal(called, 1);
    assert.equal(reserved, 0);
  } finally { globalThis.fetch = originalFetch; }
});
test('expired Cookie triggers password login once with reservation', async () => {
  const originalFetch = globalThis.fetch;
  let called = 0, reserved = 0;
  globalThis.fetch = async (url, options) => {
    called++;
    if (called === 1) return new Response('login required', { status: 401 });
    if (called === 2) return new Response('<meta name="csrf-token" content="fake-token">', { status: 200 });
    if (called === 3) return new Response(JSON.stringify({code:0}), {status:200});
    return new Response(JSON.stringify({code:0}), {status:200});
  };
  try {
    const result = await signAccount('user@example.com', 'pw', 'sid=expired', async () => { reserved++; return true; });
    assert.equal(result.ok, true);
    assert.equal(result.cookieExpired, true);
    assert.equal(result.mode, 'password');
    assert.equal(reserved, 1);
    assert.equal(called, 4);
  } finally { globalThis.fetch = originalFetch; }
});
test('403 on Cookie request stops without password login', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('restricted', { status:403 });
  try {
    let reserved = 0;
    const result = await signAccount('user@example.com', 'pw', 'sid=example', async () => { reserved++; return true; });
    assert.equal(result.blocked, true);
    assert.equal(reserved, 0);
  } finally { globalThis.fetch = originalFetch; }
});
test('expired Cookie + used password allowance becomes ineligible', () => {
  assert.equal(canAttempt({ attempts: 1, cookieExpired: true, passwordLoginUsed: true }, false, true), false);
  assert.equal(canAttempt({ attempts: 1, cookieExpired: false, passwordLoginUsed: true }, false, true), true);
  assert.equal(canAttempt({ attempts: 1, passwordLoginUsed: true }, false, false), false);
});
