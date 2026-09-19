# Public IP without a domain (VPS has only an IP)

**Language / 语言:** English · [中文](/VPS-public-ip.md)

If your VPS has a public IP but you do not want to register a domain yet, this document
describes deployment without a domain or TLS, and explains how the previously-rolled-back
"remote media manifest" can be re-enabled as an **optional switch** (off by default).

> Core principle: **with no domain, do not expose an external HTTP reverse proxy.** Telegram
> media is handed to Telegram as tokenized CDN URLs (`MODE=poll`), so the bot itself needs no
> public inbound port; TelePress binds only to `127.0.0.1` for local / same-network clients.

## 1. TL;DR

- DeviantDrop stays on **`MODE=poll`** and works without a domain: it actively calls
  `getUpdates`, so no HTTPS, certificate, webhook, or public port is required.
- TelePress listens only on **`127.0.0.1:8000`**, runs on the same host as DeviantDrop and
  talks over internal HTTP; it is not exposed publicly.
- Remote media manifest (letting TelePress fetch images server-side) is **off by default**;
  only turn it on when you genuinely want external clients to use it and accept that this
  turns TelePress into a "restricted server-side fetch proxy".
- Turning it on requires **both ends**:
  - TelePress server: `TELEPRESS_ALLOW_REMOTE_GALLERY_MEDIA=1`
  - DeviantDrop client: `TELEPRESS_REMOTE_GALLERY_MEDIA=1`
  If either is missing, the client automatically falls back to binary multipart (images go
  directly to Telegram / through TelePress native `files`); the bot is unaffected.

## 2. DeviantDrop deployment without a domain (recommended)

```bash
cp .env.example .env
# disable all public-inbound dependencies:
#   MODE=poll
#   do NOT set PUBLIC_BASE_URL / WEBHOOK_SECRET (webhook mode needs public HTTPS)
# if you are in mainland China, route egress through a proxy as usual:
#   HTTP_PROXY=http://127.0.0.1:7890  HTTPS_PROXY=http://127.0.0.1:7890
docker compose up -d --build
```

Verify:

```bash
curl -fsS http://127.0.0.1:8080/health
# {"ok":true,...} and components.telegram_ingress is polling
```

Send a DeviantArt artwork link to `@DeviantDropBot`; the bot downloads the images and sends
them over Telegram multipart, with no dependency on any public inbound port.

## 3. TelePress deployment without a domain

TelePress is an optional helper (large albums / Telegram send-failure fallback). Run it on
the same host:

```bash
# install the optional API dependency
pip install "telepress[api]==0.14.0"

# bind only the loopback interface, not 0.0.0.0
# set TELEPRESS_API_KEY and use the same key on both ends
TELEPRESS_API_KEY=your-key telepress-server --host 127.0.0.1 --port 8000
```

Point DeviantDrop's `.env` at it:

```ini
TELEPRESS_URL=http://127.0.0.1:8000
TELEPRESS_API_KEY=your-key
TELEPRESS_MODE=large-gallery      # or fallback; off disables it entirely
# TELEPRESS_REMOTE_GALLERY_MEDIA=1   # comment out = remote manifest is off
```

> When TelePress shares `127.0.0.1` with the bot, it needs no domain, TLS, reverse proxy, or
> public port.

## 4. Optional: expose TelePress to trusted external clients via a public IP

> This is **not recommended**; use it only when trusted external clients really need to reach
> TelePress over your public IP directly.

```bash
# 1. Make TelePress listen on 0.0.0.0 (note: plain HTTP)
TELEPRESS_API_KEY=a-strong-key \
TELEPRESS_ALLOW_REMOTE_GALLERY_MEDIA=1 \
telepress-server --host 0.0.0.0 --port 8000

# 2. Turn on the manifest client-side too (both ends must be enabled)
#    TELEPRESS_URL=http://<your-public-ip>:8000
#    TELEPRESS_REMOTE_GALLERY_MEDIA=1
```

In the cloud firewall, allow `8000/tcp` only from trusted source IPs; do not open it to the
whole internet. No network mask is a substitute for `TELEPRESS_API_KEY`.

Remote manifest limits:

- `sourceUrl` accepts only `https://`; per-file limit is 50 MiB, and exceeding it fails
  immediately.
- This makes TelePress a **restricted server-side fetch proxy**; before exposing it publicly,
  make sure you trust every client that can call it. It is off by default so a domain-less
  setup cannot accidentally become an open proxy.

## 5. Restore / default path (no configuration needed)

Leaving everything unset keeps the existing behavior:

1. DeviantDrop downloads image bytes → `client.publishGallery({ files })` → TelePress
   `/publish/gallery` uses only the `files` multipart path;
2. or DeviantDrop sends the images directly as Telegram media (native path, no Telegraph);
3. TelePress `/publish/rich-novel` image-host / manifest behavior is unaffected; its manifest
   proxy is now a **generic CDN proxy** (`TELEPRESS_MEDIA_PROXY_BASE` +
   `TELEPRESS_MEDIA_PROXY_HOSTS`), and the legacy `TELEPRESS_PIXIV_PROXY_BASE` remains only as
   a backwards-compatible alias.

## 6. FAQ

- **Remote manifest not taking effect?** Confirm `TELEPRESS_ALLOW_REMOTE_GALLERY_MEDIA=1`
  is in the telepress-server process environment and `TELEPRESS_REMOTE_GALLERY_MEDIA=1` is in
  the DeviantDrop process environment, with the same API key on both ends. If either is
  missing, DeviantDrop silently falls back to the binary path and never errors.
- **Is public-IP HTTP safe?** It is not (plaintext), so either keep loopback-only, or add a
  firewall allowlist plus a strong `TELEPRESS_API_KEY`. The best approach is still to add a
  domain later and put Caddy or a Cloudflare Tunnel in front for HTTPS.
- **Will the bot break if remote manifest fails?** No. DeviantDrop's TelePress integration is
  an optional helper; manifest failures silently fall back to multipart, and TelePress
  failures never affect native Telegram sends.
