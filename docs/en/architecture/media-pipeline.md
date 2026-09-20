# Media Pipeline

**Language / Language:** [English](media-pipeline.md) · [中文](../../architecture/media-pipeline.md)

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

- The adapter owns all DeviantArt DTO interpretation (`media.types`, `additionalMedia`, OAuth `content` / `videos` / download).
- Every item carries `assetId`, `index`, `kind`, URL, fallback URL, and MIME metadata.
- A DTO's `isVideo` / `film` marker says the work is a video; `media.baseUri` is only a poster. Playable URLs must come from web `types[].t === "video"` or OAuth `videos[].src`.
- If the web response has no playable video source, the adapter falls back to the official API. It must not relabel the poster as a sendable image.
- Variants are ranked from the response (1080p → 360p). Recognized extensions include `mp4`, `m4v`, `webm`, `mov`, and `mkv`.
- GIF remains `animation`, never an image album item.
- The planner groups contiguous photo/video runs into `sendMediaGroup` batches (≤10 items) and sends animation standalone.
- Oversized photos are compressed or demoted to document; unsupported media fails visibly rather than becoming a false preview.
- Successfully delivered works are cached by Telegram `file_id` per work/asset for 30 days. Requests from any user of the same bot replay from cache; if any asset is missing, the adapter performs a full fetch and rebuilds the cache.
