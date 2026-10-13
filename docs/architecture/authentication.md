# Authentication architecture

**Language / Language:** [中文](authentication.md) · [English](../en/architecture/authentication.md)

DeviantDrop has two credential planes:

```text
OAuth refresh token
  content access primary credential
  mature originals, metadata, official download

Web session cookie
  optional web extension capability
  additional album pages and `_puppy` access
```

## Web-session lifecycle

```text
seed → normalize → persist → load → validate
     ↺ refresh/replace → persist → restart recovery
```

- `DA_COOKIES` and legacy storage are bootstrap seeds. The first missing snapshot may be seeded.
- `/data/auth/deviantart-cookies.json` is the source of truth after that; it is never replaced by an old environment value.
- The snapshot stores the complete request header form, including `auth`, `auth_secure`, and `userinfo`.
- Writes use atomic JSON rename with `0600` permissions.
- Signed-in homepage responses merge upstream `Set-Cookie` rotation into the snapshot and preserve cookies not rotated.
- Signed-in evidence is scoped to `__INITIAL_STATE__['@@publicSession']` and
  requires a username; a login flag without identity remains unknown. A marker
  elsewhere in the page cannot expire the snapshot. This identity verdict does
  not establish entitlement to every work or web expansion capability.
- Anonymous/WAF/unknown and logged-out responses do not overwrite the live login snapshot.
- A corrupt file is treated as invalid; it cannot resurrect a stale environment seed.

See [../operations/session-recovery.md](../operations/session-recovery.md) for recovery.

Protocol regression samples live in `test/fixtures/`, with source and capture
date recorded. The live anonymous sample anchors page shape; synthetic signed-in
and malformed mutations test policy separately from real authenticated access.
