import test from 'node:test';
import assert from 'node:assert/strict';
import { cookieFingerprint, cookieObservation, maskAccount, activeCookieRecord } from '../src/cookie-status.js';
import { signAccount } from '../src/ablesci.js';

test('status does not disclose Cookie content and masks account', async () => {
  const secret = 'sid=this-is-test-only; csrf=example';
  const fp = await cookieFingerprint(secret);
  assert.match(fp, /^[a-f0-9]{64}$/);
  assert.ok(!fp.includes('sid='));
  assert.equal(maskAccount('someone@example.org'), 's***@example.org');
  assert.deepEqual(cookieObservation(fp, {cookieFingerprint:fp,cookieStatus:'valid',cookieCheckedAt:42}), {status:'valid',checkedAt:42});
});
test('unconfigured, unchecked, rotated and restricted states remain distinct', async () => {
  const old = await cookieFingerprint('sid=old');
  const fresh = await cookieFingerprint('sid=new');
  assert.deepEqual(cookieObservation(null),{status:'not_configured',checkedAt:null});
  assert.deepEqual(cookieObservation(fresh),{status:'unchecked',checkedAt:null});
  assert.deepEqual(cookieObservation(fresh,{cookieFingerprint:old,cookieStatus:'valid',cookieCheckedAt:200}),{status:'unchecked',checkedAt:null});
  assert.deepEqual(cookieObservation(old,{cookieFingerprint:old,cookieStatus:'restricted',cookieCheckedAt:200}),{status:'restricted',checkedAt:200});
  assert.deepEqual(cookieObservation(old,{cookieFingerprint:old,cookieStatus:'expired',cookieCheckedAt:210}),{status:'expired',checkedAt:210});
});
test('rotated Cookie clears expiry but preserves the daily attempt and password quotas', async () => {
  const original = await cookieFingerprint('sid=old');
  const rotated = await cookieFingerprint('sid=new');
  const record = {ok:false,attempts:2,passwordLoginUsed:true,cookieExpired:true,cookieFingerprint:original,cookieStatus:'expired',cookieCheckedAt:55};
  const next = activeCookieRecord(rotated,record);
  assert.equal(next.cookieExpired,false);
  assert.equal(next.cookieStatus,'unchecked');
  assert.equal(next.cookieCheckedAt,null);
  assert.equal(next.attempts,2);
  assert.equal(next.passwordLoginUsed,true);
  assert.equal(next.cookieFingerprint,rotated);
});
test('successful cookie sign reports observed validity without password login', async () => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({code:0}),{status:200});
  try{
    const result=await signAccount('test@example.com','pw','sid=test',async()=>{throw Error('should not login');});
    assert.equal(result.cookieStatus,'valid');
    assert.ok(result.cookieCheckedAt>0);
    assert.equal(result.mode,'cookie');
  } finally {globalThis.fetch=originalFetch;}
});
test('session expiry remains marked expired after successful password fallback', async () => {
  const originalFetch=globalThis.fetch;
  let called=0, reservations=0;
  globalThis.fetch=async()=>{
    called++;
    if(called===1)return new Response('session expired',{status:401});
    if(called===2)return new Response('<meta name="csrf-token" content="demo">',{status:200});
    return new Response(JSON.stringify({code:0}),{status:200});
  };
  try{
    const result=await signAccount('test@example.com','pw','sid=old',async()=>{reservations++;return true;});
    assert.equal(result.ok,true);
    assert.equal(result.mode,'password');
    assert.equal(result.cookieStatus,'expired');
    assert.ok(result.cookieCheckedAt>0);
    assert.equal(reservations,1);
    assert.equal(called,4);
  }finally{globalThis.fetch=originalFetch;}
});
test('403 does not misrepresent restriction as expired and skips password login', async () => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response('access denied',{status:403});
  try{
    const result=await signAccount('test@example.com','pw','sid=test',async()=>{throw Error('should not login');});
    assert.equal(result.blocked,true);
    assert.equal(result.cookieStatus,'restricted');
    assert.equal(result.mode,'cookie');
  }finally{globalThis.fetch=originalFetch;}
});
