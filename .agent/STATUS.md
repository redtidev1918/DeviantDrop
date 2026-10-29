# 工程状态

> 当前工程状态的摘要快照，每次重要任务结束或发布后更新。任务进度的权威是 [TASKS.md](TASKS.md)；CI、Release、PR 的平台事实以 GitHub 为准，本文件不复制它们。

- 更新时间：2026-10-29
- 当前版本：v1.16.2（2026-10-29 发布并核验，见 [CHANGELOG](../CHANGELOG.md)）。生产 `/health`：ok=true、version=1.16.2、polling 正常、无降级项。
- 分支：`main` 与远端同步；工作区干净（`.agent/` 已随 `docs:` 提交入库，见 [HANDOFF.md](HANDOFF.md)）。
- 开发阶段：常规开发。近期主线是媒体可靠性：v1.16.0 超大/中断上传不重放 → v1.16.1/1.16.2 尺寸受限 Wix 签名 403 修复。
- 生态：deviantart-downloader v4.4.3 已同步同类修复（GitHub Release + PyPI）；DAKit / DAViewer 是网页 DTO 解析与「原文件 vs 展示图」模型的参照实现（AGENTS.md 规则 14）。

## 开放事项

- 真实 Telegram 端到端投递验收被用户明确取消：生产验证边界限于健康检查、日志与真实 CDN 下载，不得宣称端到端已验证（见 [HANDOFF.md](HANDOFF.md) 2026-10-29 条）。
- 超过云端 50 MiB 单文件上限的作品仅回原作链接；大文件方案推迟到 GitHub Issue #68（开放中）。

## 当前无阻塞

无开放 PR；main 最新工作流成功（以 GitHub 为准）。

## 更新纪律

- 只记录可核实的事实并注明来源；不把计划写成已完成，不把测试通过写成生产验证。
- 与 [HANDOFF.md](HANDOFF.md) 分工：本文件管跨会话状态，HANDOFF 管单次会话交接。
