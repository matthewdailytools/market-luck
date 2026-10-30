# Market Luck

[English](README.en.md) · [日本語](README.ja.md)

[在线测试站](https://luck-test.onlinefreetools.org) · [GitHub 开源仓库](https://github.com/matthewdailytools/market-luck) · [线上测试报告](线上测试报告.md)

Cloudflare Workers + D1 + R2 的纯积分彩票实验，中文响应式页面，16 国虚拟选号玩法，公开奖池与中奖流水。

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

见《行情数据源接入.md》。三个免费层来源固定为 EODHD / Alpha Vantage / Twelve Data，至少两源一致，任一有效分歧即冻结。需自行注册免费 key，免费层不代表公开再分发许可。当前没有实际账号，不宣称完成在线行情联调。

## Cloudflare 部署准备

创建自己的 D1 数据库和 R2 桶，替换 wrangler.jsonc 中的数据库 ID。正式环境将 DEMO_MODE 改为 false，再执行远端迁移和部署：

```powershell
npx wrangler d1 migrations apply DB --remote
npm run deploy
```

不要直接把 DEMO_MODE=true 作为公网生产配置。尚需生产交易日历、外部承诺发布时间戳、账号防滥用、数据授权与安全审计。没有真实 LIVE 期时生产页面将保持等待开期，不自动生成模拟行情。

## 项目文档

- [16 国玩法说明](各国玩法说明.md)
- [注册赠分测算与发行机制](注册赠分测算.md)
- [开奖算法规范](ALGORITHM.md)
- [HTTP API](API.md)
- [行情源配置](行情数据源接入.md)
- [贡献指南](CONTRIBUTING.md) / [安全边界](SECURITY.md) / [MIT 许可证](LICENSE)

注册赠分 1,000 分 = 100 注，用于覆盖 16 种玩法各 6 期（96 注）并留 4 注自由选择。完整概率与通胀测算见报告。网页支持中文、English、日本語。GitHub 开源仓库已创建，包含 MIT 许可证与自动检查工作流。

## Anonymous market-source diagnostics

No API keys are needed to test Yahoo Finance + Nasdaq historical closes: `node scripts/check-public-sources.js 2026-10-29 AAPL`. This is historical diagnostics, not an active LIVE draw profile. See [免 Key 实测](免Key行情源实测.md) and [API Key 逐步申请](免费行情API申请与配置-逐步操作.md). The owner-specific test deployment config is gitignored; copy `wrangler.test.example.jsonc` to `wrangler.test.jsonc` and use your own IDs/domain when creating your own test site.
