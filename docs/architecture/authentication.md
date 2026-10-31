# Authentication architecture

**语言 / Language:** [中文](authentication.md) · [English](../en/architecture/authentication.md)

DeviantDrop has two credential planes:

```text
OAuth refresh token
  primary content-access credential
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

- `DA_COOKIES` and legacy storage are bootstrap seeds; the first missing snapshot may be seeded from them.
- After that, `/data/auth/deviantart-cookies.json` is the source of truth and is never replaced by an old environment value.
- The snapshot stores the complete request header form: `auth`, `auth_secure`, and `userinfo`.
- Writes use atomic JSON rename with `0600` permissions.
- Signed-in homepage responses merge upstream `Set-Cookie` rotation into the snapshot and preserve cookies not rotated.
- Signed-in evidence is scoped to `__INITIAL_STATE__['@@publicSession']` and requires a username. A login flag without identity stays unknown, and a marker elsewhere in the page cannot expire the snapshot. This identity verdict does not by itself establish entitlement to every work or web expansion capability.
- Anonymous/WAF/unknown and logged-out responses do not overwrite the live login snapshot.
- A corrupt file is treated as invalid; a stale environment seed is never resurrected from it.

Recovery steps: [../operations/session-recovery.md](../operations/session-recovery.md).

Protocol regression samples live in `test/fixtures/`, each with source and capture date recorded. The live anonymous sample anchors the page shape; synthetic signed-in and malformed mutations test policy separately from real authenticated access.
