import test from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD_HTML } from '../src/dashboard.js';

test('dashboard renders a standalone management page', () => {
  assert.match(DASHBOARD_HTML, /<html lang="zh-CN">/);
  assert.match(DASHBOARD_HTML, /id="token"/);
  assert.match(DASHBOARD_HTML, /id="dashboard"/);
  assert.match(DASHBOARD_HTML, /\/status/);
  assert.match(DASHBOARD_HTML, /\/init/);
  assert.match(DASHBOARD_HTML, /\/run/);
});
test('dashboard does not persist the admin token to browser storage or URL', () => {
  assert.doesNotMatch(DASHBOARD_HTML, /localStorage|sessionStorage|document\.cookie/);
  assert.match(DASHBOARD_HTML, /headers:\{'Authorization':'Bearer '\+token/);
});
