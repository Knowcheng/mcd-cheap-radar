# 麦麦低价雷达 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 发布可运行的低价机会发现工具并完成官方报名。

**Architecture:** 原生 Node HTTP/MCP 适配层、独立报价与筛选引擎、手机 H5、CLI。公开演示与个人账号真实扫描明确隔离，所有真实推荐由官方计价。

**Tech Stack:** Node.js >=22.9.0、HTML/CSS/JS、node:test，无运行依赖。

**Spec:** docs/superpowers/specs/2026-10-14-cheap-radar-design.md

## Global Constraints

- Node.js >=22.9.0；零运行依赖。
- 任意食品最低实付，免费食品参与，排除非食品。
- 所有真实价格以整数分存储，仅来源 calculate-price。
- Token 只保留服务内存 30 分钟，不进入日志、URL、Git、分享或持久化存储。
- 领券当次确认；没有创建订单/扣积分/买卡功能。
- 所有检查由用户手动触发；公网部署拒收个人 Token；扫描覆盖范围明确标示。

## Review Focus

- 计价缺字段/商品码错误返回 0 元：必须拒绝假免费。
- 同一券在不同门店或账号的可用性：必须按会话门店重查。
- SSE 不关闭或错误内容：有超时与响应大小限制。
- 不同账号和跨站请求：不得泄露 Token 或触发领券。
- 手动比较新券/空结果：不制造降价或重复提示。

### Task 1: 真实价格与优惠引擎

**Files:** src/radar.mjs, src/adapters.mjs, src/demo.mjs, tests/radar.test.mjs
**Interfaces:** scan(client,{address,maxStores,maxQuotes}) 返回 {offers,coupons,campaigns,coverage,warnings,checkedAt}；demo 返回相同格式。
- [ ] 写行为测试：现金升序/距离破平、券专用码、0 元错误、缺价格、免费券证据、非食品、预算截断、候选失败独立处理。
- [ ] 执行 `node --test tests/radar.test.mjs`，确认未实现时失败。
- [ ] 实现规范化及候选生成；每个候选 await client.call('calculate-price', args)，对验证结果排序。
- [ ] 全量 npm test；commit 记录实现。

### Task 2: MCP 客户端与 CLI

**Files:** src/mcp.mjs, src/cli.mjs, src/changes.mjs, tests/mcp.test.mjs, tests/changes.test.mjs
**Interfaces:** McpClient.connect() 获取 schema；call(name,args) 执行允许工具；close() 终止 session。changes(previous,next) 返回新券和更低价格。
- [ ] 本地 HTTP 测试服务器模拟官方 JSON/SSE、session、错误、通知、schema 和分页，验证真实网络解析。
- [ ] 先跑失败测试，再实现固定官方 endpoint；测试用 URL 仅构造器注入，不开放给网页。
- [ ] CLI probe 仅读 schema 和可领券，不输出个人凭证；scan 用户主动实时报价；手动检查变化；claim --confirm 才领取。没有后台轮询。
- [ ] npm test；凭证到位后 npm run probe/scan，保存脱敏验证摘要。

### Task 3: 网页与个人会话

**Files:** src/server.mjs, src/sessions.mjs, public/index.html, public/app.js, public/style.css, tests/server.test.mjs
**Interfaces:** GET /api/demo；POST /api/connect；POST /api/scan；POST /api/claim；DELETE /api/session；GET /api/session。
- [ ] HTTP 行为测试验证两个会话隔离、超时、断开、同源拒绝、请求体限制、领券确认、响应不含 Token。
- [ ] 先验证失败，后实施内存会话、请求限流、固定静态文件路由和安全响应头。
- [ ] H5 展示低价榜/可领券/活动线索，过滤食品类别、门店半径及价格；只读模式可直接试演示，账号接入有清晰说明。
- [ ] 桌面与手机交互检查，保存截图；npm test。

### Task 4: 文档、验证、发布报名

**Files:** README.md, SKILL.md, MCP_INTEGRATION.md, CONTEST_DECLARATION.md, mcp-config.example.json, docs/deployment.md, docs/verification.md, Dockerfile, .github/workflows/test.yml, scripts/check.mjs
- [ ] README 包括目标用户、安装、演示与真实使用；说明可部署的粉丝 H5 和凭证接入限制。
- [ ] 配置只含环境变量占位符；官方声明字节一致；原创代码 MIT。
- [ ] npm test、npm run check、浏览器验收与秘密扫描通过后提交。
- [ ] 推送 Knowcheng/mcd-cheap-radar，验证公开目录与内容，再按规定 Issue 格式报名。
- [ ] 核对报名回复，修复实际反馈；报告 URL 和真实验证范围。
