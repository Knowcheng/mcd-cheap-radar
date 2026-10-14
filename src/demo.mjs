export function demo(){
 const store={storeCode:'demo-1',storeName:'示例 · 街角餐厅',distanceMeters:450};
 const offer=(id,name,price,category,source='menu',couponTitle=null)=>({id,name,category,...store,payableCents:price,discountCents:0,deliveryCents:0,source,couponTitle,couponExpiresAt:null,
  reason:source==='coupon'?`示例：使用「${couponTitle}」后的餐品`:'示例：附近门店的低价餐品',
  steps:['示例流程：领取免费券或使用已有券','选择支持该券的门店到店取餐','按推荐餐品点单，核对官方最终金额'],verified:false,checkedAt:new Date().toISOString()});
 return {mode:'demo',offers:[offer('demo-free','脆薯饼',0,'snack','coupon','免费脆薯饼'),offer('demo-ice','圆筒冰淇淋',500,'snack'),offer('demo-coffee','中杯冰美式',990,'drink','coupon','9.9 元冰美式'),offer('demo-burger','吉士汉堡',1200,'meal')],
  coupons:[{title:'免费脆薯饼',status:'可领取'},{title:'9.9 元冰美式',status:'已领取'},{title:'中薯条买一送一',status:'可领取'}],campaigns:'演示活动线索：周末小食优惠、早餐时段优惠。活动是否可用，需要查询门店并以官方计价为准。',
  warnings:[],checkedAt:new Date().toISOString(),coverage:{stores:2,foundStores:2,candidates:4,quoted:4,truncated:false,radiusMeters:3000,orderMode:'到店取餐',statement:'演示数据由本项目自造，仅展示产品流程，不代表实时价格或可领取优惠'}};
}
