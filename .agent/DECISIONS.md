# 技术决策记录

> 长期有效的架构与工程决策。一条决策一个事实，简短、带来源；详细论证在来源文档，不在此复制。状态：`Accepted` / `Superseded by D-XXXX`。

## D-0001 外部协议解析必须基于真实证据（2026-10-13 随 AGENTS.md 固化，Accepted）

任何消费外部 API / 协议 / 第三方数据结构的解析逻辑，必须先对照独立获取的真实证据验证结构；fixture 从真实证据构建并记录来源与时间，禁止从实现反推。源自 DAViewer v0.5.14 `@publicSession` 事故。规则全文见 `AGENTS.md`；教训见 [LESSONS.md](LESSONS.md) L-01。

## D-0002 OAuth 是内容访问主认证，网页 Cookie 仅增强附加页（Accepted）

OAuth refresh token 负责 mature 主图、metadata、download；网页扩展会话只增强 `additionalMedia`，Cookie 缺失/过期只降级附加页，绝不影响主图。来源：`AGENTS.md` 规则 1–3、`src/deviantart/adapter.js` 认证分工注释。

## D-0003 视频 DTO 的 baseUri 只是海报（Accepted）

可播放地址只取网页 `types[].t === "video"` 或 OAuth `videos[]`；缺播放源回退官方 API，不把封面当图片发送。GIF 始终 `animation` 独立发送。来源：`AGENTS.md` 规则 8、`docs/architecture/media-pipeline.md`。

## D-0004 交付以 reply checkpoint 收口，失败按资产隔离（Accepted）

对源消息的回复是最终有效性检查点，源消息被删则取消而非兜底；单项失败标记后继续其余项并保持顺序，确定拒绝才拆批，上传结果不明不自动重发，已确认消息绝不重复。来源：`AGENTS.md` 规则 11–13、`docs/architecture/media-pipeline.md`。

## D-0005 尺寸受限签名选 fullview，质量标注只留内部（2026-10-29，Accepted）

静态图片的 Wix token 可能把尺寸约束绑定到精确重采样路径，裸 `baseUri` 因此 403：此时选响应提供的 `fullview`（当前仅验证 token index 0），内部标记 `representation: fullview` / `originalAvailable: false`；按用户要求 caption 不显示技术性版本提示。未知签名、GIF、视频保留原有选择方式，不自动改用小预览。来源：`docs/architecture/media-pipeline.md`、`test/fixtures/deviantart-bounded-media-evidence.md`。

## D-0006 发布链 release-please + ReleaseGraph，说明发布后人工修整（Accepted）

`fix:`/`feat:` 合入 main 触发版本 PR，合并版本 PR 即发布并自动部署 VPS；`docs:`/`chore:` 不触发版本。自动生成的 Release 说明是原始 commit 标题，发布后必须按 AGENTS.md 双语规范用 `gh release edit` 修整；retention 只保留最新正式 Release 对象（标签留存）。来源：`.github/workflows/release.yml`、`.github/workflows/deploy.yml`、`.release-policy.yml`。

## D-0007 `.agent/` 工程体系与权威划分（2026-10-29，Accepted）

任务进度权威是 `.agent/TASKS.md`，工程状态摘要是 `.agent/STATUS.md`，单会话交接是 `.agent/HANDOFF.md`；GitHub issues 管用户可见跟踪，CI/Release 事实以平台为准；工程细节在 `docs/` 与工作区归档，本目录只引用不复制。参照 DAViewer D-0008 同构体系。
