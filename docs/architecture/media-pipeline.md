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
- Literature 使用 `/art/` URL 且可能没有 media 描述符：适配器读取内联 `textContent`，规范化为 `.txt` document；不会伪装成图片或直接失败。
- 付费/订阅（Premium Folder / tier）作品识别为 `locked-preview`：非成熟内容的模糊主图不再当作原图发送，caption 明确提示需要订阅/购买。
- Planner 只按规范化后的模型分批：连续 photo/video 用 `sendMediaGroup`（≤10 项），animation 单独发送。
- 超大图先压缩，失败则转 document；不支持的媒体显式失败，不能静默降级成假预览。
- 成功交付后按作品/资产保存 Telegram `file_id`（30 天）。同一 bot 内跨用户重复请求直接复用；任一资产缺失则回退完整抓取并重建缓存。
