async function post(url, body, headers = {}) {
  const resp = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
  return resp.ok;
}
export async function notify(env, title, message) {
  const tasks = [];
  if (env.PUSH_PLUS_TOKEN) {
    tasks.push(post('https://www.pushplus.plus/send', JSON.stringify({
      token: env.PUSH_PLUS_TOKEN, title, content: message
    }), { 'Content-Type': 'application/json' }));
  }
  if (env.SCKEY) {
    tasks.push(post('https://sctapi.ftqq.com/' + encodeURIComponent(env.SCKEY) + '.send',
      new URLSearchParams({ text: title, desp: message }),
      { 'Content-Type': 'application/x-www-form-urlencoded' }));
  }
  if (env.XZKEY) {
    tasks.push(post('https://xizhi.qqoq.net/' + encodeURIComponent(env.XZKEY) + '.send',
      JSON.stringify({ title, content: message }),
      { 'Content-Type': 'application/json' }));
  }
  const outcomes = await Promise.allSettled(tasks);
  return { attempted: tasks.length, accepted: outcomes.filter(x => x.status === 'fulfilled' && x.value).length };
}
