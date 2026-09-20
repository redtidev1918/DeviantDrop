# Media Delivery Tests

**Language / Language:** [English](media-delivery.md) · [中文](../../testing/media-delivery.md)

Primary suite: `npm test`.

Reliability cases live in `test/delivery-reliability.test.js` and `test/video-regression.test.js`:

- cookie merge preserves `auth_secure` and `userinfo` while accepting rotated values;
- signed-in responses persist `Set-Cookie`; anonymous/logged-out responses cannot overwrite the snapshot;
- a video DTO's `media.baseUri` is poster-only; a missing web playback source triggers the OAuth fallback;
- OAuth `videos[].src` is treated as `video` and is not overridden by `content` / thumbnails;
- Telegram delivery uses a strict reply checkpoint (`allow_sending_without_reply: false`).

Existing suites cover mature-page degradation, album planning, multipart upload, OAuth rotation, and hot cookie updates.

Run `npm run check` before release (full tests + build check).
