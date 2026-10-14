import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMenu, normalizeCoupons, validateQuote, scan, rankOffers } from '../src/radar.mjs';

const context={code:'A',name:'测试门店',distanceMeters:600};
const item={code:'10',name:'脆薯饼',category:'snack'};
const quote=(price=500)=>({success:true,data:{price,discount:0,productList:[{productCode:'10',quantity:1,productName:'脆薯饼'}]}});
test('minimum outlay wins across stores; closer breaks a price tie',()=>{
  const offers=[{id:'a',payableCents:990,distanceMeters:100},{id:'b',payableCents:500,distanceMeters:900},{id:'c',payableCents:500,distanceMeters:300}];
  assert.deepEqual(rankOffers(offers).map(x=>x.id),['c','b','a']);
});
test('menu prices are yuan hints and cards/condiments are not recommendations',()=>{
  const menu=normalizeMenu({data:{meals:{'10':{name:'脆薯饼',currentPrice:'8.5'},'20':{name:'麦金卡',currentPrice:'0'},'30':{name:'番茄酱',currentPrice:'0'},'40':{name:'冰美式',currentPrice:'9.9'}}}});
  assert.deepEqual(menu.map(x=>[x.code,x.hintCents]),[['10',850],['40',990]]);
});
test('missing, fractional and mismatched quotes never become cheap recommendations',()=>{
  for(const raw of [{data:{}},quote(-1),quote(0.1),{data:{price:0,productList:[]}},{data:{price:100,productList:[{productCode:'WRONG',quantity:1}]}}]){
    assert.equal(validateQuote(raw,{item,store:context}),null);
  }
});
test('zero requires an identified free coupon and matching official product',()=>{
  assert.equal(validateQuote(quote(0),{item,store:context}),null);
  const candidate={item,store:context,coupon:{id:'coupon',title:'免费脆薯饼'}};
  assert.equal(validateQuote(quote(0),candidate).payableCents,0);
  assert.equal(validateQuote(quote(0),{...candidate,coupon:{id:'coupon',title:'满50减10'}}),null);
});
test('coupon product codes are retained and expired coupons are removed',()=>{
  const c=normalizeCoupons({data:[{couponId:'c',couponCode:'instance',title:'免费脆薯饼',tradeDateTime:'2026-10-10 10:30:00-2026-10-20 23:59:59',products:[{productCode:'COUPON-10',productName:'脆薯饼'}]},{couponId:'expired',title:'过期',endTime:'2020-01-01 00:00:00',products:[{productCode:'1'}]}]},new Date('2026-10-14T04:00:00Z'));
  assert.equal(c.length,1); assert.equal(c[0].products[0].code,'COUPON-10');
});
test('scan uses coupon codes in items, verifies per store, and survives rejected candidates',async()=>{
  const calls=[];
  const client={args:(_n,a)=>a,call:async(name,args)=>{
    calls.push([name,args]);
    if(name==='query-nearby-stores')return {data:[{storeCode:'A',storeName:'近店',distance:100},{storeCode:'B',storeName:'远店',distance:600}]};
    if(name==='available-coupons')return '### 麦麦省优惠券列表：\n- 优惠券标题：免费脆薯饼 \\\n  状态：可领取';
    if(name==='campaign-calendar')return '活动线索';
    if(name==='query-meals')return {data:{meals:{'10':{name:'冰美式',currentPrice:'9.9'}}}};
    if(name==='query-store-coupons')return {data:[{couponId:'c',couponCode:'instance',title:'免费脆薯饼',products:[{productCode:'COUPON-10',productName:'脆薯饼'}]}]};
    if(name==='calculate-price'){
      const code=args.items[0].productCode;
      if(code==='COUPON-10'&&args.storeCode==='A')throw new Error('out of stock');
      return {data:{price:code==='COUPON-10'?0:990,productList:[{productCode:code,quantity:1,productName:code==='COUPON-10'?'脆薯饼':'冰美式'}]}};
    }
    throw new Error('unexpected tool');
  }};
  const result=await scan(client,{address:'测试地址',maxStores:2,maxQuotes:8});
  assert.equal(result.offers[0].storeCode,'B'); assert.equal(result.offers[0].payableCents,0);
  assert.equal(result.coverage.quoted,4); assert.equal(result.warnings.length,1);
  const cp=calls.find(([n,a])=>n==='calculate-price'&&a.items[0].productCode==='COUPON-10')[1];
  assert.equal(cp.items[0].couponId,'c'); assert.equal(cp.items[0].couponCode,'instance');
  assert.equal(result.coupons[0].status,'可领取');
});
test('scan records truncation and does not claim exhaustive minimum',async()=>{
  const client={args:(_n,a)=>a,call:async(name,args)=>{
    if(name==='query-nearby-stores')return {data:[{storeCode:'A',storeName:'近店',distance:100}]};
    if(name==='available-coupons'||name==='campaign-calendar')return '';
    if(name==='query-store-coupons')return {data:[]};
    if(name==='query-meals')return {data:{meals:{'10':{name:'冰美式',currentPrice:'9.9'},'11':{name:'薯条',currentPrice:'12'}}}};
    return {data:{price:990,productList:[{productCode:args.items[0].productCode,quantity:1}]}};
  }};
  const result=await scan(client,{address:'地址',maxQuotes:1});
  assert.equal(result.coverage.truncated,true);assert.equal(result.coverage.candidates,2);assert.equal(result.coverage.quoted,1);
});
test('address city is supplied even though the discovery schema marks it optional',async()=>{
  const client={args:(_n,a)=>a,call:async(name,args)=>{
    if(name==='query-nearby-stores'){assert.equal(args.city,'佛山市');return {data:[]};}
    return '';
  }};
  await scan(client,{address:'广东省佛山市测试商场'});
});
test('standalone sauce is excluded but a burger containing sauce remains food',()=>{
 const items=normalizeMenu({data:{meals:{a:{name:'韩式烟熏芝士风味酱',currentPrice:'3'},b:{name:'北美招牌牧场酱',currentPrice:'3'},c:{name:'芝士酱鸡腿堡',currentPrice:'20'}}}});
 assert.deepEqual(items.map(x=>x.code),['c']);
});
test('water is a drink and a meal containing cola stays a meal',()=>{
 const menu=normalizeMenu({data:{meals:{a:{name:'纯悦',currentPrice:'7.5'},b:{name:'汉堡可乐双人餐',currentPrice:'30'}}}});
 assert.deepEqual(menu.map(x=>x.category),['drink','meal']);
});
test('meal search reserves its quote budget for meals even behind many cheap snacks',async()=>{
 const calls=[];
 const meals=Object.fromEntries(Array.from({length:30},(_,i)=>[`s${i}`,{name:'圆筒冰淇淋',currentPrice:'5'}]));
 meals.burger={name:'吉士汉堡',currentPrice:'12'};
 const client={args:(_n,a)=>a,call:async(name,args)=>{
  if(name==='query-nearby-stores')return {data:[{storeCode:'A',storeName:'近店',distance:100}]};
  if(name==='query-meals')return {data:{meals}};
  if(name==='query-store-coupons')return {data:[{couponId:'drink-coupon',title:'9.9元冰美式',products:[{productCode:'coffee',productName:'冰美式'}]}]};
  if(name==='calculate-price'){calls.push(args.items[0].productCode);return {data:{price:1200,productList:[{productCode:args.items[0].productCode,quantity:1}]}};}
  return '';
 }};
 const result=await scan(client,{address:'商场',category:'meal',maxQuotes:24});
 assert.deepEqual(calls,['burger']);
 assert.equal(result.offers[0].category,'meal');
 assert.equal(result.coverage.category,'meal');
 assert.equal(result.coverage.candidates,1);
});
test('unsupported categories fail before calling official tools',async()=>{
 const client={call:()=>{throw new Error('should not call');}};
 await assert.rejects(scan(client,{address:'商场',category:'unknown'}),/餐品分类/);
});
