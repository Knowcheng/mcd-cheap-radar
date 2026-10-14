import test from 'node:test';import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';

async function app(t,overrides={}){
 const events=[];
 const server=createApp({clientFactory:token=>({connect:async()=>{},args:(_n,a)=>a,close(){events.push(['closed',token]);},call:async n=>{events.push([n,token]);return {success:true,data:[{couponName:'免费测试',label:'已领取'}]};}}),...overrides});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 async function request(path,body,cookie,origin=base,method='POST'){
  const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:res.status,cookie:res.headers.get('set-cookie')?.split(';')[0],headers:res.headers,data:await res.json()};
 }return {request,events,base};
}
test('separate visitor sessions use their own account and never echo credentials',async t=>{
 const {request,events}=await app(t);
 const a=await request('/api/connect',{token:'test-account-a'}),b=await request('/api/connect',{token:'test-account-b'});
 assert.equal(a.status,200);assert.notEqual(a.cookie,b.cookie);assert.equal(a.headers.get('cache-control'),'no-store');
 const response=await request('/api/claim',{confirm:true},b.cookie);
 assert.equal(response.status,200);assert.ok(events.some(([n,token])=>n==='auto-bind-coupons'&&token==='test-account-b'));
 assert.ok(!events.some(([n,token])=>n==='auto-bind-coupons'&&token==='test-account-a'));
 assert.ok(!JSON.stringify(response.data).includes('test-account'));
});
test('claim requires explicit confirmation, account, and same-origin request',async t=>{
 const {request,events}=await app(t);const connected=await request('/api/connect',{token:'test-account'});
 assert.equal((await request('/api/claim',{},connected.cookie)).status,400);
 assert.equal((await request('/api/claim',{confirm:true},connected.cookie,'https://attacker.invalid')).status,403);
 assert.equal((await request('/api/claim',{confirm:true})).status,401);
 assert.equal(events.filter(([n])=>n==='auto-bind-coupons').length,0);
});
test('disconnect revokes account session and oversized credentials are rejected',async t=>{
 const {request}=await app(t);const a=await request('/api/connect',{token:'test-account'});
 await request('/api/session',undefined,a.cookie,undefined,'DELETE');
 assert.equal((await request('/api/claim',{confirm:true},a.cookie)).status,401);
 assert.equal((await request('/api/connect',{token:'a'.repeat(5000)})).status,400);
});
test('anonymous demo is explicit and cannot claim coupons',async t=>{
 const {request}=await app(t);const demo=await request('/api/demo',undefined,undefined,undefined,'GET');
 assert.equal(demo.status,200);assert.equal(demo.data.mode,'demo');
 assert.ok(demo.data.offers.every(o=>o.verified===false));
});
test('public deployment never accepts follower credentials',async t=>{
 const {request,events}=await app(t,{production:true,origin:'https://demo.example'});
 const result=await request('/api/connect',{token:'follower-token'},undefined,'https://demo.example');
 assert.equal(result.status,403);assert.equal(events.length,0);
 const status=await request('/api/session',undefined,undefined,undefined,'GET');assert.equal(status.data.accountEnabled,false);
});
test('a rejected concurrent request cannot release the running scan lock',async t=>{
 let enter,release;
 const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);
 const {request}=await app(t,{clientFactory:()=>({connect:async()=>{},close(){},args:(_n,a)=>a,call:async name=>{
  if(name==='query-nearby-stores')return {data:[{storeCode:'A',storeName:'门店',distance:100}]};
  if(name==='query-meals')return {data:{meals:{'10':{name:'冰美式',currentPrice:'9.9'}}}};
  if(name==='query-store-coupons')return {data:[]};
  if(name==='calculate-price'){enter();await wait;return {data:{price:990,productList:[{productCode:'10',quantity:1}]}};}
  return {success:true,data:[]};
 }})});
 const account=await request('/api/connect',{token:'test-account'});
 const scan=request('/api/scan',{city:'佛山市',address:'商场'},account.cookie);
 await entered;
 const first=await request('/api/claim',{confirm:true},account.cookie);
 const second=await request('/api/claim',{confirm:true},account.cookie);
 release();await scan;
 assert.equal(first.status,409);assert.equal(second.status,409);
});
