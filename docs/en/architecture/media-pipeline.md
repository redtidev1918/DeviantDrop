# Media Pipeline

**语言 / Language:** [English](media-pipeline.md) · [中文](../../architecture/media-pipeline.md)

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
- A static image's Wix token can constrain dimensions for its exact path while rejecting the bare `baseUri`. For the verified token-index-0 case, use the supplied `fullview` and retain `representation: fullview` and `originalAvailable: false` internally. Artwork captions omit file-version terminology. This is separate from blurred/paid restrictions. Unknown tokens, GIFs and videos retain their existing selection; small previews are not substituted automatically.
- Literature uses `/art/` URLs and may have no media descriptor. The adapter reads inline `textContent`, normalizes it to a `.txt` document, and never fakes it as an image or fails outright.
- Paid / subscription-locked (Premium Folder / tier) works surface as `locked-preview`: a blurred non-mature main is no longer sent as the original, and the caption says the work needs a subscription/purchase.
- The planner groups contiguous photo/video runs into `sendMediaGroup` batches (≤10 items) and sends animation standalone.
- Photos exceeding 10 MiB are sent as documents using unchanged bytes, without re-encoding. Download failures do not silently substitute display images. Normal photos use Telegram's photo delivery, which may process them and is not byte-for-byte archival.
- Successfully delivered works are cached by Telegram `file_id` per work/asset for 30 days. Requests from any user of the same bot replay from cache; if any asset is missing, the adapter performs a full fetch and rebuilds the cache.
