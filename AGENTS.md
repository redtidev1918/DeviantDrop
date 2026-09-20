# AGENTS.md — DeviantDrop reliability invariants

## Authentication and web session

1. OAuth refresh token is the primary content-access credential.
2. `DA_COOKIES` is bootstrap seed only; it may create the first snapshot when no file exists.
3. The persisted web-session file always wins over `DA_COOKIES` after bootstrap.
4. Cookie refresh must merge upstream `Set-Cookie` values into the persisted snapshot atomically (`0600`).
5. Anonymous, WAF, unknown, and logged-out probes must never overwrite a live login snapshot.
6. Restart recovery must load and validate the file; corruption invalidates it, never restores a stale seed.

## Media and delivery

7. DeviantArt media is normalized into one model (`photo`, `video`, `animation`, `document`) before Telegram.
8. Telegram handlers and senders must not reinterpret DeviantArt DTOs; they execute the normalized delivery plan.
9. Every media item carries a stable `assetId`; replay and fallback use the same plan.
10. Delivery has a lifecycle: `received → processing → ready → checkpoint → sending → sent`, with `cancelled`/`failed`.
11. The reply to the source Telegram message is the final source-validity checkpoint. If it was deleted, cancel rather than fall back.
12. Bots cannot reliably observe arbitrary source-message deletions; therefore cancellation is best-effort plus a strict pre-send checkpoint.

## Ecosystem reuse

13. Before adding a media/auth behavior, investigate DAKit, DAViewer, and deviantart-downloader; reuse a proven implementation where it fits.
14. Architecture, operations, and testing docs must change together when these invariants change.
