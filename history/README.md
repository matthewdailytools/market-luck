# 公开核心数据历史

本目录由独立于 Worker 写入权限的 GitHub Actions 拉取公开接口、核验后追加。默认持续归档真实站 LIVE；DEMO 可手动选择并分目录保存。阶段规则、快照和最终证明只写一次，状态变化按内容哈希追加。

原始 `manifest.json`、`snapshot-payload.json`、`record-presale.json`、`record-freeze.json`、`reveal.json` 保持原字节，以便直接核对其 SHA-256 / MD5。证明保留原 JSON，流水包含公开的匿名积分变化，不含用户 ID、账户凭据或私人票据。

首次镜像时间是观察时间，不能冒充更早的售前承诺。新期镜像可能晚于未来信标；独立 Rekor 签名时间、原售前 GitHub 提交和归档提交时间须分别核对。GitHub 是托管与历史记录平台，不为本项目开奖公平性背书。仓库最高权限仍能强推或删除，建议自行克隆或保存 commit SHA。

入口：[LIVE 档案](live/) · [归档工作流](../.github/workflows/core-archive.yml) · [方案与限制](../GitHub核心档案存储方案.md)。
