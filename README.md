# Market Luck

[English](README.en.md) · [日本語](README.ja.md)

[真实开奖站](https://luck.onlinefreetools.org) · [模拟演示站](https://luck-test.onlinefreetools.org) · [GitHub 开源仓库](https://github.com/matthewdailytools/market-luck) · [线上测试报告](线上测试报告.md)

Cloudflare Workers + D1 + R2 的纯积分彩票实验，中英日响应式页面，16 国虚拟选号玩法，公开奖池与近期中奖流水。

## 本地运行

需要 Node.js 22+。

```powershell
npm install
npm run db:migrate
npm run dev
```

访问 http://127.0.0.1:8787 。创建一期 → 注册领 1000 分 → 选号购票 → 模拟全部闭市 → 执行开奖 → 下载复算证据。下一期保留奖池滚存。演示控制仅 localhost 可用。

## 验证

```powershell
npm test
# 保持 dev 服务运行；集成测试会创建测试用户、购票和结算本地演示期
npm run test:integration
```

单测覆盖抽号及免费行情适配；集成测试在本地 workerd 使用真实 D1/R2 模拟绑定运行。可复算下载 JSON 中的 input，MD5(input) 是公开指纹，SHA256(input) 是 seed，见 src/engine.js。不要把模拟行情视作真实随机源，模拟价格可预测。

## 真实行情

当前真实期使用 Yahoo Finance + Nasdaq 免 Key 的 `PUBLIC-NOKEY-v1`，必须两源逐只价格一致，缺失或分歧就等待。详情见[真实接入与验收](LIVE接入与线上验收.md)和[免 Key 实测](免Key行情源实测.md)。另保留 EODHD / Alpha Vantage / Twelve Data 的 Key 适配及[逐步申请说明](免费行情API申请与配置-逐步操作.md)，没有实际 Key 的接口不宣称已完成线上联调。免费可访问不等于获得公开再分发许可。

## Cloudflare 部署准备

创建自己的 D1 数据库和 R2 桶，替换 wrangler.jsonc 中的数据库 ID。正式环境将 DEMO_MODE 改为 false，再执行远端迁移和部署：

```powershell
npx wrangler d1 migrations apply DB --remote
npm run deploy
```

不要直接把 DEMO_MODE=true 作为公网生产配置。独立 LIVE 的配置示例、迁移与发布步骤见[真实接入与验收](LIVE接入与线上验收.md)，已接入审核过的 2026 美股交易日历和固定 GitHub 提交中的事前承诺；未审核年份拒绝开期。数据授权、账号防滥用和安全审计仍需独立评估。没有真实 LIVE 期时生产页面保持等待开期，不自动生成模拟行情。

## 项目文档

- [用户痛点研究与三个宣传主题](彩票用户痛点与主题策略.md)
- [三主题吸引力、信任感及默认选择](三主题吸引力与信任感评估.md)
- [结合可读核验页的最新主题复评](三主题复评-可读核验页版.md)
- [宣传主题上线验收](宣传主题上线验收.md)
- [16 国玩法说明](各国玩法说明.md)
- [注册赠分测算与发行机制](注册赠分测算.md)
- [开奖算法规范](ALGORITHM.md)
- [HTTP API](API.md)
- [普通用户核验页](https://luck.onlinefreetools.org/verify.html)：本期规则、来源、时间线与浏览器独立复算，保留原始 JSON 下载
- [可读核验页上线验收](可读核验页上线验收.md)
- [行情源配置](行情数据源接入.md)
- [贡献指南](CONTRIBUTING.md) / [安全边界](SECURITY.md) / [MIT 许可证](LICENSE)

注册赠分 1,000 分 = 100 注，用于覆盖 16 种玩法各 6 期（96 注）并留 4 注自由选择。完整概率与通胀测算见报告。网页支持中文、English、日本語。GitHub 开源仓库已创建，包含 MIT 许可证与自动检查工作流。

## Anonymous market-source diagnostics

No API keys are needed to test Yahoo Finance + Nasdaq historical closes: `node scripts/check-public-sources.js 2026-10-29 AAPL`. This command is historical diagnostics; live rounds separately pin `PUBLIC-NOKEY-v1` and future market sessions. See [免 Key 实测](免Key行情源实测.md) and [API Key 逐步申请](免费行情API申请与配置-逐步操作.md). The owner-specific test deployment config is gitignored; copy `wrangler.test.example.jsonc` to `wrangler.test.jsonc` and use your own IDs/domain when creating your own test site.

## LIVE / 真实开奖更新

[真实开奖站](https://luck.onlinefreetools.org) · [LIVE接入与线上验收](LIVE接入与线上验收.md) · [主题设计评估](主题设计评估.md)

Yahoo Finance + Nasdaq 免Key的 PUBLIC-NOKEY-v1 已接入真实期次；2/2价格一致，03:30纽约时间前停售，闭市后24小时才可开奖。生产LIVE与模拟站、线上历史回放安装分离。当前期最早自然开奖为北京时间2026-11-04 05:00。已完成上线售票与提前开奖拒绝，完整派奖闭环在明确标记的隔离回放中验证。详见上面的最新报告；旧文档中尚未启用LIVE的描述是上次交付记录。

首页提供“积分体验”（新访客默认）、“公开核验”“全球玩法”三种主题，支持中文、English、日本語。可用 `?theme=verify`、`?theme=points`、`?theme=world` 分享各主题。结合可读核验页的[最新复评](三主题复评-可读核验页版.md)继续选择积分默认，并加强首屏“查看本期规则与时间”按钮；痛点研究见[主题策略](彩票用户痛点与主题策略.md)。当前没有真实用户 A/B 转化结论。

公开核验入口现在进入站内可读页面，原始承诺 JSON 和开奖证明 JSON 放在下载区。尚未开奖时显示等待，开奖后浏览器独立计算 MD5、SHA-256 和各玩法号码，并分别说明数据源、时间与奖池检查的含义边界。
