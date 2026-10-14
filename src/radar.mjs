import {payload,isFood,normalizeMenu,normalizeCoupons,normalizeStores,availableCoupons,campaignHints} from './adapters.mjs';
export {normalizeMenu,normalizeCoupons} from './adapters.mjs';
export function rankOffers(offers){
  return [...offers].sort((a,b)=>a.payableCents-b.payableCents||(a.distanceMeters??Infinity)-(b.distanceMeters??Infinity));
}
export function validateQuote(raw,candidate){
  let data;try{data=payload(raw);}catch{return null;}
  if(data?.price===null||data?.price===undefined||data?.price==='')return null;
  const payable=Number(data.price),{item,store,coupon}=candidate;
  if(!Number.isSafeInteger(payable)||payable<0||!isFood(item.name))return null;
  const matching=(data.productList||[]).find(p=>String(p.productCode??p.code)===item.code&&Number(p.quantity)>=1);
  if(!matching)return null;
  if(payable===0&&(!coupon?.id||!/(^免费|(?:^|\s)0(?:\.0+)?元)/.test(coupon.title)))return null;
  const discount=Number(data.discount),delivery=Number(data.deliveryFee??0);
  return {id:`${store.code}:${item.code}:${coupon?.id??'menu'}`,name:matching.productName||item.name,category:item.category,
    storeCode:store.code,storeName:store.name,distanceMeters:store.distanceMeters,
    payableCents:payable,discountCents:Number.isSafeInteger(discount)&&discount>=0?discount:0,
    deliveryCents:Number.isSafeInteger(delivery)&&delivery>=0?delivery:0,
    source:coupon?'coupon':'menu',couponTitle:coupon?.title??null,couponExpiresAt:coupon?.end?new Date(coupon.end).toISOString():null,
    reason:coupon?`使用「${coupon.title}」，当前门店已验证券后实付`:'当前门店菜单可售，官方计价已验证',
    steps:[`选择「${store.name}」到店取餐`,...(coupon?[`使用账户里的「${coupon.title}」`]:[]),`点「${matching.productName||item.name}」1 份`,'支付前核对麦当劳官方页面的最终金额'],
    verified:true,checkedAt:new Date().toISOString()};
}
async function call(client,name,values={}){return client.call(name,client.args(name,values));}
export async function scan(client,{address,city,category='all',maxStores=3,maxQuotes=24,radiusMeters=3000}={}){
  if(typeof address!=='string'||!address.trim()||address.length>200)throw new Error('请填写城市和附近地点，最多 200 字');
  if(!['all','meal','drink','snack'].includes(category))throw new Error('请选择有效的餐品分类');
  city=city?.trim()||address.match(/([^省自治区]{2,8}市)/)?.[1];
  maxStores=Math.max(1,Math.min(5,Math.floor(Number(maxStores)||3)));
  maxQuotes=Math.max(1,Math.min(100,Math.floor(Number(maxQuotes)||24)));
  const warnings=[];
  const stores=normalizeStores(await call(client,'query-nearby-stores',{beType:1,searchType:2,keyword:address,...(city?{city}:{})}));
  const selected=stores.filter(s=>s.distanceMeters!==null&&s.distanceMeters<=radiusMeters).slice(0,maxStores);
  if(stores.some(s=>s.distanceMeters===null))warnings.push('部分门店未提供距离，未纳入当前距离范围');
  let coupons=[],campaigns='';
  try{coupons=availableCoupons(await call(client,'available-coupons'));}catch{warnings.push('暂时无法获取可领取券');}
  try{campaigns=campaignHints(await call(client,'campaign-calendar'));}catch{warnings.push('暂时无法获取活动线索');}
  const pools=[];let queriedStores=0;
  for(const store of selected){
    const ctx={storeCode:store.code,beType:1,orderType:1};
    try{
      const menu=normalizeMenu(await call(client,'query-meals',ctx));
      let owned=[];try{owned=normalizeCoupons(await call(client,'query-store-coupons',ctx));}catch{warnings.push(`${store.name}：优惠券查询暂不可用`);}
      const base=menu.sort((a,b)=>(a.hintCents??Infinity)-(b.hintCents??Infinity)).map(item=>({item,store,ctx}));
      const withCoupons=owned.flatMap(coupon=>coupon.products.filter(p=>p.code&&isFood(p.name)).map(item=>({item,store,ctx,coupon})));
      // Coupon-specific product codes cannot be replaced with menu product codes.
      const seen=new Set();pools.push([...withCoupons,...base].filter(c=>{
        // Scope the candidates before truncation, so cheap drinks cannot crowd out meals.
        if(category!=='all'&&c.item.category!==category)return false;
        const key=`${c.item.code}:${c.coupon?.id??''}:${c.coupon?.instance??''}`;
        if(seen.has(key))return false;seen.add(key);return true;
      }));queriedStores++;
    }catch{warnings.push(`${store.name}：菜单暂不可用，已跳过`);}
  }
  const candidates=pools.reduce((n,p)=>n+p.length,0),offers=[];let quoted=0,index=0;
  // Round-robin prevents the first store from consuming the entire quote budget.
  while(quoted<maxQuotes){
    let found=false;
    for(const pool of pools){
      const c=pool[index];if(!c||quoted>=maxQuotes)continue;found=true;quoted++;
      const entry={productCode:c.item.code,quantity:1,...(c.coupon?{couponId:c.coupon.id,...(c.coupon.instance?{couponCode:c.coupon.instance}:{})}:{})};
      try{
        const raw=await call(client,'calculate-price',{...c.ctx,items:[entry],needTableware:false});
        const offer=validateQuote(raw,c);if(offer)offers.push(offer);
      }catch{warnings.push(`${c.store.name}：一个候选暂不可用，已跳过`);}
    }
    if(!found)break;index++;
  }
  return {mode:'live',offers:rankOffers(offers),coupons,campaigns,warnings,checkedAt:new Date().toISOString(),
    coverage:{category,stores:queriedStores,foundStores:stores.length,candidates,quoted,truncated:quoted<candidates||selected.length<stores.length,maxQuotes,radiusMeters,orderMode:'到店取餐',statement:'本次查询范围内、已通过官方计价的最低实付；未覆盖候选不作价格承诺'}};
}
