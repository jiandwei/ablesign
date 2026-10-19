export const DAY_MS = 86_400_000;
export const BEIJING_OFFSET_MS = 8 * 3_600_000;
export function beijingDay(now = Date.now()) {
  return new Date(now + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}
export function beijingMinute(now = Date.now()) {
  const d = new Date(now + BEIJING_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
export function midnightUtc(day) {
  return Date.parse(day + 'T00:00:00Z') - BEIJING_OFFSET_MS;
}
export function atBeijing(day, h, m, s = 0) {
  return midnightUtc(day) + (h * 3600 + m * 60 + s) * 1000;
}
export function inSignWindow(now = Date.now()) {
  return beijingMinute(now) >= 450 && beijingMinute(now) < 1440;
}
export function randomInt(max) {
  if (!Number.isSafeInteger(max) || max < 1 || max > 0xffffffff) throw new Error('invalid random bound');
  const limit = Math.floor(0x100000000 / max) * max;
  const nums = new Uint32Array(1);
  do { crypto.getRandomValues(nums); } while (nums[0] >= limit);
  return nums[0] % max;
}
export function randomTarget(day) {
  // Beijing 07:30:00 inclusive through 21:29:59 inclusive (14 hours).
  return atBeijing(day, 7, 30) + randomInt(14 * 3600) * 1000;
}
export function parseAccounts(value = '') {
  const found = [], email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  for (const rawLine of String(value).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const matches = [...line.matchAll(email)];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      let segment = line.slice(match.index + match[0].length, i + 1 < matches.length ? matches[i + 1].index : undefined).trim();
      if (i + 1 < matches.length) segment = segment.replace(/[,;]\s*$/, '').trim();
      if (!/^[:|]/.test(segment)) continue;
      const password = segment.slice(1).trim();
      if (password) found.push({ email: match[0], password });
    }
  }
  return found;
}
export async function accountKey(email) {
  const bytes = new TextEncoder().encode(email.toLowerCase());
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, b => b.toString(16).padStart(2, '0')).join('');
}
export function nextDay(day) {
  return new Date(Date.parse(day + 'T00:00:00Z') + DAY_MS).toISOString().slice(0, 10);
}
