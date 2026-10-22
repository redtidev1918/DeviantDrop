# 上传协议与故障样本依据

核对日期：2026-10-22。此文件记录长期回归依据，临时调查报告放工作区归档，不进入文档导航。

## 权威协议

- https://core.telegram.org/bots/api#sending-files ：multipart 照片 10 MB、其他文件 50 MB；URL 更低；file_id 复用不受重新上传大小限制。
- https://core.telegram.org/bots/api#sendmediagroup ：每组 2–10 项，返回 Message 数组，支持 photo/video 组合；文档只能与文档组队。
- https://www.rfc-editor.org/rfc/rfc9110.html#name-413-content-too-large ：413 是服务端拒绝过大的请求内容；不保证描述具体文件，也不保证 JSON 格式。
- https://github.com/tdlib/telegram-bot-api#usage ：Local 模式 2000 MB；不是公共云端 Bot API 的能力。

## 实采故障与独立核验

用户提供作品：https://www.deviantart.com/kirkyguy/art/Hopelessly-Pregnant-1399696524

生产日志（2026-10-22T13:50:58.214Z 到 13:50:59.224Z）记录：`sendAnimation`、`upload:true`、HTTP 413、description `Request Entity Too Large`。DA 抓取成功且 media 数量为 1。旧版未记录 multipart 字节数或各文件大小，不能补造历史请求长度。

同日通过服务器既有出口，只读获取网页接口和媒体 HEAD：

```json
{
  "workId": "1399696524",
  "kind": "animation",
  "mediaType": "image/gif",
  "headStatus": 200,
  "contentLength": 92824537,
  "preview": {"w": 360, "h": 540, "f": 92824537},
  "fullview": {"w": 360, "h": 540, "f": 92824537},
  "download": {"filesize": 92824537}
}
```

以上是从实际响应中提取的白名单摘要，并非完整 DA DTO。媒体签名 URL、Cookie、CSRF 与 Bot token 均不保存。没有在此次验证中发送 Telegram 媒体：真实 API 只读 `getMe` 返回 200/ok，TLS CONNECT 验证通过；日志中的历史 413 是真实发送证据。

## 测试边界

`upload-budget.test.js` 故障注入以 HTTP 413 权威语义为依据；相册、回执及错误结构以 Telegram 官方接口说明为依据，测试内容用人工生成字节。`multipart accounting` 测试用本机 HTTP server 独立统计收到的请求体字节数并解码，验证与实际发送 Blob 一致。单文件实采大小用于 HEAD 超限回归。

相册总请求 413 是主动构造的故障场景，不宣称该实际 GIF 事故由相册引起。默认 50 MiB 分批目标是本项目的保守操作策略，不是声称官方存在统一的 50 MiB 相册总限制。
