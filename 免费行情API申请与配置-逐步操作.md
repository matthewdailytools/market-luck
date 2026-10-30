# 免费行情 API：申请、配置与交叉验证

核查日期：2026-10-31。你只需要申请免费 Key 并填入本地文件，不需要把 Key 发到聊天、GitHub 或网站前端。本项目的公开测试站仍然使用模拟行情；以下操作不会自动切换为真实开奖。

## 先选什么

先申请 **EODHD、Alpha Vantage、Twelve Data 三个免费账号**。推荐首批只校验 AAPL、MSFT、IBM 的指定交易日日线未复权收盘价。各国玩法数量与行情市场数量无关：16 国玩法可以共同使用这组事前公开的行情输入，不必为每个国家购买一套行情。

| 来源 | 官方免费层信息 | 本项目请求 | 保存到哪个字段 |
|---|---|---|---|
| EODHD | 20 calls/日，历史范围约 1 年；具体权限以账户为准 | 指定日期 `/api/eod/AAPL.US` 的 `close` | `EODHD_API_KEY` |
| Alpha Vantage | 标准免费额度 25 requests/日，部分接口需付费 | `TIME_SERIES_DAILY` 的 `4. close` | `ALPHA_VANTAGE_API_KEY` |
| Twelve Data | Basic 免费层：8 credits/分钟、800/日；标明 internal non-display usage | `time_series`、`interval=1day`、`adjust=none` 的 `close` | `TWELVE_DATA_API_KEY` |

以上是**免费开发与取数方案**，不是保证这三个免费计划都允许公开展示、原始数据再分发或商业抽奖。特别是 Twelve Data 免费层公开注明“Internal non-display usage”。真实站公开价格、下载证据中的价格及原始响应归档方式，需先取得适用许可，不能因为项目开源而忽略数据许可。[Twelve Data 方案](https://twelvedata.com/pricing)、[EODHD 方案](https://eodhd.com/pricing)、[Alpha Vantage 使用条款](https://www.alphavantage.co/terms_of_service/)。

## 第一步：申请 EODHD

1. 打开 [EODHD 官方网站](https://eodhd.com/)，进入注册，使用你自己的邮箱创建账号并按提示验证邮箱。
2. 在 [官方方案页](https://eodhd.com/pricing) 选择 **Free Package / $0 / Start free**。本次不需要购买订阅；如页面要求支付，请先检查是否误选付费方案。
3. 登录 Dashboard，找到 **API token**。官方说明 token 在仪表盘可见，也会随欢迎邮件提供。
4. 复制 token，暂存到密码管理器或下一节的本地文件；不要复制到源码。
5. 在账户页面确认免费层和当日剩余额度。不要把仪表盘中可能提供的公共 `demo` 示例 token 当成你自己的 Key。

参考：[EODHD 官方 Quick Start](https://eodhd.com/financial-apis/quick-start-with-our-financial-data-apis)。

## 第二步：申请 Alpha Vantage

1. 打开 [官方免费 API Key 申请页](https://www.alphavantage.co/support/#api-key)。
2. 找到 **Claim your Free API Key** 表单，按页面要求填写真实邮箱和用途，例如“open-source educational project / end-of-day data verification”。
3. 完成页面要求的验证并提交，保存页面给出的 API Key。
4. 不要进入 Premium 支付表单；当前检查使用基础 `TIME_SERIES_DAILY`，不使用实时、15 分钟延迟或 Daily Adjusted 付费接口。
5. 免费额度较少，先只检查一只股票、一个近期完整交易日。项目开源或教育用途如需更多额度，可向其申请，但不能假设会自动获得。

参考：[官方支持与免费额度](https://www.alphavantage.co/support/)、[官方 API 文档](https://www.alphavantage.co/documentation/)。

## 第三步：申请 Twelve Data

1. 打开 [Twelve Data 官方网站](https://twelvedata.com/)，使用自己的邮箱注册，按提示完成邮箱验证。
2. 在 [方案页](https://twelvedata.com/pricing) 选择 **Basic / $0 / Start with Basic**。
3. 登录 Dashboard，找到 API Key 区域，复制你的 Key。
4. 在 Usage 页面检查当前 Key 的额度和具体市场权限。
5. 免费美股行情与交易所正式收盘数据可能存在口径和授权差别。先用项目检查脚本验证指定日 `adjust=none` 日线；不要用盘中 `/price` 最后价代替收盘价。

如果页面按钮名称变化，以官方 Dashboard 中 API Key 和 Usage 的实际位置为准；本流程不要求启用付费试用。

## 第四步：在本地配置三个 Key

在 PowerShell 打开项目目录：

```powershell
cd C:\Users\matth\Documents\ChatGPT\market-luck
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars
```

只在新建的 `.dev.vars` 中把占位值替换为你自己的 Key：

```dotenv
EODHD_API_KEY=你的EODHD_Key
ALPHA_VANTAGE_API_KEY=你的AlphaVantage_Key
TWELVE_DATA_API_KEY=你的TwelveData_Key
ADMIN_TOKEN=另设一个长随机管理密钥
```

不要修改 `.dev.vars.example` 里的占位值。`.dev.vars` 已在 `.gitignore` 中排除。不要添加到截图、提交记录、Issues 或聊天；Key 本身不需要发给我。修改后只需回复“已填入本地 .dev.vars”。

## 第五步：执行一次安全取数检查

如果尚未安装依赖：

```powershell
npm ci
```

选择最近几天中**已经完整收盘**且三个来源都应有数据的交易日。例如本文核查时可以先使用 2026-10-29；以后按实际日期修改，不能永远使用这个历史日期。

```powershell
node scripts/check-market-sources.js 2026-10-29 AAPL
```

脚本从 `.dev.vars` 或当前进程环境变量读取 Key，不输出 Key、带 Key 的 URL 或供应商原始响应。每个已配置来源最多请求一次；一只股票的检查通常各消耗 1 次请求。脚本只检查取数，不购票、不开期、不开奖。

成功输出的关键字段如下（数字仅为结构示例，不是真实价格）：

```json
{
  "ok": true,
  "symbol": "XNAS:AAPL",
  "date": "2026-10-29",
  "closeMinorUnits": 12345,
  "scale": 2,
  "currency": "USD",
  "sources": [
    {"provider": "EODHD", "closeMinorUnits": 12345},
    {"provider": "AlphaVantage", "closeMinorUnits": 12345}
  ]
}
```

美元整数 12345 表示 123.45 美元。实际输出还包含响应哈希和不可用来源列表。至少两个不同来源价格完全相同、且没有任何有效冲突才返回 `ok:true`。三个 Key 都配置后，优先确认三者均成功；缺一个来源但另两个一致可达到已公布的最低共识要求。

成功后可各再检查一次：

```powershell
node scripts/check-market-sources.js 2026-10-29 MSFT
node scripts/check-market-sources.js 2026-10-29 IBM
```

不要一次检查几十只股票；三个股票各一次，仅用每源约 3 次请求，适合当前免费额度。Alpha 的 compact 日线只含近期数据，不适合任意多年前日期。

## 第六步：失败如何处理

| 错误 | 意义 | 操作 |
|---|---|---|
| `MISSING_KEY` | 缺少该来源 Key，或仍为占位值 | 检查 `.dev.vars` 的字段名和内容 |
| `QUORUM_NOT_REACHED` | 不足两个有效报价 | 查看 unavailable 列表，检查 Key、额度、市场权限、日期 |
| `SOURCE_CONFLICT` | 至少一个有效价格与其他来源不同 | 停止，不平均、不舍入、不挑掉异议；核实日期和未复权口径，等待供应商澄清 |
| `DATE_MISSING` | 指定日无有效行，也可能是额度提示或错误响应 | 检查是否节假日、数据尚未发布、日期超出 compact 范围或额度耗尽 |
| `SYMBOL_MISMATCH` | 返回标的/交易所/币种不符合请求 | 不改价格，核查账户覆盖和映射 |
| `PRECISION_MISMATCH` | 数据不能按预先规定精度无损转换 | 不四舍五入，核查单位、复权和供应商数据 |
| `PROVIDER_HTTP_ERROR` / `PROVIDER_UNAVAILABLE` | HTTP 错误、超时或网络不可用 | 等待后手动重试，避免连续耗尽免费额度 |

免费来源的一致性不是交易所签名的最终确认。两个服务也可能使用相同上游；该机制是核验约束，不是绝对防操控证明。

## 第七步：之后如何放到 Cloudflare

先完成前面的检查，并确认数据公开使用权限。然后由我使用**独立 LIVE Worker 和独立 D1/R2**配置真实行情，不直接把现有模拟测试站混成真实站。

配置到对应 Worker 的 secrets 时使用以下命令，并在提示中粘贴 Key（不要把值放进命令参数或 Git）：

```powershell
npx wrangler secret put EODHD_API_KEY --config 真实环境配置文件
npx wrangler secret put ALPHA_VANTAGE_API_KEY --config 真实环境配置文件
npx wrangler secret put TWELVE_DATA_API_KEY --config 真实环境配置文件
```

上面“真实环境配置文件”是说明占位符，不能原样执行。真实环境资源创建后会提供确切文件名。上线前还需：审核交易日历和 UTC 开闭市时间、停售在最早开盘前、售票前向外部发布 manifest 承诺、最后收盘后等待 24 小时窗口。任何数据缺失或分歧则保持等待，不回退旧价、不重抽。

## 你现在需要做的事

1. 按前三节申请三个免费 Key。
2. 填入本地 `.dev.vars`，不要发送 Key。
3. 回复“已填入本地 .dev.vars”，或自行运行检查并只告知成功/错误代码。

目前公开站完成的是模拟行情功能测试；没有 Key 之前，不会宣称真实行情在线联调已完成。
