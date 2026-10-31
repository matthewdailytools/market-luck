# 公开奖：以可核验证据为核心的 GitHub 传播方案

2026-11-01，北京时间。适用仓库：[matthewdailytools/market-luck](https://github.com/matthewdailytools/market-luck)。网站品牌使用“公开奖 / OpenDraw”，仓库名保留，以维护原承诺链接和开发历史。

## 核心定位

**公开奖：规则先承诺，结果可复算。**

价值主张为“公平机制、公开记录、结果可追溯”。开发者能下载证据并离线复算；普通用户能看懂规则、停售与开奖时间、见证记录和奖池变化。中立性通过算法不把用户投注内容作为号码生成输入、版本事前固定、证据允许第三方独立核验来体现。

当前是纯虚拟积分项目，不代表任何国家官方彩票，也没有第三方机构的公平性认证。“无法作弊”是要不断缩小的攻击面，不能作为无条件保证。不要把 GitHub 托管、Rekor 存证或 CI 绿色标识写成这些平台对本项目的背书。

面向 GitHub 的第一传播对象是安全、密码学、可验证计算和开源 Web 开发者。中国彩票兴趣用户作为后续受众，先给出可读核验页，再解释技术。**首要转化事件是独立复算成功，次要是有效问题与贡献，Star 是辅助指标。**

## 如何使用“彩票可能被操控”的议题

用具体权限和证据讨论问题，逐条说明已有防护；不把概率上看起来反常的号码、售后间隔、领奖匿名等现象直接当成作弊证据。

| 参考对象 | 一手材料能证明什么 | 可以讨论的信任问题 | 公开奖的传播切入点 |
|---|---|---|---|
| 美国 Hot Lotto 历史案件 | Iowa Lottery 说明，2017 年涉案者认罪，使用恶意程序干预多州开奖；这是已证实的具体案件，不代表所有美国彩票 | 内部人员掌握 RNG/部署权限时，普通用户怎样发现后门 | 演示可复算输入、公开算法与未来外部信标，同时说明本项目根权限风险仍存在 |
| 中国体育彩票官方流程 | 官方公开说明了停售后数据封存、公证监督及双系统计奖核对；材料是具体时期的流程介绍，不当作所有现行产品流程的完整证明 | 公众如何理解销售截止到开奖的间隔，如何查看本期锁定规则和封存依据 | 做“为什么要等”的可读时间线，明确时区、闭市、24 小时确认与等待条件；不传播“有间隔就是操控” |
| 加拿大 WCLC | 官方说明了停售确认、独立控制系统、外部审计员、专有 RNG 的独立测试与每次完整性检查 | 流程隔离和审计如何建立信任，公众自己能获得哪些核验材料 | 展示无需机构授权即可下载的公开证据；不宣称一个开源积分站全面优于专业审计 |
| WLA 安全规范 | 行业规范覆盖 RNG/算法的物理和逻辑保护，以及独立观察要求 | 算法公开之外还需要哪些人员、权限与运行控制 | 把尚未完成的有状态独立见证、根权限治理、签名收据等列成明确研究问题 |

来源：[Iowa Lottery 官方案件说明](https://ialottery.com/Pages/Pressroom/OtherNews_Detail.aspx?otherNewsID=20)、[国家体育总局公开流程说明](https://www.sport.gov.cn/n20001280/n20745751/n20767297/c21153065/content.html)、[WCLC 官方安全流程](https://www.wclc.com/game-draw-security.htm)、[WLA-SCS:2024](https://publications.world-lotteries.org/security-and-risk-management/wla-scs-2024-code-of-practice)。上述“信任问题”和传播切入点是本项目的分析，不是这些机构对本项目的评价。

建议的文章主线：**“当用户不想只听一句‘请相信我们’，一个开奖项目应该提供哪些可核验材料？”** 先给证据和操作，再介绍实现，最后展示剩余边界。

不采用“揭露各国彩票都能作弊”“我们绝对无法作弊”“GitHub 认证公平”等标题。它们超出证据范围，也会让真正能评审代码的人首先质疑项目的可信度。

## 当前仓库基线与首发准备

2026-11-01 00:35 北京时间读取公开 GitHub API：0 Star、0 Fork、0 个开放 Issue；MIT 许可证已识别，已有 CONTRIBUTING.md；Discussions 关闭，Homepage 为空，Topics 为空。数字仅是该时刻的基线，不是增长预测。[公开元数据](https://api.github.com/repos/matthewdailytools/market-luck)。

首发前需要让访客在一分钟内找到四个入口：

1. **看懂**：可读核验页与一张真实界面截图。
2. **重算**：不需要 API Key 的本地受控证据包与复制即用的命令。
3. **追溯**：GitHub LIVE 核心档案、原承诺、独立日志与 CI。
4. **质疑**：明确的威胁模型、未解决问题及安全报告入口。

README 首屏建议结构：品牌与一句话定位 → 核验/档案/复算入口 → 证据链简图或实际截图 → 三分钟复算 → 当前状态与边界。安装、Cloudflare 密钥配置、16 国规则和 API 继续保留在后文。

推荐 About 文案：

> 公开奖 OpenDraw — verifiable virtual-points draws with commit–reveal, drand, independent log witnesses and public GitHub archives. 中文 / English / 日本語.

Homepage 建议填真实站 `https://luck.onlinefreetools.org`。Topics 建议：`verifiable-draw`、`commit-reveal`、`drand`、`transparency-log`、`auditability`、`cloudflare-workers`、`cloudflare-d1`、`cloudflare-r2`、`virtual-points`、`open-source`。这些是建议配置项，不把计划项写成已经设置完成。

社交预览图建议使用实际核验界面和“先承诺 · 独立存证 · 可复算”三个证据点；受控样本要有“受控回放”标识。GitHub 官方建议 1280×640 像素，文件小于 1 MB，详见[社交预览文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)。

## 第一条演示：让访问者自己验证

README 和首发帖采用同一段操作：

```sh
git clone https://github.com/matthewdailytools/market-luck.git
cd market-luck
npm ci
node scripts/verify-proof.js tests/fixtures/v3-controlled-proof.json
```

该包使用模拟行情和加速日历，包含真实 Rekor 收据及真实未来 drand 签名，明确标为受控回放。当前已售真实期继续 v1，不能把这个示例宣传为新 v3 自然行情开奖已完成。

演示视频/动图脚本控制在 45–60 秒：

- 0–10 秒：打开本期规则、停售和开奖时间线。
- 10–20 秒：找到 MD5/SHA-256 承诺、GitHub 档案与独立日志入口。
- 20–35 秒：执行离线复算，显示检查通过。
- 35–45 秒：修改一个价格、随机数或签名，演示检查失败。
- 45–60 秒：展示安全边界及一个具体待解决问题，邀请复现与审阅。

所有演示只使用隔离样本或公开数据，不使用真实用户账号、票据号码、Cookie 或 API 密钥。CI 徽章链接实际工作流，截图中的测试数量与日期以对应报告为准。

## GitHub 首发材料草稿

### 中文标题与正文

**标题：公开奖：把积分开奖做成任何人都能离线复算的证据包**

我做了一个纯虚拟积分项目。规则先承诺，结果公开复算；新 v3 期将隐藏的股票顺序与随机数提前做 SHA-256/MD5 承诺，冻结行情取得独立日志见证，再等待指定未来 drand 信标。GitHub 保存公开规则、冻结记录、见证、证明和去除用户标识的奖池流水。

可以直接 clone 仓库，重算一个带真实外部签名的受控样本，再改动其中一项看看哪里会失败。受控回放、自然开奖和已售旧规则有明确区分。

我希望得到的反馈是：还有哪些运营权限可能导致选择性公布或隐藏候选记录？公开证据是否足够复算？异步 GitHub 镜像能否更好地检测替换？根权限、拒绝揭晓和日志唯一性目前仍是明确边界。

仓库：https://github.com/matthewdailytools/market-luck

可读核验：https://luck.onlinefreetools.org/verify.html

这是待发布草稿，不能把它写成已有第三方审核或已经受到社区认可。

### English launch draft

**OpenDraw: reproducible virtual-points draws with public evidence archives**

OpenDraw is an open-source virtual-points project. New v3 rounds commit to a hidden stock permutation and 256-bit nonce before sales, freeze a two-source market snapshot, obtain independently signed Rekor witnesses and wait for a specific future drand round. Public rules, frozen records, witnesses, proofs and de-identified pool events are archived on GitHub.

The repository includes an offline-verifiable controlled replay with genuine external signatures. It is labelled as a simulation, and existing sold rounds retain their original rules. You can reproduce its numbers, alter a field and inspect the rejection.

I would value review of selective-abort risks, hidden candidate snapshots, first-record witnessing and archive consistency. Root operators and witness availability remain trust boundaries; this is not an official lottery or a claim of unconditional tamper resistance.

Repository: https://github.com/matthewdailytools/market-luck

## 四周执行节奏

| 阶段 | 具体动作 | 交付与验收 |
|---|---|---|
| 准备期：首发前 | 完成实际 LIVE 归档运行；核对 README 三分钟命令；补 About/Homepage/Topics；确认安全报告渠道 | 访客能点到真实档案和绿色 CI；任何尚未自然开奖的功能明确标记 |
| 第 1 周 | 在自己的仓库发布一个首发入口；按社区规则选择 1–2 个相关开发者社区提交原生技术介绍 | 每条介绍都提供复算步骤、代码和限制；记录来源与问题，避免同文批量投放 |
| 第 2 周 | 写三篇短技术说明：隐藏顺序为何仍需未来信标；包含证明为何不能直接混入种子；GitHub 如何检测历史替换 | 每篇都附一个可运行测试或证据文件，回链原始代码 |
| 第 3 周 | 发起公开审阅主题：候选快照唯一性、有状态独立见证、签名用户收据、售前外部观察 | 将有效反馈整理成可复现 Issue/PR；真实安全问题走私密报告流程 |
| 第 4 周 | 发布复核日志：发现了什么、修复了什么、还剩哪些权限；总结外部复算及贡献 | 用实际结果写复盘；新 v3 自然开奖只有发生并通过验收后才作为案例 |

11 月 4 日首期自然验收针对原已售 v1，届时应写成“旧版真实期的自然验收”，不能替换成“v3 已完成真实开奖”。面向消费者的扩大传播应在核验材料、运维与自然运行证据充分后再推进。

## GitHub 社区设计

建议的 Discussion 类别为 `Show your verification`、`Threat model`、`Ideas` 和 `Q&A`；启用功能后再建立对应入口。不要把公开 Issue 当成暴露凭据或可直接利用漏洞的渠道。GitHub 的私密漏洞报告需要单独启用，存在 SECURITY.md 不等于功能已开启。[官方说明](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)。

可准备的首批任务：

- `documentation`：核验流程的中文/英文/日文解释与时区可读性。
- `good first issue`：对已有异常向量增加另一种语言的独立验证实现。
- `research-needed`：按期号只接受首份记录的独立见证与监视协议。
- `security`：验证收据/快照/版本替换攻击，先按安全策略私密报告。
- `help wanted`：签名购票收据、完整票据集合承诺及长期档案分段策略。

这些是任务草稿，不伪造用户、评论、审计参与者、Star 或第三方背书。贡献者公开致谢应取得本人同意；没有预算时不许诺现金悬赏。

## 指标与停止条件

四周的研究性目标可设为：5 份不同参与者自愿提交的复算记录、2 条可行动的威胁模型建议、1 个外部 PR。这是运营验收目标，不是流量承诺。另记录 Star/Fork 的自然变化、来源点击和有效提问率；未取得数据时保留空值。

一个复算记录至少包含：使用的代码 commit、公开样本/期号、运行环境、命令、结果、是否发现差异。不要求提交真实账户、票据或 IP。

若出现可改变有效结果、绕过售前规则、暴露秘密或破坏奖池的未解决问题，先收敛影响并修复，再恢复宣传。首期双源未达成共识时发布“继续等待及原因”，不发布虚构号码和已验证徽章。

## 核心传播句

**面向普通用户：规则先承诺，结果可复算；公开奖，公开可追溯。**

**面向 GitHub：Clone the evidence. Reproduce the draw. Review the trust model.**

长期信任来自外部人实际重算、提出问题和保存历史的记录。官方流程、真实案件和本项目风险都按证据表述，不能用攻击其他彩票的传闻替代自己的验证材料。
