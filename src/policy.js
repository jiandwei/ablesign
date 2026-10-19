// Conservative limits: one random initial attempt plus at most two retries per account per Beijing day.
export const MAX_ATTEMPTS = 3;
export function canAttempt(record, riskStopped = false) {
  return !riskStopped && !record?.ok && !record?.blocked && (record?.attempts || 0) < MAX_ATTEMPTS;
}
export function isRiskHttp(status) {
  return status === 403 || status === 429;
}
export function isRiskText(text = '') {
  return /验证码|人机验证|安全验证|风控|访问过于频繁|请求过于频繁|操作频繁|稍后再试|captcha|verify you are human|access denied|too many requests|rate.limit|cloudflare challenge|cf-chl|challenge-platform/i.test(String(text));
}
export function failure(detail, blocked = false) {
  return { ok: false, detail, blocked };
}
