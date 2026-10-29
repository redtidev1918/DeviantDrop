# 故障教训

> 已确认故障的根因与防复发规则，每条带证据来源。详细经过在回归记录与归档，不在此复制；新教训在重大问题解决后追加，沿用编号。

## L-01 未验证的协议假设能穿透整条绿色流水线

实现、测试与重构共用同一个未验证协议假设时，全绿的测试套件发现不了最基础的兼容断裂（DAViewer v0.5.14 `@publicSession` 事故，本仓库据此固化 AGENTS.md 永久规则）。
**防复发**：[DECISIONS.md](DECISIONS.md) D-0001——真实证据先行，fixture 记录来源与时间。
**来源**：`AGENTS.md` 外部协议验证规则。

## L-02 媒体 403 ≠ 权限/出口问题：先看 token 形态（2026-10-29）

**发生了什么**：两个作品共 3 个媒体下载 403，表象像访问被拒或出口被封；根因是 Wix 签名把尺寸约束（如 width<=1600）绑定到精确重采样路径——裸 `baseUri` 403，同一签名请求响应提供的 `fullview` 200。
**防复发**：媒体 403 先解码 token 形态、对照同资产的 `media_download_response` 与发送日志，区分 CDN 拒绝与 Telegram 拒收；不要据此重置登录、向 CDN 转发站点 Cookie 或提高 Telegram 上传限制；新 token 形态超出「已验证 token index 0」时，先补真实样本再改选择逻辑（D-0001）。
**来源**：`docs/operations.md` 媒体下载 403 节、`test/fixtures/deviantart-bounded-media-evidence.md`、工作区归档 `2026-10-29-media-403-handoff.md`。

## L-03 下载成功 ≠ 端到端投递；发布成功也不是

服务器实测 3 个媒体完整 200 下载、204 项测试、CI 与 `/health` 全部通过，都不能证明 Telegram 端到端投递成功。真实投递验收被用户取消后，边界必须如实保留，不得因发布而关闭（对应 [TASKS.md](TASKS.md) T-002）。
**来源**：工作区归档 `2026-10-29-media-403-handoff.md` 验收边界节。

## L-04 自动 Release 说明必须发布后人工修整（2026-10-29 实例）

releasegraph 发布的说明会把原始英文 commit 标题混进中文标题（v1.16.2 曾出现「修复：artwork captions focused on the artwork」）；且 retention 只保留最新正式 Release 对象，旧 Release 页面会被清理（标签留存），引用旧版本用 tag 链接。
**防复发**：每次发布后按 AGENTS.md 双语规范 `gh release edit` 修整（[DECISIONS.md](DECISIONS.md) D-0006）。
**来源**：v1.16.2 说明修整记录、`.release-policy.yml` retention 段。
