# MCP 集成说明

## 官方服务

- Server：`https://mcp.mcd.cn`
- 传输：Streamable HTTP（JSON 与 SSE）
- 鉴权：个人 `Authorization: Bearer ${MCD_MCP_TOKEN}`
- 官方说明：https://github.com/M-China/mcd-mcp-server
- 官方服务规则：https://cdn.mcd.cn/cms/pages/MCPServerRules.html

本项目通过官方托管服务连接，没有逆向、抓取未公开接口或绕过鉴权。初始化后读取 `tools/list`，使用实际 schema 投影参数。个人本机主动查询；公网部署拒收个人凭证。

## 实际使用的工具与价值

| Tool | 使用方式 | 用户价值 |
|---|---|---|
| `query-nearby-stores` | 城市/关键词搜索附近到店门店 | 门店也参与低价发现 |
| `query-meals` | 各店分别查当前可售菜单 | 用户无需先选餐品 |
| `query-store-coupons` | 各店查本账号可用券及券商品码 | 不推不能用的券价 |
| `available-coupons` | 展示本账号可领取/已领取券 | 发现领券线索 |
| `campaign-calendar` | 展示活动线索 | 给出值得关注的时段/活动，价格仍需验证 |
| `calculate-price` | 给每个候选输入商品、门店、方式和券 | 得到最终真实现金实付 |
| `auto-bind-coupons` | 本人本机当次确认后执行一次 | 一键领取后重新验证可用价格 |

前 6 个已进行真实联网验证；领券写操作有本地 HTTP 行为测试，开发期间没有在真实账号执行。没有使用创建订单、买卡、商城下单或抽奖。

## 调用流程

```text
用户：附近有什么便宜的？（城市、地点、距离）
  → 本人账号 initialize / tools/list
  → 查附近门店
  → 查可领券、活动线索
  → 每家门店查菜单 + 当前可用券
  → 食品候选：券专用商品 + 单品/套餐
  → 跨门店轮流 calculate-price
  → 校验金额、商品码、数量、免费证据
  → 按最低实付 / 距离排序
  → 给餐品、门店、券名与明确点餐步骤

用户当次决定领券
  → auto-bind-coupons 一次
  → 重查门店可用券
  → 重新 calculate-price（原结果不能当新券后的价格）
```

## 2026-10-14 实测发现

- 官方实际返回 35 个工具；本项目只使用公开说明中的相关能力。
- 到店场景 `beType=1, orderType=1`，不传 `beCode`。
- 附近查询 schema 的 `city`/`keyword` 标为非必填，但只传完整地址 keyword 的请求被业务层以 `600058` 拒绝；带城市后成功。本项目支持单独 city，也会从含“市”的地址推断城市。
- `available-coupons` 当前真实返回 JSON `data[]`，字段为 `couponName / couponStatus / label`，并非部分旧示例中的 Markdown；解析器兼容两种结构。
- `query-meals.data.meals` 是以 code 为 key 的字典，`currentPrice` 是元字符串，只作为搜索优先级提示。
- `calculate-price` 的 `items[].productCode` 使用正确菜单码或券专用码；现金是 `data.price` 的整数分。
- 同名券不代表可用；各门店的券必须单独查。未领取券缺少计价所需码时不报券后金额。
- 门店菜单含酱料等非推荐物品，必须过滤。参数错误可能得到异常 0；本项目不会以缺省金额 0 作为有效报价。

## 真实验证记录

见 [docs/verification.md](docs/verification.md)。记录只保留工具名称、数量、餐品和价格，不包含 Token、实际用户地址、坐标、个人券 ID/兑换码或会员信息。现场截图若含个人数据不发布。

## 使用边界

“发现可领券”不等于“保证抢到限量券”；没有库存抢占、排队绕过或高频请求能力。默认到店取餐，最多 3 店/24 次报价；所有结果明示已验证范围。活动文案不等于所有门店实际优惠。

官方规则限定个人非商业用途、禁止凭证托管到非认证平台，并限制脚本与自动化调用。项目没有自动轮询/抢券/代领。公开网页仅演示；公众号面向粉丝的托管实时服务须先取得麦当劳官方授权并澄清个人客户端调用范围。源码与测试不构成额外服务授权。
