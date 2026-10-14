import {writeFile,mkdir} from 'node:fs/promises';
import {McpClient} from './mcp.mjs';
import {scan} from './radar.mjs';
import {availableCoupons,payload} from './adapters.mjs';
import {demo} from './demo.mjs';

const command=process.argv[2]||'demo',args=process.argv.slice(3);
const value=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};
function print(result){
 console.log(result.mode==='demo'?'【演示数据，不代表实时优惠】':'【官方实时计价 · 到店取餐】');
 for(const offer of result.offers.slice(0,8))console.log(`¥${(offer.payableCents/100).toFixed(2)}  ${offer.name}  ${offer.storeName}  ${offer.distanceMeters??'未知'}米${offer.couponTitle?` · ${offer.couponTitle}`:''}`);
 console.log(`${result.coverage.stores}家门店 · ${result.coverage.quoted}/${result.coverage.candidates}个候选已计价${result.coverage.truncated?' · 覆盖范围有限':''}`);
 console.log('可领取券：'+result.coupons.filter(c=>c.status==='可领取').map(c=>c.title).join('、'));
 if(!result.offers.length)console.log('当前没有已验证的餐品，请调整地点、范围或稍后查询。');
}
async function main(){
 if(command==='demo'){print(demo());return;}
 if(!['probe','scan','claim'].includes(command))throw new Error('命令：demo / probe / scan / claim --confirm（仅本人本机主动使用）');
 if(command==='claim'&&!args.includes('--confirm'))throw new Error('领取免费券会改动个人卡包，请使用 claim --confirm 明确确认');
 const client=await new McpClient(process.env.MCD_MCP_TOKEN).connect();
 try{
  if(command==='probe'){
   const required=['query-nearby-stores','query-meals','query-store-coupons','calculate-price','available-coupons','auto-bind-coupons'];
   const coupons=availableCoupons(await client.call('available-coupons',client.args('available-coupons',{})));
   const summary={checkedAt:new Date().toISOString(),server:'https://mcp.mcd.cn',tools:client.tools.size,required:required.map(name=>({name,available:client.tools.has(name)})),claimableCount:coupons.filter(c=>c.status==='可领取').length};
   console.log(JSON.stringify(summary,null,2));return;
  }
  if(command==='claim'){
   payload(await client.call('auto-bind-coupons',client.args('auto-bind-coupons',{})));
   console.log('官方一键领券已执行，请运行 scan 验证当前门店可用价格。');return;
  }
  const options={address:value('--address',process.env.MCD_TEST_ADDRESS),city:value('--city',process.env.MCD_TEST_CITY),maxStores:Number(value('--stores','3')),maxQuotes:Number(value('--quotes','24')),radiusMeters:Number(value('--radius','3000'))};
   const result=await scan(client,options);
   print(result);
   if(args.includes('--save-summary')){
    await mkdir('artifacts',{recursive:true});
    const summary={checkedAt:result.checkedAt,server:'https://mcp.mcd.cn',coverage:result.coverage,validQuotes:result.offers.length,
     prices:result.offers.map(o=>({name:o.name,payableCents:o.payableCents,source:o.source})),claimableCount:result.coupons.filter(c=>c.status==='可领取').length,warningCount:result.warnings.length};
    await writeFile('artifacts/live-summary.json',JSON.stringify(summary,null,2),{mode:0o600});
   }
 }finally{client.close();}
}
main().catch(error=>{console.error(error.code?`${error.code}：${error.message}`:error.message);process.exitCode=1;});
