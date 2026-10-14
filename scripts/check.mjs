import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files.filter(f=>/\.(mjs|js)$/.test(f)))execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
for(const file of ['README.md','MCP_INTEGRATION.md','CONTEST_DECLARATION.md','mcp-config.example.json','SKILL.md']){
 if(!readFileSync(file,'utf8').trim())throw new Error(`缺少必需内容：${file}`);
}
const declaration=readFileSync('CONTEST_DECLARATION.md');
const hash=createHash('sha1').update(`blob ${declaration.length}\0`).update(declaration).digest('hex');
if(hash!=='136e76f3160317049f19f5ba03f4d0fedd70fc3c')throw new Error('官方参赛声明已被修改');
const config=JSON.parse(readFileSync('mcp-config.example.json','utf8'));
if(config.mcpServers['mcd-mcp'].headers.Authorization!=='Bearer ${MCD_MCP_TOKEN}')throw new Error('示例配置必须只使用环境变量占位符');
const token=process.env.MCD_MCP_TOKEN;
for(const file of files){
 if(file==='.env'||/^artifacts\/|^\.superpowers\//.test(file))throw new Error('私有联调文件不可提交');
 if(/\.(jpg|png|gif|webp)$/.test(file))continue;
 const content=readFileSync(file,'utf8');
 if(token&&content.includes(token))throw new Error(`凭证进入公开文件：${file}`);
 if(/^src\//.test(file)&&/\.call\(['"](?:create-order|mall-create-order|draw-lottery)['"]/.test(content))throw new Error('发现未授权的订单或积分工具');
}
console.log(`检查通过：${files.length} 个公开文件；语法、必需材料、声明原文、配置占位符及凭证隔离。`);
