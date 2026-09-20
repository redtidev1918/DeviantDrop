# Media pipeline architecture

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

- The adapter owns DeviantArt DTO knowledge (`media.types`, `additionalMedia`, OAuth content/download).
- Every item carries `assetId`, `index`, `kind`, URL, fallback URL, and MIME metadata.
- Video variants are ranked from the response (1080p → 360p); recognized file kinds include `mp4`, `m4v`, `webm`, `mov`, and `mkv`.
- GIF remains `animation`, never an image album item.
- The planner groups contiguous photo/video runs into `sendMediaGroup` batches and sends animation standalone.
- Oversized photos are compressed or demoted to document; unsupported media fails visibly rather than becoming a false preview.
