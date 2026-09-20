# 媒体交付测试

**Language / Language:** [中文](media-delivery.md) · [English](../en/testing/media-delivery.md)

主套件：`npm test`。

可靠性用例集中在 `test/delivery-reliability.test.js` 和 `test/video-regression.test.js`：

- Cookie 合并保留 `auth_secure` / `userinfo`，同时接受上游轮换值；
- 已登录响应持久化 `Set-Cookie`；匿名或未登录响应不能覆盖登录快照；
- 视频 DTO 的 `media.baseUri` 只能当封面；缺少网页播放源时触发 OAuth fallback；
- OAuth `videos[].src` 被识别为 `video`，不会被 `content` / thumbnail 覆盖；
- Telegram 交付使用严格 reply checkpoint（`allow_sending_without_reply: false`）。

其他套件覆盖成熟内容降级、相册规划、multipart 上传、OAuth 轮换和 Cookie 热更新。

发布前执行 `npm run check`（全量测试 + 构建检查）。
