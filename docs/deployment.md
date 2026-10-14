# 部署与公众号使用

## 个人本机

Node.js >=22.9，`npm start` 默认绑定 `127.0.0.1:3417`。账号接口同时验证回环主机、回环来源和同源请求；个人 Token 不持久化，30 分钟到期销毁。环境变量中的 Token 只给 CLI，不给网页使用。

不要修改代码来允许服务器收集粉丝 Token，也不要把个人 Token 写入 Docker 镜像或共享环境。

## 公网演示

公网只提供自造演示价格。生产模式后端直接拒绝 `/api/connect`、`/api/scan`、`/api/claim` 等个人账号操作；页面不提供 Token 输入表单。它不是实时福利领取入口。

示例容器部署（先将域名、HTTPS 反向代理配置好）：

```bash
docker build -t mcd-cheap-radar .
docker run --rm --name mcd-radar \
  -p 127.0.0.1:3417:3417 \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e APP_ORIGIN=https://demo.your-domain.example \
  mcd-cheap-radar
```

生产 `APP_ORIGIN` 必须是实际 HTTPS 域名。反向代理只转发 HTTP，不记录请求体，不开启第三方统计脚本。本服务没有数据库，不提供大规模 SaaS 账号托管。

## 公众号福利路径

现在可以发布项目介绍、源码、免登录演示和个人 Skill 使用指南。粉丝在本人设备/个人 MCP 客户端使用自己的账号；不把 Token 发给公众号运营者。

若要做到“粉丝直接在公众号 H5 里获取实时推荐/领取”，需要先向麦当劳确认：

1. 公众号福利这种公开分发和服务使用方式是否获准。
2. 是否有官方认证的账号授权接入，避免第三方收集/托管 Token。
3. 用户主动查询的多工具调用、领券，以及未来提醒的允许范围。
4. 官方授权后的隐私告知、凭证撤销、调用配额和运营要求。

原因是[官方 MCP 服务规则](https://cdn.mcd.cn/cms/pages/MCPServerRules.html)当前限制个人非商业使用、第三方凭证托管、脚本及自动化调用。免费并不自动解决这些接入限制。
