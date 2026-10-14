import {AccountModel} from './model.js';
import {changes} from './changes.js';
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=cents=>(cents/100).toFixed(2).replace(/\.00$/,'');
const distance=meters=>meters===null?'距离未提供':meters>=1000?`${(meters/1000).toFixed(1)} 公里`:`${Math.round(meters)} 米`;
const emoji=offer=>/咖啡|美式|拿铁/.test(offer.name)?'☕':/冰淇淋|圆筒|麦旋风/.test(offer.name)?'🍦':/薯/.test(offer.name)?'🍟':offer.category==='meal'?'🍔':offer.category==='drink'?'🥤':'🥧';
const categoryName={all:'全部餐品',meal:'主食套餐',drink:'饮品',snack:'小食甜品'};
const model=new AccountModel();
let data=null,category='all',connected=false,accountEnabled=true,busy=false;
function invalidateAccount(nextConnected){
 model.reset(nextConnected);connected=nextConnected;data=null;busy=false;
 if($('offer-dialog').open)$('offer-dialog').close();
 $('offers').innerHTML='<div class="empty">连接或查询后，显示本账号的优惠结果。</div>';
 $('coupons').textContent='';$('coverage').textContent='';$('checked').textContent='';
 $('scan-button').disabled=false;$('scan-button').innerHTML='发现低价 <span>→</span>';
 accountState();
 scanState(false);
}
function scanState(pending){
 document.querySelectorAll('[data-category]').forEach(button=>{button.disabled=pending;});
 for(const id of ['city','address','radius','budget','scan-button','watch-button','claim-button'])$(id).disabled=pending;
}
function setData(value,version=model.version){if(model.accept(version,value)){data=model.data;render();}}
function notice(text,error=false){$('notice').hidden=!text;$('notice').textContent=text;$('notice').classList.toggle('error',error);}
async function api(path,{method='GET',body}={}){
 const version=model.version;
 const response=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json();
 if(version!==model.version)throw Object.assign(new Error('旧账号结果已丢弃'),{stale:true});
 if(!response.ok){if(response.status===401)invalidateAccount(false);throw new Error(result.error||'查询暂不可用');}
 return result;
}
function accountState(){
 $('account').textContent=connected?'我的账号已连接 ↗':accountEnabled?'连接我的账号 ↗':'了解真实接入 ↗';$('disconnect').hidden=!connected;
 $('connect-form').hidden=!accountEnabled;
 $('public-account-note').hidden=accountEnabled;
}
function showOffer(offer){
 model.selected=offer;
 $('offer-detail').innerHTML=`<p class="detail-name">${escape(offer.name)}</p><div class="detail-price">¥${money(offer.payableCents)}</div><p>${escape(offer.storeName)} · ${escape(distance(offer.distanceMeters))}</p><p>${escape(offer.reason)}</p><ol class="detail-steps">${offer.steps.map(s=>`<li>${escape(s)}</li>`).join('')}</ol><p class="privacy-note">${data.mode==='demo'?'演示流程与示例价格，不代表实际可领优惠。':'报价具有时效性。支付前请核对官方最终金额；未创建任何订单。'}</p>`;
 $('copy-offer').textContent='复制点餐步骤 →';$('offer-dialog').showModal();
}
function render(){
 if(!data)return;
 const demo=data.mode==='demo';
 $('mode-label').textContent=demo?'演示模式 · 价格和优惠为示例':'实时模式 · 官方计价 · 到店取餐';
 $('checked').textContent=(demo?'演示更新 ':'已验证 ')+new Date(data.checkedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
 const scoped=!demo&&data.coverage.category!==category?[]:data.offers.filter(o=>category==='all'||o.category===category);
 const offers=scoped.filter(o=>o.payableCents<=Number($('budget').value));
 const empty=scoped.length?`本次${demo?'示例':'已验证'}的${categoryName[category]}最低 ¥${money(Math.min(...scoped.map(o=>o.payableCents)))}，高于当前实付上限。<br>将实付改为“不限”，即可查看。`:!demo&&data.coverage.category!==category?'这个分类还没有完成查询。<br>点击“发现低价”，查询当前分类的实付价。':'本次没有拿到这个分类的有效价格。<br>可调整地点或距离后点击“发现低价”重新查询。';
 $('offers').innerHTML=offers.length?offers.slice(0,9).map((o,i)=>`<article class="offer-card"><div class="card-top"><span class="badge">${i===0?'本次最低实付':o.source==='coupon'?'券后价格':'门店低价'}</span><span class="card-mode">${demo?'示例餐品':'官方已计价'}</span></div><div class="food-icon" aria-hidden="true">${emoji(o)}</div><h3>${escape(o.name)}</h3><p class="store-line">${escape(o.storeName)}<br>${escape(distance(o.distanceMeters))} · 到店取餐</p><div class="price-row"><span class="price-currency">¥</span><span class="price">${money(o.payableCents)}</span><span class="price-caption">${demo?'示例实付':'实付'}</span></div><p class="reason">${escape(o.reason)}</p><button class="card-button" data-offer="${escape(o.id)}">看看怎么点 <span>↗</span></button></article>`).join(''):`<div class="empty">${empty}</div>`;
 const c=data.coverage;
 $('coverage').textContent=demo?c.statement:`${categoryName[c.category]||'全部餐品'} · 查询 ${c.stores} 家门店 · ${c.quoted}/${c.candidates} 个候选已计价 · ${c.truncated?'覆盖范围有限，':' '}${c.statement}${data.warnings.length?`。${data.warnings.length} 条查询提示，可稍后重试。`:''}`;
 $('coupons').innerHTML=data.coupons.length?data.coupons.map(c=>`<div class="coupon"><span class="coupon-name">${escape(c.title)}</span><span class="coupon-state ${c.status==='可领取'?'available':''}">${c.status==='可领取'?'○ 可领取':escape(c.status)}</span></div>`).join(''):'<div class="empty">暂未发现可领取券。门店直接低价餐品仍会参与推荐。</div>';
 $('campaigns').textContent=data.campaigns||'暂时没有活动线索。活动文案不作为价格承诺，以门店实际计价为准。';
 $('offers').querySelectorAll('[data-offer]').forEach(button=>button.addEventListener('click',()=>showOffer(data.offers.find(o=>o.id===button.dataset.offer))));
}
function locationInput(){
 const address=$('address').value.trim(),city=$('city').value.trim();
 if(!city||!address)throw new Error('请填写城市和附近地点，例如城市名＋商场或地铁站。');
 return {address,city,radiusMeters:Number($('radius').value)};
}
async function runScan(silent=false){
 if(busy)return;
 if(!connected){$('account-dialog').showModal();notice(accountEnabled?'连接个人账号后，可以查询你的真实优惠；演示可以直接体验。':'公开网页只展示演示，请在本人设备通过 Skill 或本地应用接入真实优惠。');return;}
 const version=model.version;
 try{
  const input={...locationInput(),category};busy=true;scanState(true);$('scan-button').textContent='正在验证门店价格…';
  model.selected=null;if($('offer-dialog').open)$('offer-dialog').close();
  $('offers').innerHTML=`<div class="empty">正在查询${categoryName[category]}并验证实付价格…</div>`;
  if(!silent)notice('正在查询附近门店、可用券并逐个验证实付，通常需要几秒到半分钟。');
  const previous=data;setData(await api('/api/scan',{method:'POST',body:input}),version);
  if(silent){
   const update=changes(previous?.mode==='live'?previous:null,data);
   if(update.newCoupons.length||update.dropCents)notice(`发现新的低价机会：${update.newCoupons.join('、')}${update.dropCents?`，当前最低实付 ¥${money(data.offers[0].payableCents)}`:''}`);
   else notice('本次未发现新券或更低价格。');
  }else notice(data.offers.length?'已完成真实计价。选一个低价餐品，看看怎么拿到这个价格。':'当前条件没有可验证的餐品，可调整地点或距离。');
 }catch(e){if(!e.stale){render();notice(e.message,true);}}finally{if(version===model.version){busy=false;scanState(false);$('scan-button').innerHTML='发现低价 <span>→</span>';}}
}
$('search-form').addEventListener('submit',e=>{e.preventDefault();runScan();});
$('account').addEventListener('click',()=>$('account-dialog').showModal());
$('close-account').addEventListener('click',()=>$('account-dialog').close());
$('close-offer').addEventListener('click',()=>$('offer-dialog').close());
$('close-claim').addEventListener('click',()=>$('claim-dialog').close());
$('connect-form').addEventListener('submit',async e=>{
 e.preventDefault();$('connect-button').disabled=true;invalidateAccount(false);
 try{await api('/api/connect',{method:'POST',body:{token:$('token').value.trim()}});$('token').value='';connected=true;model.connected=true;accountState();$('account-dialog').close();setData(await api('/api/demo'));notice('已连接。填写附近地点，即可发现你的实际低价机会。');}
 catch(error){if(!error.stale)notice(error.message,true);$('account-dialog').close();$('token').value='';}
 finally{$('connect-button').disabled=false;}
});
$('disconnect').addEventListener('click',async()=>{invalidateAccount(false);try{await api('/api/session',{method:'DELETE'});$('account-dialog').close();setData(await api('/api/demo'));notice('已断开并删除服务内存中的个人连接。');}catch(e){if(!e.stale)notice(e.message,true);}});
$('demo-button').addEventListener('click',async()=>{invalidateAccount(connected);try{setData(await api('/api/demo'));notice('这是自造演示数据。真实优惠请在本人设备连接自己的账号。');}catch(e){if(!e.stale)notice(e.message,true);}});
document.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{
 if(busy||category===button.dataset.category)return;
 category=button.dataset.category;document.querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
 if(connected&&data?.mode==='live')runScan();else render();
}));
$('budget').addEventListener('change',render);
$('claim-button').addEventListener('click',()=>{if(!connected){$('account-dialog').showModal();notice('演示券不能领取；请连接本人的麦当劳账号。');return;}$('claim-dialog').showModal();});
$('confirm-claim').addEventListener('click',async()=>{
 $('confirm-claim').disabled=true;
 try{const result=await api('/api/claim',{method:'POST',body:{confirm:true}});$('claim-dialog').close();notice(result.message);if(data?.mode==='live'){data.coupons=result.coupons;render();}if($('city').value&&$('address').value)await runScan();}
 catch(e){$('claim-dialog').close();if(!e.stale)notice(e.message,true);}finally{$('confirm-claim').disabled=false;}
});
$('watch-button').addEventListener('click',()=>runScan(true));
$('campaign-toggle').addEventListener('click',()=>{const opened=$('campaigns').hidden;$('campaigns').hidden=!opened;$('campaign-toggle').setAttribute('aria-expanded',String(opened));});
$('copy-offer').addEventListener('click',async()=>{
 const selected=model.selected;if(!selected)return;
 const text=`${data.mode==='demo'?'【演示，非实时报价】':'【麦麦低价雷达】'}\n${selected.name} · ¥${money(selected.payableCents)}\n${selected.storeName} · ${distance(selected.distanceMeters)}\n${selected.steps.map((s,i)=>`${i+1}. ${s}`).join('\n')}\n价格与供应以麦当劳官方最终结算为准。`;
 try{await navigator.clipboard.writeText(text);$('copy-offer').textContent='已复制 ✓';}catch{notice('浏览器未允许复制，请直接查看点餐步骤。',true);}
});
try{const results=await Promise.all([api('/api/demo'),api('/api/session')]);({connected,accountEnabled}=results[1]);model.connected=connected;accountState();setData(results[0]);}catch(e){if(!e.stale)notice(e.message,true);}
