# 媒体管线架构

**Language / Language:** [中文](media-pipeline.md) · [English](../en/architecture/media-pipeline.md)

```text
DeviantArt adapter
  ↓
Normalized Media[]
  photo | video | animation | document
  ↓
Delivery planner
  ↓
Telegram delivery
  sendPhoto / sendVideo / sendAnimation / sendDocument
```

- 适配器独占 DeviantArt DTO 解释权（`media.types`、`additionalMedia`、OAuth `content` / `videos` / download）。
- 每个媒体项携带 `assetId`、`index`、`kind`、URL、fallback URL 和 MIME。
- 视频 DTO 的 `isVideo` / `film` 标志决定「这是视频作品」；`media.baseUri` 只是海报。可播放地址只取网页 `types[].t === "video"` 或 OAuth `videos[].src`。
- 网页响应缺少可播放视频源时，适配器回退官方 API；不会把封面图误标成可发送图片。
- 按响应里的质量排序（1080p → 360p）；扩展名识别覆盖 `mp4`、`m4v`、`webm`、`mov`、`mkv`。
- GIF 保持 `animation`，不进入 photo/video 相册。
- 静态图片的 Wix 签名若对该路径明确限制尺寸，裸 `baseUri` 不代表可下载原文件：使用响应给出的 `fullview`（当前验证 token index 0），在内部保留 `representation: fullview`、`originalAvailable: false`。作品消息不展示文件版本术语，也不把它误判为打码或付费限制；未知签名、GIF、视频保留原选择方式，不自动改用小预览。
- Literature 使用 `/art/` URL 且可能没有 media 描述符：适配器读取内联 `textContent`，规范化为 `.txt` document；不会伪装成图片或直接失败。
- 付费/订阅（Premium Folder / tier）作品识别为 `locked-preview`：非成熟内容的模糊主图不再当作原图发送，caption 明确提示需要订阅/购买。
- Planner 只按规范化后的模型分批：连续 photo/video 用 `sendMediaGroup`（≤10 项），animation 单独发送。
- 超过 10 MiB 的照片以原始字节作为 document 发送，不重新编码；不因下载失败静默替换成展示图。普通照片仍使用 Telegram 照片显示方式，Telegram 自身可能重新处理图片，这不等于逐字节归档。
- 相册既按 10 项限制，也按实际 multipart 请求体大小分批；单文件超过云端 50 MiB 上传限制时返回原作链接，不尝试把同一文件拆成多次有效上传。已缓存的 `file_id` 复用不下载或重传。
- 部分失败按资产标记，后续可发送项继续保持原顺序；确定的 413 才拆小相册，上传超时或断线不自动重发。
- 成功交付后按作品/资产保存 Telegram `file_id`（30 天）。同一 bot 内跨用户重复请求直接复用；任一资产缺失则回退完整抓取并重建缓存。
