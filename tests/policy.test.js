import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ATTEMPTS, canAttempt, isRiskHttp, isRiskText } from '../src/policy.js';

test('exactly one initial attempt and two retries', () => {
  assert.equal(MAX_ATTEMPTS, 3);
  assert.equal(canAttempt(undefined), true);
  assert.equal(canAttempt({ ok: false, attempts: 1 }), true);
  assert.equal(canAttempt({ ok: false, attempts: 2 }), true);
  assert.equal(canAttempt({ ok: false, attempts: 3 }), false);
  assert.equal(canAttempt({ ok: true, attempts: 1 }), false);
});
test('risk-stopped records and site-wide stop cannot retry', () => {
  assert.equal(canAttempt({ok:false,attempts:1,blocked:true}),false);
  assert.equal(canAttempt({ok:false,attempts:0},true),false);
});
test('403, 429 and captcha / rate-limit signals stop requests', () => {
  assert.equal(isRiskHttp(403), true);
  assert.equal(isRiskHttp(429), true);
  assert.equal(isRiskHttp(500), false);
  for (const text of ['请完成验证码', '风控触发', 'Too Many Requests', 'captcha challenge', 'cf-chl']) {
    assert.equal(isRiskText(text),true,text);
  }
  assert.equal(isRiskText('签到成功，增加积分'),false);
});
