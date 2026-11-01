# GitHub 首发传播落实与素材验收

2026-11-01，北京时间。本轮落实 README 首屏、社交图、一分钟复算演示及中英文介绍发布。发布范围为本项目 GitHub 仓库；不将媒体样本宣传为自然行情开奖。

## 已公开发布

**[双语首发 Release：公开奖 OpenDraw](https://github.com/matthewdailytools/market-luck/releases/tag/launch-2026-11-01)** 于北京时间 **2026-11-01 09:21:35** 发布，标记为预览版，Tag 为 `launch-2026-11-01`，指向 `b1269c91efde8d7faa6ce4e94bb09af367a4dcee`。中英文正文同在该 Release，版本化原文另存为[中文介绍](docs/launch/launch.zh-CN.md)和[English introduction](docs/launch/launch.en.md)。

[发布元数据](docs/launch/published-release.json)保存实际发布时间、版本、附件和摘要。9 个附件全部经过无登录公开下载验证，大小与 SHA-256 匹配；同时核对 Tag 指向的代码 commit，见[公开下载验收](docs/launch/release-download-check.json)。

## README 首屏

中文、英文、日文首屏均改为：品牌与一句话定位 → 可读核验、演示和档案入口 → 实际 CI 徽章 → 社交图 → 可复制复算命令。安装、部署、行情来源、API 和安全边界继续保留在后文。

首屏提供清楚的下一步，正文区分“60 秒演示长度”和 clone、安装所需时间。样本使用模拟价格、加速日历及真实外部签名；已售真实期保持原 v1 规则。

[实际 GitHub 页面视觉验收 41260576686](https://github.com/matthewdailytools/market-luck/actions/runs/41260576686)通过：三语言 × 390/1280 宽度，共 6 个布局。图片实际解码成功，尺寸 1280×640，正文无横向溢出，核验与 Release 入口存在。运行于 GitHub 托管隔离 Chromium，匿名访问公开页面，无账号写入。[报告](docs/launch/readme-review.json) · [中文移动截图](docs/launch/readme-zh-mobile.png) · [英文桌面截图](docs/launch/readme-en-desktop.png)。

## 社交预览图

| 文件 | 尺寸 | 字节 | 内容 |
|---|---|---|---|
| [中文 PNG](docs/launch/social-preview.zh-CN.png) | 1280×640 | 213,148 | 规则先承诺，结果可复算；售前承诺、独立日志、GitHub 档案 |
| [English PNG](docs/launch/social-preview.en.png) | 1280×640 | 217,845 | Committed rules. Reproducible results. |

两张图共用真实执行证据，展示 11 项公共检查、指定信标轮次及单字符篡改被拒绝的结果，标明受控回放和纯虚拟积分。采用确定的 HTML/CSS 排版与系统字体渲染，无虚构认证标志。图片已嵌入 README 和 Release，并作为附件提供。

**仓库全局 Social preview 后台上传未在本轮执行。** 浏览器工具返回 `Local browser use is disabled in Work settings`；当前连接器没有上传设置能力，检查到的 GitHub `UpdateRepositoryInput` 也没有社交图字段。[能力记录](docs/launch/social-preview-status.json)。图片入库不等于该设置已经完成；[素材说明](docs/launch/README.md#github-仓库全局社交预览设置)给出官方 Settings → Social preview → Edit → Upload 步骤。

## 一分钟复算演示

[观看/下载 MP4](https://github.com/matthewdailytools/market-luck/releases/download/launch-2026-11-01/opendraw-one-minute.mp4)；本地文件为 `docs/launch/opendraw-one-minute.mp4`，约 3.57 MB。大视频通过 Release 分发，源码、社交图、字幕、GIF 和报告留在 Git 历史中。

| 项目 | 实测结果 |
|---|---|
| 时长与画面 | 60.000 秒，1280×720，30 fps，1,800 帧 |
| 编码 | H.264 / AAC，48 kHz 双声道，浏览器常用像素格式 |
| 声音 | 原创合成提示音与底声，无旁白；−14.08 LUFS，真峰值 −1.70 dBTP |
| 字幕 | 中英双语烧录字幕，另附 2 份 SRT，各 9 条；检查最短阅读时长 |
| 文件 SHA-256 | `ee9740ac6b4f7afb393322fe4fc0bd0b7d6b5759e66ba1228580b59aecf0c8f1` |
| 图像验收 | 2 张社交图、16 个时间点；文字无溢出，主体与字幕不重叠 |
| 复算 | 原样本 11 项检查通过，CLI 退出码 0；nonce 首字符 `e → 0` 后拒绝，退出码 1 |

视频是按讲解节奏制作的**真实命令输出动效重演**，不是一次自然开奖的录屏。全程保留受控回放标识，结尾说明根权限、拒绝揭晓、候选唯一性和异步归档边界。可运行 `node scripts/demo-evidence.mjs` 独立重现通过/拒绝案例；[执行证据](docs/launch/demo-evidence.json)记录结果。

先以[静帧运行 41258970780](https://github.com/matthewdailytools/market-luck/actions/runs/41258970780)检查风格与排版，修正哈希短行、补上 MD5 指纹及表情细节。首次完整渲染的画面、时长和解码通过，但声音只有 −18.25 LUFS，触发验收失败。随后修复母带链路，以[音频与全片验收 41260331313](https://github.com/matthewdailytools/market-luck/actions/runs/41260331313)通过收尾；对重新封装前后的视频数据包做 SHA-256 比较，画面未变。[成片报告](docs/launch/media-report.json)保留来源及修复说明。

本轮进行了自动全片解码、响度/峰值测量、联系表和关键帧视觉检查；不声称完成实体设备、各社交平台缓存或传播转化效果验证。

## 代码、测试和剩余操作

[素材目录与重建说明](docs/launch/README.md)、[分镜](docs/launch/TREATMENT.md)、[素材许可](docs/launch/CREDITS.md)均已入库。制作方法参考 Lemo-Opuscar Living Screencast；角色、排版和声音原创，第三方字体及许可在 Credits 中说明。

[首发材料提交的标准 CI 41260573617](https://github.com/matthewdailytools/market-luck/actions/runs/41260573617)通过，原有 145 项单测与原生本地集成检查继续通过。本轮改动限于 README、媒体、文档和构建/验收脚本，没有向真实站发起写入或部署，不改变已售期规则。

当前唯一未执行的图片设置是上文说明的仓库全局 Social preview 后台上传。公开介绍、MP4、字幕、图片、校验和和复算源码均已发布。后续传播效果按真实独立复算、有效问题和外部贡献评估，不将制作完成当作已有社区认可。
