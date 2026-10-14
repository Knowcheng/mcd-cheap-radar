import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {McpClient} from '../src/mcp.mjs';

async function host(t,handler){
  const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));return `http://127.0.0.1:${server.address().port}`;
}
test('initializes session, discovers schemas and consumes multiline SSE without closing stream',async t=>{
  const endpoint=await host(t,async(req,res)=>{
    const parts=[];for await(const p of req)parts.push(p);const body=JSON.parse(Buffer.concat(parts)||'{}');
    assert.equal(req.headers.authorization,'Bearer test-only');
    if(body.method==='initialize'){
      res.setHeader('mcp-session-id','session-test');res.setHeader('content-type','application/json');
      res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-03-26'}}));return;
    }
    assert.equal(req.headers['mcp-session-id'],'session-test');
    if(!body.id){res.writeHead(202);res.end();return;}
    if(body.method==='tools/list'){
      res.setHeader('content-type','application/json');res.end(JSON.stringify({id:body.id,result:{tools:[{name:'query-meals',inputSchema:{type:'object',properties:{storeCode:{type:'string'},beType:{type:'number'}},required:['storeCode']}}]}}));return;
    }
    res.setHeader('content-type','text/event-stream');
    res.write('event: message\ndata: {"jsonrpc":"2.0",\ndata: "id":'+body.id+',"result":{"content":[{"type":"text","text":"{\\"data\\":{\\"ok\\":true}}"}]}}\n\n');
  });
  const client=new McpClient('test-only',{endpoint,timeoutMs:1000,minIntervalMs:0});
  await client.connect();assert.deepEqual(client.args('query-meals',{storeCode:'A',beType:1,unknown:'ignored'}),{storeCode:'A',beType:1});
  assert.deepEqual(await client.call('query-meals',{storeCode:'A'}),{data:{ok:true}});
});
test('required unknown arguments fail before making a bogus price request',()=>{
  const client=new McpClient('test-only');client.tools.set('x',{inputSchema:{properties:{requiredField:{type:'string'}},required:['requiredField']}});
  assert.throws(()=>client.args('x',{}),/requiredField/);
});
test('authentication and upstream errors never disclose the credential',async t=>{
  const endpoint=await host(t,(_req,res)=>{res.writeHead(401);res.end('secret-test-only');});
  const client=new McpClient('secret-test-only',{endpoint,timeoutMs:1000,minIntervalMs:0});
  await assert.rejects(client.connect(),e=>e.code==='MCP_AUTH'&&!e.message.includes('secret-test-only'));
});
test('MCP tool error is not treated as a valid zero-price object',async t=>{
  const endpoint=await host(t,async(req,res)=>{
    let body='';for await(const c of req)body+=c;const msg=JSON.parse(body);
    res.setHeader('content-type','application/json');res.end(JSON.stringify({id:msg.id,result:{isError:true,content:[{type:'text',text:'token secret-test-only error'}]}}));
  });
  const client=new McpClient('secret-test-only',{endpoint,minIntervalMs:0});
  await assert.rejects(client.call('calculate-price',{}),e=>e.code==='MCP_TOOL'&&!e.message.includes('secret-test-only'));
});
test('SSE delimiter works when CR and LF arrive in separate network chunks',async t=>{
 const endpoint=await host(t,async(req,res)=>{
  let body='';for await(const c of req)body+=c;const msg=JSON.parse(body);
  res.setHeader('content-type','text/event-stream');
  res.write(`data: ${JSON.stringify({id:msg.id,result:{content:[{type:'text',text:'ok'}]}})}\r`);
  setTimeout(()=>{res.write('\n\r');setTimeout(()=>res.end('\n'),5);},5);
 });
 const client=new McpClient('test-only',{endpoint,timeoutMs:1000,minIntervalMs:0});
 assert.equal(await client.call('query-meals',{}),'ok');
});
