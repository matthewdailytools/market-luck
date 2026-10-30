# 免 API Key 行情源实测

## 结论

本地网络已成功访问 **Yahoo Finance 与 Nasdaq 两家不同服务**，对 AAPL、MSFT、IBM 的 2026-10-29 收盘价交叉验证一致。不需要注册或 API Key。测试时间为北京时间 2026-10-31 凌晨。Cloudflare 网络的验证结果另见《线上测试报告》。

| 来源 | 本次访问 | 处理 |
|---|---|---|
| Yahoo Finance chart | HTTP 200，返回日期、币种、股票代码和日线 close | 纳入诊断 |
| Nasdaq historical | HTTP 200，业务状态 200，返回指定日 Close/Last | 纳入诊断 |
| Stooq CSV | HTTP 403 Access denied | 不纳入，不绕过访问限制 |

| 标的 | 交易日 | Yahoo / USD | Nasdaq / USD | 一致 |
|---|---|---:|---:|---|
| AAPL | 2026-10-29 | 348.91 | 348.91 | 是 |
| MSFT | 2026-10-29 | 530.14 | 530.14 | 是 |
| IBM | 2026-10-29 | 258.28 | 258.28 | 是 |

这些是本次实际 HTTP 响应的诊断记录，不是未来价格预测，也不是给用户售票前锁定的正式开奖输入。不能事后用已知历史数据开售一场声称不可预测的抽奖。

## 本地复现

在项目目录执行，无需 `.dev.vars`：

```powershell
node scripts/check-public-sources.js 2026-10-29 AAPL
node scripts/check-public-sources.js 2026-10-29 MSFT
node scripts/check-public-sources.js 2026-10-29 IBM
```

诊断摘要和供应商原始响应保存到忽略提交的 `test-output/`。摘要包含来源、整数价格和 SHA-256。日期必须是纽约市场已经过去的交易日；周末、未发布或缺失时拒绝，不自动换日。

Yahoo 请求示例（时间戳按目标日生成）：

```text
https://query1.finance.yahoo.com/v8/finance/chart/AAPL?period1=UNIX_START&period2=UNIX_END&interval=1d
```

Nasdaq 请求示例：

```text
https://api.nasdaq.com/api/quote/AAPL/historical?assetclass=stocks&fromdate=2026-10-28&todate=2026-10-29&limit=10
```

Nasdaq 不接受本次接口中起止日期相同的请求，因此请求前一日至目标日，再严格筛选目标日，不使用返回的“最新一行”猜日期。

## 线上 Worker 复现

已实现管理员接口 `POST /api/admin/check-public-sources`，请求体为：

```json
{"symbol":"AAPL","date":"2026-10-29"}
```

需要管理员 Bearer token，避免任何访客刷外部接口。两家都成功且价格相同返回 200，否则返回 409，并列出冲突或不可用原因。原始响应存于私有 R2 的 `research/` 前缀下，公开 API 不提供原始响应下载。该接口只做研究核验，不扣积分、不售票、不派奖、不切换 LIVE。

## 精度、来源与使用边界

- Yahoo 同一平台的 query1/query2 只是备用域名，不能算两票；本实现只算一个 Yahoo 来源。
- Yahoo close 常带 float32 表示残差，例如 348.9100036621094。只有它与最近的“精确美分值”在 float32 下相同且残差不超过 0.0001 美元时才还原为 34891。真实的三位小数报价不被任意四舍五入。
- 不使用 Yahoo 的 adjclose，不混用股息复权数据。Yahoo 历史 close 仍可能包含拆股处理，长期历史、公司行动附近尤其不能假定与原始交易所价相同；两源有任何差异即失败。
- 无 Key 公开接口不代表稳定、商业授权、无限请求或保证可在所有地区使用。接口可能变更或限流；本项目没有绕过验证、付费墙或访问拒绝。
- 不把这次历史诊断直接作为生产 LIVE 来源配置。正式引入免 Key 方案需要新增事前锁定的来源 profile、稳定性观察、数据许可与交易日历核实；不能替换已经售票的三源 manifest。

参考：[Nasdaq 历史行情入口](https://www.nasdaq.com/market-activity/quotes/historical)、[Yahoo 历史数据说明](https://sg.help.yahoo.com/kb/finance-for-web/download-historical-data-yahoo-finance-sln2311.html)、[Yahoo 复权价格说明](https://in.help.yahoo.com/kb/adjusted-close-sln28256.html)。具体接口可用性以本次 HTTP 测试为依据，不声称它们是正式承诺稳定的公共 API 产品。
