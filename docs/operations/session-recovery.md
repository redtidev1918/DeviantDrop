# Web session recovery

**Language / Language:** [中文](session-recovery.md) · [English](../en/operations/session-recovery.md)

## Files

- OAuth refresh token: `AUTH_DIR/deviantart.json` (default `/data/auth/deviantart.json`)
- Web session: `AUTH_DIR/deviantart-cookies.json` (default `/data/auth/deviantart-cookies.json`)

## Restart

1. Keep the `/data` volume attached.
2. Start DeviantDrop.
3. It loads the file before considering `DA_COOKIES`.
4. `probeWebSession` validates the cookie on first use and marks it `valid`, `expired`, or `unknown`.
5. `unknown` preserves the snapshot; only an authoritative expired response expires it.

The home-page probe reads `window.__INITIAL_STATE__['@@publicSession']`.
`valid` requires a server-rendered username; `isLoggedIn: true` without an identity
stays `unknown`. Signed-out text elsewhere in the page is not session evidence.
Only a confirmed signed-in response may persist Cookie rotation. The sanitized
2026-10-13 anonymous capture and its provenance are in `test/fixtures/`;
authenticated behavior is covered by synthetic policy tests, not a live login test.

POSIX hosts verify credential files as 0600 and their secret directory as 0700.
Windows uses ACLs; emulated mode bits do not verify equivalent access protection.

## Recovery

- Expired: use `/login` or `/cookie` in a private chat with an administrator.
- Corrupt file: replace the file or run `/cookie`; a stale environment seed is never restored.
- `permission denied`: check that `/data/auth` is writable by the container user.
- Container rebuilt but session lost: the `/data` volume is not mounted or points to a new location.
