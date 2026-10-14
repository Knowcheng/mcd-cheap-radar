export function payload(raw){
  if(raw?.success===false)throw new Error('官方业务接口未返回可用结果');
  return raw?.data??raw;
}
const nonfood=/麦金卡|早餐卡|会员卡|权益卡|配送费|餐具|吸管|包装袋|纸袋|购物袋|手提袋|番茄酱|沙司|糖包|奶球|湿巾|餐巾|酱包/;
export const isFood=name=>typeof name==='string'&&name.trim().length>0&&!nonfood.test(name)&&!/(酱|沙司)(?:料|包)?(?:\([^)]*\))?$/.test(name);
export function categoryOf(name){
  if(/汉堡|鸡腿堡|卷|套餐|三件套|双人餐|松饼|早餐/.test(name))return 'meal';
  if(/咖啡|美式|拿铁|卡布|可乐|雪碧|饮料|奶茶|果汁|牛奶|豆浆|纯悦|饮用水|矿泉水/.test(name))return 'drink';
  return 'snack';
}
export function yuanHint(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);return Number.isFinite(n)&&n>=0?Math.round(n*100):null;
}
export function normalizeMenu(raw){
  const data=payload(raw)||{},meals=data.meals??data.products??(Array.isArray(data)?data:[]);
  return Object.entries(meals).map(([key,m])=>({code:String(m.code??m.productCode??key),name:m.name??m.productName??'',hintCents:yuanHint(m.currentPrice),category:categoryOf(m.name??m.productName??'')}))
    .filter(x=>x.code&&isFood(x.name));
}
function time(value){
  if(!value)return null;if(typeof value==='number')return value<1e12?value*1000:value;
  const str=String(value).trim();
  const t=Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d/.test(str)?str.replace(' ','T')+'+08:00':str);
  return Number.isFinite(t)?t:null;
}
export function normalizeCoupons(raw,now=new Date()){
  const data=payload(raw);const rows=Array.isArray(data)?data:(data?.coupons??data?.list??[]);
  return rows.map(c=>{
    const dates=String(c.tradeDateTime||'').match(/\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/g)||[];
    return {id:String(c.couponId??''),instance:String(c.couponCode??''),title:c.title??c.couponName??c.name??'',
      start:time(c.startTime??dates[0]),end:time(c.endTime??c.expireTime??dates[1]),
      products:(c.products||[]).map(p=>({code:String(p.productCode??p.code??''),name:p.productName??p.name??c.title??'',category:categoryOf(p.productName??c.title??'')}))};
  }).filter(c=>c.id&&(!c.start||c.start<=now.getTime())&&(!c.end||c.end>now.getTime()));
}
export function availableCoupons(raw){
  const data=payload(raw);
  if(Array.isArray(data))return data.map(c=>({title:c.couponName??c.title??'',status:c.label??({'HAVING_RECEIVE':'已领取','NOT_RECEIVE':'可领取','CAN_RECEIVE':'可领取'}[c.couponStatus]??'未知')})).filter(c=>c.title);
  if(typeof data!=='string')return [];
  const out=[];for(const block of data.split(/-\s*优惠券标题[:：]/).slice(1)){
    const title=block.split(/\\|\n/)[0].trim(),status=block.match(/状态[:：]\s*([^\\\n]+)/)?.[1]?.trim()??'未知';
    if(title)out.push({title,status});
  }return out;
}
export function normalizeStores(raw){
  const data=payload(raw),rows=Array.isArray(data)?data:(data?.stores??data?.list??[]);
  return rows.filter(s=>s.businessStatus!==false).map(s=>{
    const v=s.distanceMeters??s.distance;let distanceMeters=null;
    if(typeof v==='number'&&v>=0)distanceMeters=v;
    else if(typeof v==='string'&&/^\d+(\.\d+)?\s*(km|公里|m|米)?$/.test(v.trim()))distanceMeters=parseFloat(v)*(/km|公里/.test(v)?1000:1);
    return {code:String(s.storeCode??s.code??''),name:s.storeName??s.name??'',distanceMeters,address:s.address??''};
  }).filter(s=>s.code&&s.name).sort((a,b)=>(a.distanceMeters??Infinity)-(b.distanceMeters??Infinity));
}
export function campaignHints(raw){
  const data=payload(raw);if(typeof data==='string')return data.slice(0,8000);
  return JSON.stringify(data??[]).slice(0,8000);
}
