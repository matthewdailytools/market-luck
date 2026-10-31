# Yahoo / Nasdaq 免 Key LIVE 接入与线上验收

日期：2026-10-31（北京时间）。

## 结果

- [真实开奖站](https://luck.onlinefreetools.org)：独立 Workers / D1 / R2，`DEMO_MODE=false`，使用服务器和数据库真实时钟。
- [演示站](https://luck-test.onlinefreetools.org)：继续隔离保存模拟积分及演示期次，新宣传主题同步更新。
- 另设私有管理令牌保护的线上回放 Worker、D1、R2；不与真实用户余额或奖池共用资源。
- [开源代码](https://github.com/matthewdailytools/market-luck) 和事前承诺已发布。

## 真实期次与锁定时间

本期 `1c6cb4c0-f039-4f23-a290-c303d509562a`，固定输入：2026-11-02 的 XNAS:AAPL、XNAS:MSFT、XNYS:IBM，美元、美分整数。

| 事件 | 纽约时间（EST） | UTC | 北京时间 |
|---|---|---|---|
| 停售 | 11月2日03:30 | 11月2日08:30 | **11月2日16:30** |
| 盘前开始 | 11月2日04:00 | 11月2日09:00 | 11月2日17:00 |
| 核心开盘 | 11月2日09:30 | 11月2日14:30 | 11月2日22:30 |
| 核心闭市 | 11月2日16:00 | 11月2日21:00 | 11月3日05:00 |
| 24小时确认窗口结束 | 11月3日16:00 | 11月3日21:00 | **11月4日05:00** |

最早开奖时刻之后仍须两源全部取数成功且完全一致，Cron 每5分钟检查；缺失、节流、网络故障或分歧都继续等待，不保证恰好05:00完成。

事前承诺：[GitHub固定提交中的manifest原文](https://raw.githubusercontent.com/matthewdailytools/market-luck/2e4fff6e4c28bdaa6e0df0a0e56efecfda26ebd1/commitments/1c6cb4c0-f039-4f23-a290-c303d509562a.json)。SHA-256：`12e6fae3c838a77ea1b1ee6630b4f5704c200f817c5a011ed9666959886b18e1`。

售票前，Worker 实际下载固定40位Git提交中的原文字节，校验哈希后才在事务中开放售票。拒绝分支地址、重定向、不同仓库、查询参数及哈希不符。GitHub发布记录提供公开比对，仍不是独立于运营方的不可篡改时间公证。

## 时间与数据约束

1. 使用经NYSE/Nasdaq核对的2026交易日历，IANA `America/New_York` 转换UTC，拒绝周末、休市、无效日期和未审核年份。11月1日冬令时切换、11月27日及12月24日半日市已测试。未知临时停市需管理端暂停，不擅自换日。
2. 停售最晚为交易日纽约03:30，早于04:00盘前，不只要求早于09:30核心开盘。准备期时至少还留一小时，已知历史日期不能开为可售LIVE期。
3. D1购票触发器以数据库当前毫秒校验 `now < cutoff`，不相信请求中的created或浏览器时钟。排队跨边界的旧请求也拒绝。
4. LIVE的id、manifest、commitment、cutoff、ready不可更新；演示推进不能修改LIVE。D1插入结算锁时也必须满足状态open且数据库时钟达到ready，防止只绕过应用层。
5. 新来源profile为 `PUBLIC-NOKEY-v1`：固定 Yahoo Finance、Nasdaq，2/2一致。仅允许三个规范MIC映射；缺一不可，不平均、不换日期、不回退旧价。
6. Yahoo使用chart的quote.close，不用adjclose；它的历史close可能因拆股修订。Nasdaq使用指定日Close/Last。两者必须在声明的精度下相等，Yahoo只容许已限定的float32表示误差还原。这里锁定的是供应商指定日快照口径，不声称交易所签名的永不修订终局价格。
7. 每次成功采集保存两源原始响应和SHA-256到私有R2，公开开奖结果与规范输入可独立复算。首次有效结算后不因后续供应商修订重抽。

## 线上已通过

| 层次 | 测试 | 结果 |
|---|---|---|
| 单测 | 交易日历、DST、半日市、错误MIC/标的映射、准备时间、ready前后边界、承诺验证与原有算法/语言测试 | 27项通过 |
| 普通本地流程 | workerd + 本地D1/R2 | 40次端点检查 + 105次并发购票通过 |
| 真实时钟LIVE站 | 真实事前发布、注册、16国购票、幂等请求、非法号码、90次并发、积分、会话退出 | 27项端点检查；并发84次成功、6次余额不足；100张票，累计扣1000分 |
| LIVE提前开奖 | 当前调用collect、demo advance及下载未发布证明 | 全部按预期拒绝，期次仍open，未提前生成结果 |
| 真实D1约束 | 直接SQL尝试修改LIVE停售时间、直接插入结算锁 | 分别被 `LIVE_MANIFEST_IMMUTABLE` 和 `MARKETS_NOT_FINAL` 拒绝 |
| 隔离线上回放 | 三阶段线上Worker使用实际Yahoo/Nasdaq历史响应 | 22检查通过，正数派奖、积分守恒、重复结算不重复支付、R2下载和独立复算通过 |

回放明确使用2026-10-29的已知历史数据，并在独立数据库中模拟时钟及外部承诺阶段；人为选取已知的历史中奖号码只用于覆盖正数派奖测试。证明标记 `execution=ONLINE_REPLAY_SIMULATED_CLOCK`。它不能冒充真实的未来自然开奖，也不能调用生产LIVE的时钟推进接口。生产LIVE没有这个接口或test_clock表。

**尚未完成的是本期未来行情自然闭市后的结算。** 当前日期早于11月2日，若现在声称本期已完整自然开奖，就必须违反停售与闭市规则。正式站会在11月4日05:00之后自动尝试真实双源采集；此报告不把隔离回放混称为自然LIVE开奖。

## 宣传主题评估

采用独立专家启发式比较：A收盘实验室7.35、B午夜市场秀7.05、C全球好运游乐场8.75（10分制）。选C并实施蓝紫幸运球、橙黄主行动、16国玩法与注册1000分利益点、分阶段倒计时和明确实际篮子来源。它是设计判断，不是用户转化率或A/B数据。完整权重和不足见[主题设计评估](主题设计评估.md)。

## 安装与复现

参考 `wrangler.live.example.jsonc` 创建自己的LIVE配置，替换账户、D1、R2和域名，执行生产迁移和部署。设置 `ADMIN_TOKEN` secret；不需要行情API Key。自己的GitHub仓库通过 `COMMITMENT_REPOSITORY=owner/repo` 配置，否则默认只认当前项目仓库。

```powershell
npm ci
npm test
npx wrangler d1 migrations apply DB --remote --config wrangler.live.jsonc
npx wrangler secret put ADMIN_TOKEN --config wrangler.live.jsonc
npx wrangler deploy --config wrangler.live.jsonc
```

`/api/admin/prepare` 接收固定交易日和规范标的，可省略所有供应商映射及开闭市UTC，由服务器派生；`cutoff`必须符合上述规则。保存返回的manifest原文字节到GitHub并提交，取得40位SHA原文链接后调用 `/api/admin/publish`。之后Cron负责到期采集，或管理端手动调用collect；暂停接口为 `/api/admin/pause`，不修改已售规则。

`node tests/live-online.js` 会对真实时钟站创建测试账户和购票，不会提前开奖；需要 `LIVE_ADMIN_TOKEN`。`node scripts/run-live-replay.js` 只用于独立回放安装，需要 `REPLAY_ADMIN_TOKEN`。**绝对不要对LIVE库应用 tests/replay-migrations/**，生产使用 `migrations/`。

## 边界

免费可访问不等于无限请求、服务承诺或已取得再分发许可。仍存在来源关联、供应商修订、管理员部署权限、反女巫不足等边界，不宣传“绝对不能操控”。年份之外及未知交易日安排拒绝开期，需要审核新日历后再扩展。

官方日历：[NYSE](https://www.nyse.com/markets/hours-calendars)、[Nasdaq Trader](https://www.nasdaqtrader.com/Trader.aspx?id=Calendar)。

## 最终部署与隔离复核

LIVE部署版本：`3b214873-c35f-4392-bbad-66ba369c6425`；演示站：`81e73d18-d4c3-4886-8cc7-c2528118aaaa`；回放：`b959121a-db75-42c8-a252-cb4441c48d85`。最终回放期 `dcbc7e2b-7b52-445d-b68a-8300de30a640` 的22项检查及独立证明复算全部通过。

真实LIVE库只含1个专用QA用户和100张待开奖票，总积分101000 = 100000 + 1×1000；直接检查 sqlite_master 确认不存在 test_clock 表。移动端390px实测内容宽375px，没有横向溢出；中文、英文、日文的主题、规则、来源与真实期时间均核验。
