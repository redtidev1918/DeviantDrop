# Media Pipeline

**Language / Language:** [English](media-pipeline.md) · [中文](../../architecture/media-pipeline.md)

See the Chinese canonical document: [../../architecture/media-pipeline.md](../../architecture/media-pipeline.md).


DeviantArt DTOs are normalized before Telegram:

```text
DeviantArt adapter → Normalized Media[] → Delivery planner → Telegram delivery
```

Kinds are `photo`, `video`, `animation`, and `document`. Video recognition covers
`mp4`, `m4v`, `webm`, `mov`, and `mkv`; GIF remains standalone animation. Senders
must not reinterpret DeviantArt DTOs.
