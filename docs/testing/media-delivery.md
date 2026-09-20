# Media delivery tests

**Language / Language:** [中文](media-delivery.md) · [English](../en/testing/media-delivery.md)

Primary suite: `npm test`.

Reliability cases live in `test/delivery-reliability.test.js`:

- cookie merge preserves `auth_secure` and `userinfo` while accepting rotated values;
- signed-in responses persist `Set-Cookie`; anonymous/logged-out responses cannot overwrite the snapshot;
- webm/mov/mp4 DTOs normalize as video with stable asset metadata;
- Telegram delivery uses a strict reply checkpoint (`allow_sending_without_reply: false`).

Existing suites cover mature-page degradation, album planning, multipart upload, OAuth rotation, and hot cookie updates.
