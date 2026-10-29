# 当前阶段计划

> 本阶段的目标、步骤与验收门槛。完成或方向变化时更新；功能开发计划以 GitHub issues / PR 为准，不在此复制。

## 阶段：媒体可靠性收尾（2026-10-22 起）

**目标**：Telegram 交付管线在真实 DeviantArt 响应形态下不丢媒体、不降质、不重复发送。

**已完成**：

1. [x] 超大 / 中断上传不重放，按实际请求体分批（v1.16.0，2026-10-22；>50 MiB 单文件推迟至 Issue #68）。
2. [x] 尺寸受限 Wix 签名 403：选响应提供的 fullview，内部标注展示版本（v1.16.1，2026-10-29）。
3. [x] caption 去技术化：作品消息只保留作品信息与来源链接（v1.16.2，2026-10-29）。
4. [x] 同类修复同步 deviantart-downloader 4.4.3 并发布 GitHub / PyPI（2026-10-29）。

**验收门槛**：`npm run check` 全绿 + PR CI + 部署后 `/health` ok。真实 Telegram 投递验收按用户要求取消，作为边界记录（[TASKS.md](TASKS.md) T-002）。

## 下一步

- 无排定大项；候选以 GitHub issues 为准（Issue #68 大文件支持）。
- 媒体 403 若复发：先核对新 Wix token 形态是否超出「已验证 token index 0」的范围，再怀疑代码回归（[LESSONS.md](LESSONS.md) L-02）。
