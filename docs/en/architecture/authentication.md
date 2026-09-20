# Authentication

**Language / Language:** [English](authentication.md) · [中文](../../architecture/authentication.md)

See the Chinese canonical document: [../../architecture/authentication.md](../../architecture/authentication.md).


DeviantDrop has two credential planes:

```text
OAuth refresh token
  primary content-access credential
  mature originals, metadata, official download

Web session cookie
  optional web extension capability
  additional album pages and _puppy access
```

The web-session file is authoritative after bootstrap. `DA_COOKIES` is a seed only.
Signed-in responses merge upstream Set-Cookie rotation atomically; anonymous and
logged-out responses never overwrite a live login snapshot. See the Chinese
canonical page for the complete invariant list.
