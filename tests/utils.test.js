import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beijingDay, beijingMinute, atBeijing, randomTarget, parseAccounts,
  inSignWindow, nextDay, accountKey
} from '../src/utils.js';
import { extractCsrf, cookieHeader, updateCookies } from '../src/ablesci.js';

test('Beijing timezone across UTC midnight', () => {
  const t = Date.parse('2026-10-19T23:40:00Z');
  assert.equal(beijingDay(t), '2026-10-20');
  assert.equal(beijingMinute(t), 460);
  assert.equal(nextDay('2026-10-19'), '2026-10-20');
});
test('random target is inside 07:30:00 - 21:29:59 Beijing', () => {
  const start = atBeijing('2026-10-20', 7, 30);
  const end = atBeijing('2026-10-20', 21, 30);
  const draws = Array.from({length: 100}, () => randomTarget('2026-10-20'));
  assert.ok(draws.every(x => x >= start && x < end && x % 1000 === 0));
  assert.ok(new Set(draws).size > 1);
});
test('signing window lower and upper boundary', () => {
  assert.equal(inSignWindow(atBeijing('2026-10-20', 7, 29)), false);
  assert.equal(inSignWindow(atBeijing('2026-10-20', 7, 30)), true);
  assert.equal(inSignWindow(atBeijing('2026-10-20', 23, 59)), true);
  assert.equal(inSignWindow(atBeijing('2026-10-21', 0, 0)), false);
});
test('account parser allows two lines and punctuation in passwords', () => {
  assert.deepEqual(parseAccounts('a@example.com:pass,one;two\nb@example.com|secret'), [
    {email: 'a@example.com', password: 'pass,one;two'},
    {email: 'b@example.com', password: 'secret'}
  ]);
});
test('account parser compatible with old comma-separated accounts', () => {
  assert.deepEqual(parseAccounts('a@example.com:foo,b@example.com:bar'), [
    {email: 'a@example.com', password: 'foo'},
    {email: 'b@example.com', password: 'bar'}
  ]);
});
test('account key stable and opaque', async () => {
  const a = await accountKey('A@Example.com');
  assert.equal(a, await accountKey('a@example.com'));
  assert.match(a, /^[0-9a-f]{64}$/);
});
test('csrf extraction supports new meta and legacy input', () => {
  assert.equal(extractCsrf('<meta name="csrf-token" content="abc123">'), 'abc123');
  assert.equal(extractCsrf('<input type="hidden" name="_csrf" value="xyz789">'), 'xyz789');
});
test('cookie jar merges set-cookie without exposing attributes', () => {
  const jar = new Map();
  const response = {headers: {getSetCookie: () => ['_csrf=aaa; Path=/; HttpOnly', 'PHPSESSID=bbb; Path=/']}};
  updateCookies(jar, response);
  assert.equal(cookieHeader(jar), '_csrf=aaa; PHPSESSID=bbb');
});
