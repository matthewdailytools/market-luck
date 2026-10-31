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
- [可读核验页版主题复评（历史）](三主题复评-可读核验页版.md)
- [奖池与开奖结果版三主题复评](三主题复评-奖池与开奖结果版.md)
- [宣传主题上线验收](宣传主题上线验收.md)
- [16 国玩法说明](各国玩法说明.md)
- [注册赠分测算与发行机制](注册赠分测算.md)
- [开奖算法规范](ALGORITHM.md)
- [HTTP API](API.md)
- [普通用户核验页](https://luck.onlinefreetools.org/verify.html)：本期规则、来源、时间线与浏览器独立复算，保留原始 JSON 下载
- [公开期次分享卡](https://luck.onlinefreetools.org/share.html)：无需登录，固定期号与玩法，中英日切换、复制链接及保存 PNG；已公布号码须先通过本页复算，明确区分 LIVE、DEMO 和回放。
- [可读核验页上线验收](可读核验页上线验收.md)
- [行情源配置](行情数据源接入.md)
- [贡献指南](CONTRIBUTING.md) / [安全边界](SECURITY.md) / [MIT 许可证](LICENSE)

注册赠分 1,000 分 = 100 注，用于覆盖 16 种玩法各 6 期（96 注）并留 4 注自由选择。完整概率与通胀测算见报告。网页支持中文、English、日本語。GitHub 开源仓库已创建，包含 MIT 许可证与自动检查工作流。

## Anonymous market-source diagnostics

No API keys are needed to test Yahoo Finance + Nasdaq historical closes: `node scripts/check-public-sources.js 2026-10-29 AAPL`. This command is historical diagnostics; live rounds separately pin `PUBLIC-NOKEY-v1` and future market sessions. See [免 Key 实测](免Key行情源实测.md) and [API Key 逐步申请](免费行情API申请与配置-逐步操作.md). The owner-specific test deployment config is gitignored; copy `wrangler.test.example.jsonc` to `wrangler.test.jsonc` and use your own IDs/domain when creating your own test site.

## LIVE / 真实开奖更新

[真实开奖站](https://luck.onlinefreetools.org) · [LIVE接入与线上验收](LIVE接入与线上验收.md) · [主题设计评估](主题设计评估.md)

Yahoo Finance + Nasdaq 免Key的 PUBLIC-NOKEY-v1 已接入真实期次；2/2价格一致，03:30纽约时间前停售，闭市后24小时才可开奖。生产LIVE与模拟站、线上历史回放安装分离。当前期最早自然开奖为北京时间2026-11-04 05:00。已完成上线售票与提前开奖拒绝，完整派奖闭环在明确标记的隔离回放中验证。详见上面的最新报告；旧文档中尚未启用LIVE的描述是上次交付记录。

首页提供“积分体验”（新访客默认）、“公开核验”“全球玩法”三种主题，支持中文、English、日本語。可用 `?theme=verify`、`?theme=points`、`?theme=world` 分享各主题。[新版三维复评](三主题复评-奖池与开奖结果版.md)比较吸引力、彩票期待感和信任感后继续选择积分默认；显式链接与用户已保存的选择优先。新版本强调积分单位、完整时间、当前进度，并让开始选号与核验路径更清楚。痛点研究见[主题策略](彩票用户痛点与主题策略.md)。评分为 AI 启发式判断，尚无真实用户 A/B 转化结论。

公开核验入口现在进入站内可读页面，原始承诺 JSON 和开奖证明 JSON 放在下载区。尚未开奖时显示等待，开奖后浏览器独立计算 MD5、SHA-256 和各玩法号码，并分别说明数据源、时间与奖池检查的含义边界。

移动端首页将注册赠分、单注成本、停售时间、最早核验时间和核验入口提前，小球装饰缩小并后移；支持三种主题及中英日语言。官网参考、设计取舍与验收记录见[移动端首页优化与官网参考](移动端首页优化与官网参考.md)。

首页进一步突出当前共享积分奖池，并增加最近开奖结果卡及 16 国玩法快捷入口。结果使用各历史期锁定的规则与号码；尚无真实结果时保持等待，演示结果明确标识。国别入口只同步规则和选号，不自动购票。详见[奖池与开奖结果首页验收](首页奖池与开奖结果优化验收.md)。

新用户可按“注册领 1,000 积分 → 选择国家玩法 → 随机选号 → 核对并确认”的四步引导开始。每注 10 积分，选号区与确认窗口同时显示成本、余额和预计扣后余额，并保留本期核验入口；先选号再登录也会保留号码，登录不会自动购票。网络中断后查询或重试原请求，核对私有票据后才显示成功。详见[首次体验与购票流程验收](首次体验与购票流程上线验收.md)。

独立的“我的彩票”显示本人最近 100 张票的完整票号、所属期次、号码、成本与派奖记录。超出首页最近 20 期的票据会补查其原期次，缺失数据保留“待核实”，不套用当前规则；每张票可直达该期核验。从票据区登录会返回记录，退出立即清除私有显示，迟到的旧账号响应不能覆盖新状态。详见[票据记录与开奖状态验收](票据记录与开奖状态优化验收.md)。

浏览器验收使用 GitHub Actions 的隔离 Linux 环境运行 Chromium / WebKit，覆盖多语言、主题、视口与触控交互，并生成截图和测量报告。打开 Actions → **Ticket browser and mobile acceptance** → **Run workflow**，勾选 `online` 可额外测试演示站真实账号流程与正式站只读页面。线上测试只在 DEMO 创建一张积分票；正式站禁止测试写入。详见[浏览器与移动端验收](我的彩票浏览器与移动端验收.md)。
