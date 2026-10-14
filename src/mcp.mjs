import {setTimeout as sleep} from 'node:timers/promises';

export class McpError extends Error {
  constructor(code,message){super(message);this.code=code;}
}
const fail=(code,message)=>new McpError(code,message);
function fit(schema,value,path='参数'){
  if(schema?.type==='object'||schema?.properties){
    const result={};
    for(const [k,s] of Object.entries(schema.properties||{})){
      if(Object.hasOwn(value||{},k)&&value[k]!==undefined)result[k]=fit(s,value[k],`${path}.${k}`);
    }
    for(const k of schema.required||[])if(result[k]===undefined)throw fail('MCP_ARGUMENT',`官方接口需要 ${path}.${k}，请补充该参数`);
    if(schema.additionalProperties!==false&&!schema.properties)return value;
    return result;
  }
  if(schema?.type==='array'){
    if(!Array.isArray(value))throw fail('MCP_ARGUMENT',`${path} 需要列表`);
    return value.map(v=>fit(schema.items||{},v,path));
  }
  if(schema?.type==='number'||schema?.type==='integer'){
    const n=Number(value);if(!Number.isFinite(n)||(schema.type==='integer'&&!Number.isInteger(n)))throw fail('MCP_ARGUMENT',`${path} 需要有效数字`);return n;
  }
  if(schema?.type==='string')return String(value);
  return value;
}
export function unwrapTool(result){
  if(result?.isError)throw fail('MCP_TOOL','官方工具未能完成请求，请检查参数、可用状态或稍后重试');
  if(result?.structuredContent)return result.structuredContent;
  if(!Array.isArray(result?.content))return result;
  const texts=result.content.filter(x=>x.type==='text').map(x=>x.text||'');
  const joined=texts.join('\n');
  try{return JSON.parse(joined);}catch{return joined;}
}
async function readRpc(response,id){
  if(!(response.headers.get('content-type')||'').includes('text/event-stream')){
    const text=await response.text();if(text.length>2_000_000)throw fail('MCP_RESPONSE','官方响应过大');
    try{return JSON.parse(text);}catch{throw fail('MCP_RESPONSE','官方返回了无法解析的数据');}
  }
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',size=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      size+=value.length;if(size>2_000_000)throw fail('MCP_RESPONSE','官方响应过大');
      buffer+=decoder.decode(value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');
      let pos;
      while((pos=buffer.indexOf('\n\n'))>=0){
        const event=buffer.slice(0,pos);buffer=buffer.slice(pos+2);
        const data=event.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
        if(!data)continue;
        let rpc;try{rpc=JSON.parse(data);}catch{continue;}
        if(rpc.id===id)return rpc;
      }
    }
    throw fail('MCP_RESPONSE','官方事件流没有返回本次请求的结果');
  }finally{await reader.cancel().catch(()=>{});}
}

export class McpClient {
  constructor(token,{endpoint='https://mcp.mcd.cn',timeoutMs=20_000,minIntervalMs=150}={}){
    if(typeof token!=='string'||!token.trim()||token.length>4096)throw fail('MCP_AUTH','请连接有效的个人麦当劳 MCP Token');
    this.token=token.trim();this.endpoint=endpoint;this.timeoutMs=timeoutMs;this.minIntervalMs=minIntervalMs;
    this.tools=new Map();this.sessionId=null;this.version=null;this.nextId=1;this.lastRequest=0;this.queue=Promise.resolve();
  }
  async rpc(method,params,notification=false){
    const execute=async()=>{
      await sleep(Math.max(0,this.lastRequest+this.minIntervalMs-Date.now()));this.lastRequest=Date.now();
      const id=notification?undefined:this.nextId++,headers={'Authorization':`Bearer ${this.token}`,'Content-Type':'application/json','Accept':'application/json, text/event-stream'};
      if(this.sessionId)headers['Mcp-Session-Id']=this.sessionId;
      if(this.version)headers['MCP-Protocol-Version']=this.version;
      try{
        const response=await fetch(this.endpoint,{method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(this.timeoutMs),body:JSON.stringify({jsonrpc:'2.0',...(notification?{}:{id}),method,params})});
        if(response.status===401||response.status===403)throw fail('MCP_AUTH','麦当劳连接已失效，请重新连接个人 Token');
        if(response.status===429)throw fail('MCP_RATE_LIMIT','官方接口繁忙，请稍后重试');
        if(!response.ok)throw fail('MCP_HTTP',`官方接口暂不可用（HTTP ${response.status}）`);
        this.sessionId=response.headers.get('mcp-session-id')||this.sessionId;
        if(notification){await response.body?.cancel();return;}
        const rpc=await readRpc(response,id);
        if(rpc.id!==id)throw fail('MCP_RESPONSE','官方响应与请求不匹配');
        if(rpc.error)throw fail('MCP_RPC',`官方拒绝了 ${method} 请求，请检查工具参数`);
        return rpc.result;
      }catch(error){
        if(error instanceof McpError)throw error;
        throw fail('MCP_NETWORK','连接麦当劳服务失败或超时，请稍后重试');
      }
    };
    const result=this.queue.then(execute,execute);this.queue=result.catch(()=>{});return result;
  }
  async connect(){
    const init=await this.rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'mcd-cheap-radar',version:'0.1.0'}});
    this.version=init.protocolVersion||'2025-03-26';await this.rpc('notifications/initialized',{},true);
    let cursor;
    for(let page=0;page<10;page++){
      const result=await this.rpc('tools/list',cursor?{cursor}:{});
      for(const tool of result.tools||[])this.tools.set(tool.name,tool);
      cursor=result.nextCursor;if(!cursor)break;
    }
    if(!this.tools.size)throw fail('MCP_RESPONSE','官方未返回可用工具');
    return this;
  }
  args(name,values){
    const tool=this.tools.get(name);if(!tool)throw fail('MCP_UNSUPPORTED',`当前账号未提供 ${name} 能力`);
    return fit(tool.inputSchema||{type:'object'},values);
  }
  async call(name,args={}){return unwrapTool(await this.rpc('tools/call',{name,arguments:args}));}
  close(){this.token='';this.tools.clear();this.sessionId=null;}
}
