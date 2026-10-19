export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>AbleSign · 科研通签到控制台</title>
<style>
:root{font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#142130;background:#f4f7fb;color-scheme:light}
*{box-sizing:border-box}
body{margin:0;min-height:100vh}
header{background:#102947;color:white;padding:29px 24px 76px}
.wrap{max-width:940px;margin:auto}
.brand{display:flex;align-items:center;gap:12px;font-weight:740;font-size:22px}
.mark{width:38px;height:38px;border-radius:12px;background:#3fd6bd;color:#093b45;display:grid;place-items:center;font-size:22px;font-weight:850}
.sub{margin:15px 0 0;color:#bcd0df;font-size:14px;line-height:1.8}
main{max-width:940px;margin:-51px auto 32px;padding:0 18px;position:relative}
.card{background:#fff;border-radius:16px;border:1px solid #e3eaf1;box-shadow:0 5px 24px rgba(26,47,80,.055);padding:23px;margin-bottom:17px}
h1{margin:0 0 14px;font-size:18px}
p{line-height:1.7}
.muted{color:#62768a;font-size:13px}
.auth{display:flex;gap:10px;align-items:flex-end}
.field{flex:1}
label{display:block;font-size:13px;font-weight:650;margin:0 0 8px;color:#43596e}
input{height:43px;padding:0 13px;width:100%;font-size:14px;border:1px solid #c9d5e1;border-radius:9px;background:#fff;color:#112a42}
input:focus{outline:2px solid #67b4df;outline-offset:1px}
button{border:0;border-radius:9px;padding:12px 16px;font-size:14px;font-weight:650;cursor:pointer;background:#1364c3;color:#fff;min-height:43px}
button.secondary{background:#eaf2fb;color:#1e5b93}
button.warn{background:#fcf0db;color:#956316}
button:disabled{opacity:.48;cursor:not-allowed}
.toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.metric{background:#f6f9fd;border:1px solid #eaf0f7;border-radius:12px;padding:17px 15px;min-height:102px}
.metric .num{font-size:22px;font-weight:780;line-height:1.5;overflow-wrap:anywhere}
.metric .small{color:#617589;font-size:12px}
.details{display:grid;grid-template-columns:150px 1fr;gap:14px 10px;font-size:14px}
.details dt{color:#62768a}.details dd{margin:0;overflow-wrap:anywhere}
.cookie-list{display:grid;gap:9px;margin:12px 0}
.cookie-entry{border:1px solid #e5edf5;border-radius:9px;padding:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cookie-entry strong{font-size:13px;font-weight:650;min-width:120px}
.cookie-entry small{color:#62768a;font-size:12px}
.cookie-tag{font-size:12px;padding:5px 9px;border-radius:20px;background:#eff3f8;color:#48637b}
.cookie-tag.valid{background:#e4f7e9;color:#17753d}
.cookie-tag.expired,.cookie-tag.restricted{background:#fff0e9;color:#a14c18}
.notice{padding:13px;border-radius:9px;background:#eff6ff;color:#1b5387;font-size:14px;min-height:45px;line-height:1.55}
.notice.success{background:#eaf9ef;color:#126b37}
.notice.error{background:#fff0ef;color:#a52b24}
footer{text-align:center;font-size:12px;color:#748699;padding:8px 16px 30px}
footer a{color:#527bad}
[hidden]{display:none!important}
@media(max-width:670px){.auth{display:block}.auth button{width:100%;margin-top:10px}.metrics{grid-template-columns:1fr}.details{grid-template-columns:1fr;gap:5px}.details dd{margin-bottom:12px}main{padding:0 12px}.card{padding:17px}}
</style>
</head>
<body>
<header><div class="wrap">
<div class="brand"><span class="mark">✓</span><span>AbleSign</span></div>
<p class="sub">科研通 · Cloudflare Workers 随机签到控制台<br>每天独立随机抽取签到时间，任务状态由 Durable Object 保存。</p>
</div></header>
<main>
<section class="card">
<h1>管理员验证</h1>
<p class="muted">输入 Cloudflare Secrets 中的 ADMIN_TOKEN。口令仅在当前页面内存中使用，不写入浏览器存储，也不会放入 URL。</p>
<div class="auth">
<div class="field"><label for="token">ADMIN_TOKEN</label><input type="password" id="token" autocomplete="off" spellcheck="false" placeholder="输入至少 32 位的管理员口令"></div>
<button id="connect" type="button">连接并查看状态</button>
<button id="forget" type="button" class="secondary" hidden>清除口令</button>
</div>
</section>
<section class="card" aria-label="结果提示">
<div id="notice" class="notice" role="status" aria-live="polite">请输入管理员口令，连接后查看今天的签到计划。</div>
</section>
<section class="card" id="dashboard" hidden>
<h1>今日签到概况</h1>
<div class="metrics">
<div class="metric"><div class="small">计划日期 · 北京时间</div><div id="date" class="num">—</div></div>
<div class="metric"><div class="small">已签到账号</div><div id="completed" class="num">—</div></div>
<div class="metric"><div class="small">已尝试账号</div><div id="attempted" class="num">—</div></div>
</div>
<dl class="details">
<dt>真正随机目标时间</dt><dd id="target">—</dd>
<dt>下次计划唤醒</dt><dd id="next">—</dd>
<dt>最近执行时间</dt><dd id="last">—</dd>
<dt>当前任务状态</dt><dd id="busy">—</dd>
<dt>风控停止</dt><dd id="risk">—</dd>
<dt>每日尝试上限</dt><dd id="limit">—</dd>
<dt>已使用密码登录配额的账号数</dt><dd id="pwlogins">—</dd>
</dl>
<h2 style="font-size:15px;margin:20px 0 8px">Cookie 验证状态</h2>
<div id="cookies" class="cookie-list" role="list" aria-live="polite"></div>
<p class="muted">仅显示最近一次实际签到请求的观察结果，不会因为查看状态而向科研通额外发起请求。“上次有效”不保证此刻仍有效；更换 Cookie 后显示“尚未验证”，直到下次使用。</p>
<div class="toolbar">
<button id="refresh" type="button" class="secondary">刷新状态</button>
<button id="init" type="button">生成 / 恢复今日计划</button>
<button id="run" type="button" class="warn">立即签到 / 补签</button>
</div>
<p class="muted">生成计划只会抽取并保存随机时间；“立即签到”会绕过随机目标时间，只处理尚未成功的账号。页面显示的是计划目标，实际执行时间可能受平台调度影响。</p>
</section>
</main>
<footer>不上传管理员口令到 GitHub · <a href="https://github.com/jiandwei/ablesign" target="_blank" rel="noopener noreferrer">项目源码</a></footer>
<script>
(function(){
'use strict';
var token = '';
var busy = false;
var byId = function(id){return document.getElementById(id);};
var actions = ['connect','refresh','init','run'];
function display(id,val){byId(id).textContent = val == null || val === '' ? '—' : String(val);}
function message(text,type){
 var n=byId('notice');
 n.textContent=text;
 n.className='notice'+(type?' '+type:'');
}
function showBusy(value){
 busy=value;
 for(var i=0;i<actions.length;i++) byId(actions[i]).disabled=value;
}
function beijing(ts){
 if(!ts)return '—';
 var d=new Date(ts);
 return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('zh-CN',{
  timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
 }).format(d)+'（北京时间）':'—';
}
async function api(path, method){
 var response = await fetch(path, {
  method:method||'GET',
  headers:{'Authorization':'Bearer '+token,'Accept':'application/json'},
  cache:'no-store',
  credentials:'omit',
  redirect:'error'
 });
 var body;
 try{body=await response.json();}catch(e){throw new Error('服务器返回了无法识别的响应');}
 if(!response.ok){
  if(response.status===401)throw new Error('管理员口令不正确，请检查 ADMIN_TOKEN');
  if(response.status===503)throw new Error('请确认 Cloudflare 已配置 ABLESCI_ACCOUNTS 与 ADMIN_TOKEN Secrets');
  if(response.status===403)throw new Error('当前不在北京时间 07:30–23:59 的签到窗口');
  throw new Error(body.detail||body.error||('请求失败 HTTP '+response.status));
 }
 return body;
}
var cookieLabels = {
 not_configured:'未配置', unchecked:'尚未验证', valid:'上次验证有效',
 expired:'已失效', restricted:'访问受限，无法确认', unknown:'无法确认'
};
function renderCookies(accounts){
 var root=byId('cookies');
 root.replaceChildren();
 if(!Array.isArray(accounts)||accounts.length===0){
  var empty=document.createElement('p');
  empty.className='muted';
  empty.textContent='暂无账号记录。';
  root.appendChild(empty);
  return;
 }
 for(var i=0;i<accounts.length;i++){
  var account=accounts[i];
  var item=document.createElement('div');
  item.className='cookie-entry';
  item.setAttribute('role','listitem');
  var name=document.createElement('strong');
  name.textContent=account.account||('账号 '+(i+1));
  var tag=document.createElement('span');
  tag.className='cookie-tag '+(cookieLabels[account.status]?account.status:'unknown');
  tag.textContent=cookieLabels[account.status]||'无法确认';
  var checked=document.createElement('small');
  checked.textContent=account.checkedAt?'最近验证：'+beijing(account.checkedAt):'无验证记录';
  item.appendChild(name);
  item.appendChild(tag);
  item.appendChild(checked);
  root.appendChild(item);
 }
}
function render(state){
 display('date',state.date);
 display('completed',state.completed);
 display('attempted',state.attempted);
 display('target',state.targetBeijing);
 display('next',beijing(state.nextWake));
 display('last',beijing(state.lastRun));
 display('busy',state.busy?'执行中':'等待调度');
 display('risk',state.riskStopped?'已停止今日全部签到':'未触发');
 display('pwlogins',state.passwordLogins);
 renderCookies(state.cookieAccounts);
 display('limit',state.maxAttemptsPerAccount ? '每账号 '+state.maxAttemptsPerAccount+' 次（首次 + 重试）' : '—');
 byId('dashboard').hidden=false;
}
async function load(){
 var data=await api('/status');
 render(data);
 return data;
}
byId('connect').addEventListener('click',async function(){
 if(busy)return;
 var value=byId('token').value.trim();
 if(!value){message('请先输入 ADMIN_TOKEN。','error');return;}
 token=value;
 showBusy(true);
 try{
  await load();
  byId('token').value='';
  byId('forget').hidden=false;
  message('连接成功！可以直接在页面查看或操作签到任务。','success');
 }catch(err){
  token='';
  byId('dashboard').hidden=true;
  message(err.message,'error');
 }finally{showBusy(false);}
});
byId('forget').addEventListener('click',function(){
 token='';
 byId('dashboard').hidden=true;
 byId('forget').hidden=true;
 byId('token').value='';
 message('已清除当前页面中的口令。','success');
});
byId('refresh').addEventListener('click',async function(){
 if(!token||busy)return;
 showBusy(true);
 try{await load();message('状态已更新。','success');}
 catch(err){message(err.message,'error');}
 finally{showBusy(false);}
});
byId('init').addEventListener('click',async function(){
 if(!token||busy)return;
 showBusy(true);
 try{
  await api('/init','POST');
  await load();
  message('今日随机签到计划已生成或恢复；重复点击不会重新抽签。','success');
 }catch(err){message(err.message,'error');}
 finally{showBusy(false);}
});
byId('run').addEventListener('click',async function(){
 if(!token||busy)return;
 if(!confirm('确认立即尝试签到尚未完成的科研通账号吗？这会绕过今天的随机目标时间。'))return;
 showBusy(true);
 try{
  var result=await api('/run','POST');
  await load();
  message('执行完成：成功 '+result.completed+' 个，待补签 '+result.pending+' 个。'+(result.riskStopped?' 检测到风控，今日已停止。':''),result.ok?'success':'error');
 }catch(err){message(err.message,'error');}
 finally{showBusy(false);}
});
byId('token').addEventListener('keydown',function(ev){
 if(ev.key==='Enter')byId('connect').click();
});
})();
</script>
</body>
</html>`;
