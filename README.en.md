# DeviantDrop

**Language / 语言:** [中文](README.md) · English

📖 Full documentation: <https://redtidev1918.github.io/DeviantDrop/> · [Changelog](CHANGELOG.md)

A Telegram bot that "drops" DeviantArt works into your chat: send a work link and
DeviantDrop replies with the artwork's image, video or GIF unchanged.

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/Docs-documentation-6366f1?style=flat-square)](https://redtidev1918.github.io/DeviantDrop/)

**Try it**: send a work link to [@DeviantDropBot](https://t.me/DeviantDropBot). It replies with that work's image / video / GIF and a `source` link in the caption. Self-hosting is only needed if you want your own instance.

**Deployment constraint**: DeviantArt blocks datacenter egress (Cloudflare Workers and
most cloud hosts are blocked). Run the bot on an egress DeviantArt allows (a residential
network, or one of the VPS providers that has passed the check); see the
[VPS handbook](docs/VPS.md).

## Quick deployment

```bash
cp .env.example .env    # fill in BOT_TOKEN / WEBHOOK_SECRET / official API credentials; set a proxy on mainland-China hosts
docker compose up -d --build
```

**What you need**: a `BOT_TOKEN` from [@BotFather](https://t.me/BotFather); a DeviantArt
official app (register at deviantart.com/developers and put its `CLIENT_ID` / `CLIENT_SECRET`
into `.env` for OAuth access); and an egress DeviantArt allows (see above). No Docker?
`npm install --omit=dev` then `node src/main.js`.

## What it handles

Full guides — sign-in and owner commands, groups and channels, reply layout, the optional
TelePress publish path, and troubleshooting — live on the docs site:
<https://redtidev1918.github.io/DeviantDrop/>

- Recognises work-page links inside messages and captions (`https` / `www` / legacy domains /
  `fav.me` / `/view/{id}`), processing up to 5 at once; short links resolve the author by following
  the redirect, and the bot asks for the full work-page URL when that does not resolve.
- **The website `_puppy` endpoints come first** (work structure / GIF / new works /
  `additionalMedia` all come from the same adapter); OAuth is used as the fallback when needed.
- For videos, `media.baseUri` is only a poster. Playable URLs must come from web
  `types[].t == "video"` or OAuth `videos[].src`; if neither is available, DeviantDrop falls
  back to the official API instead of sending the poster as an image.
- A successfully delivered work is cached by Telegram `file_id` for 30 days. Later requests from
  any user of the same bot replay it without downloading or uploading the binary again.
- Photo/video sequences are sent as `sendMediaGroup` albums (auto-batched above 10 items);
  GIF/animation always uses a standalone `sendAnimation` so captions are never split or
  duplicated; oversized images are compressed first and sent as documents if that fails; when
  Telegram cannot reach the CDN, the file is downloaded and uploaded as multipart.
- `/start` `/help` `/about` commands; per-chat rate limiting, de-duplication, and
  429/500/503 backoff retries.

### Dependencies

- **Runtime**: Node.js ≥ 22. Only two
  production dependencies: `undici` (HTTP and China-egress proxy) and `sharp` (>10MB image
  compression, lazy-loaded). See [package.json](package.json).
- **Development**: `wrangler` is only used for local `dev`/dry-run validation and is never
  installed into the Docker image.
- **Optional external services**: [TelePress](https://github.com/redtidev1918/TelePress)
  (Telegraph gallery fallback) and the [DAViewer](https://github.com/redtidev1918/DAViewer)
  client (desktop DeviantArt browser, see below).

### Related projects & credits

- [DAViewer client (sister project)](https://github.com/redtidev1918/DAViewer): a desktop
  DeviantArt browser. The "📲 DeviantArt 客户端" button on single-image/video replies points to
  its [download page](https://redtidev1918.github.io/DAViewer/#/download), and `/about`
  mentions it too.
- [TelePress](https://github.com/redtidev1918/TelePress): optional Telegraph gallery publishing.
- Implementation sources: [deviantart-downloader](https://github.com/redtidev1918/deviantart-downloader)
  (CSRF, deviation IDs, cookie reuse, media URLs), [DAKit](https://github.com/redtidev1918/DAKit)
  (`_puppy`/`dadeviation`/`init` flows and URL compatibility), and
  [TelePost](https://github.com/redtidev1918/TelePost) (Telegram media type mapping). Full list
  in [docs/README.md](docs/README.md#implementation-sources).

The full parsing mechanics, dual-channel details, rate limiting, deployment and
troubleshooting live on the **documentation site**:

https://redtidev1918.github.io/DeviantDrop/

### Public preview page

With an HTTPS `PUBLIC_BASE_URL`, the bot serves `/d/:id` for Telegram/Discord to read OG
metadata. It only publishes the public thumbnail from the anonymous oEmbed payload and never
exposes signed-in media.

Full operation, data migration and limits: [authentication and preview guide](docs/AUTH_AND_PREVIEW.md);
release orchestration (ReleaseGraph integration status and next-protocol switchover checklist):
[release orchestration](docs/RELEASEGRAPH.md); deployment and egress-check conclusions:
[VPS deployment guide](docs/VPS.md).
