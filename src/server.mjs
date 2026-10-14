import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {McpClient,McpError} from './mcp.mjs';
import {Sessions} from './sessions.mjs';
import {scan} from './radar.mjs';
import {availableCoupons,payload} from './adapters.mjs';
import {demo} from './demo.mjs';

const assets=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/model.js',['model.js','text/javascript; charset=utf-8']],['/changes.js',['changes.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
const problem=(status,message)=>Object.assign(new Error(message),{status});
async function body(req){
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>12_000)throw problem(413,'请求内容过大');chunks.push(chunk);}
 try{const value=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw problem(400,'请求格式无效');}
}
export function createApp({clientFactory=token=>new McpClient(token),sessions=new Sessions(),origin=process.env.APP_ORIGIN,production=process.env.NODE_ENV==='production'}={}){
 if(production&&(!origin||!origin.startsWith('https://')))throw new Error('生产环境必须设置 HTTPS APP_ORIGIN');
 const rates=new Map();
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  let id=req.headers.cookie?.match(/(?:^|;\s*)radar_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const cookie=(sid='',maxAge=1800)=>res.setHeader('Set-Cookie',`radar_session=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production?'; Secure':''}`);
  let active,acquired=false;
  try{
   const url=new URL(req.url,'http://localhost'),path=url.pathname;
   const expected=origin||`http://${req.headers.host}`;
   const accountEnabled=!production&&['localhost','127.0.0.1','[::1]'].includes(new URL(expected).hostname)&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
   if(req.method==='GET'&&assets.has(path)){
    const [name,type]=assets.get(path);res.writeHead(200,{'Content-Type':type});res.end(await readFile(new URL(`../public/${name}`,import.meta.url)));return;
   }
   if(req.method==='GET'&&path==='/api/demo'){send(200,demo());return;}
   if(req.method==='GET'&&path==='/api/health'){send(200,{ok:true,version:'0.1.0'});return;}
   if(req.method==='GET'&&path==='/api/session'){const s=sessions.get(id);send(200,{connected:!!s,accountEnabled,expiresAt:s?new Date(s.expires).toISOString():null});return;}
   if(!path.startsWith('/api/')||!['POST','DELETE'].includes(req.method))throw problem(404,'页面不存在');
   if(req.headers.origin!==expected)throw problem(403,'请从本站页面发起请求');
   if(!accountEnabled)throw problem(403,'公开部署仅提供演示，不接收个人 Token；真实功能请在本人设备使用');
   const ip=req.socket.remoteAddress||'unknown',now=Date.now();
   for(const [k,v] of rates)if(now-v.start>60_000)rates.delete(k);
   const key=sessions.get(id)?id:ip,rate=rates.get(key)||{start:now,count:0};
   rate.count++;rates.set(key,rate);if(rate.count>30||rates.size>5000)throw problem(429,'操作过于频繁，请稍后重试');
   if(path==='/api/session'&&req.method==='DELETE'){sessions.remove(id);cookie('',0);send(200,{connected:false});return;}
   if(req.method!=='POST')throw problem(405,'请求方式不支持');
   const input=await body(req);
   if(path==='/api/connect'){
    if(typeof input.token!=='string'||!input.token.trim()||input.token.length>4096)throw problem(400,'请填写有效的个人 Token');
    const client=clientFactory(input.token.trim());
    try{await client.connect();if(id)sessions.remove(id);id=sessions.add(client);}catch(e){client.close();throw e;}
    cookie(id);send(200,{connected:true,expiresAt:new Date(sessions.get(id).expires).toISOString()});return;
   }
   if(!['/api/scan','/api/claim'].includes(path))throw problem(404,'接口不存在');
   active=sessions.get(id);if(!active)throw problem(401,'请先连接个人麦当劳账号');
   if(active.busy)throw problem(409,'正在查询，请等本次操作完成');
   active.busy=true;acquired=true;
   if(path==='/api/scan'){
    if(typeof input.address!=='string'||!input.address.trim()||input.address.length>200||typeof input.city!=='string'||input.city.length>30)throw problem(400,'请填写城市和附近地点');
    const radius=Math.max(500,Math.min(10000,Number(input.radiusMeters)||3000));
    send(200,await scan(active.client,{address:input.address,city:input.city,maxStores:3,maxQuotes:24,radiusMeters:radius}));return;
   }
   if(input.confirm!==true)throw problem(400,'领取免费券需要你明确确认');
   payload(await active.client.call('auto-bind-coupons',active.client.args('auto-bind-coupons',{})));
   let coupons=[];try{coupons=availableCoupons(await active.client.call('available-coupons',active.client.args('available-coupons',{})));}catch{}
   send(200,{claimed:true,coupons,message:'已执行官方一键领券；请重新扫描确认当前门店可用优惠'});
  }catch(e){
   const status=e.status||(e instanceof McpError?(e.code==='MCP_AUTH'?401:502):500);
   if(e instanceof McpError&&e.code==='MCP_AUTH')sessions.remove(id);
   send(status,{error:e.status||e instanceof McpError?e.message:'暂时无法完成查询，请检查连接或稍后重试'});
  }finally{if(active&&acquired)active.busy=false;}
 });
 server.requestTimeout=15_000;server.headersTimeout=10_000;
 server.on('close',()=>sessions.close());return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT)||3417,host=process.env.HOST||'127.0.0.1';
 createApp().listen(port,host,()=>console.log(`麦麦低价雷达：http://${host}:${port}（每位用户连接自己的账号）`));
}
