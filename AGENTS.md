# AGENTS.md — DeviantDrop reliability invariants

## External protocol verification (permanent rule, adopted 2026-10-13)

Any parsing logic that consumes an external API, web protocol, config format or
third-party data structure must first verify the actual data structure against
independently obtained real-world evidence (a live fetch, a captured document,
an authoritative spec). Test fixtures must be built from that real evidence —
never reverse-engineered from the current implementation. Record where and when
each sample was captured. This rule comes from the DAViewer v0.5.14 incident:
implementation, tests and refactors all reused one unverified protocol
assumption (`@publicSession` vs `@@publicSession` key spelling), so a fully
green suite could not catch the most basic compatibility break.

## Authentication and web session

1. OAuth refresh token is the primary content-access credential.
2. `DA_COOKIES` is bootstrap seed only; it may create the first snapshot when no file exists.
3. The persisted web-session file always wins over `DA_COOKIES` after bootstrap.
4. Cookie refresh must merge upstream `Set-Cookie` values into the persisted snapshot atomically (`0600`).
5. Anonymous, WAF, unknown, and logged-out probes must never overwrite a live login snapshot.
6. A signed-in verdict requires a server-stated username (`@@publicSession.user.username`); `isLoggedIn: true` without a user identity stays UNKNOWN, and network failures stay UNKNOWN — never EXPIRED.
7. Restart recovery must load and validate the file; corruption invalidates it, never restores a stale seed.

## Media and delivery

8. DeviantArt media is normalized into one model (`photo`, `video`, `animation`, `document`) before Telegram. A video DTO `media.baseUri` is only a poster; playable URLs must come from video sources (`media.types[].t === "video"` or OAuth `videos[]`). Literature works are inline `document` payloads, never fake images.
9. Telegram handlers and senders must not reinterpret DeviantArt DTOs; they execute the normalized delivery plan.
10. Every media item carries a stable `assetId`; replay and fallback use the same plan.
11. Delivery has a lifecycle: `received → processing → ready → checkpoint → sending → sent`, with `cancelled`/`failed`.
12. The reply to the source Telegram message is the final source-validity checkpoint. If it was deleted, cancel rather than fall back.
13. Bots cannot reliably observe arbitrary source-message deletions; therefore cancellation is best-effort plus a strict pre-send checkpoint.

## Ecosystem reuse

14. Before adding a media/auth behavior, investigate DAKit, DAViewer, and deviantart-downloader; reuse a proven implementation where it fits.
15. Architecture, operations, and testing docs must change together when these invariants change.

## Transient docs

16. One-off reports, phase snapshots and verification outputs are not committed.
    Keep completed work in the workspace archive, or move the evidence to
    `docs/archive/` with the docsite lifecycle block and keep it out of the
    user sidebar (`docsite.py lifecyclecheck` validates the conventions).

## Release notes

Keep release notes user-facing: about four bullets, one sentence per change.
Explain the visible benefit; keep root causes, logs and internal identifiers in
engineering docs. If both languages are present, align their items. Preserve
download/checksum sections and disclose material installation limits briefly.
