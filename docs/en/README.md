# DeviantDrop Documentation

**Language / 语言:** [中文](/) · English

DeviantDrop is a Telegram bot: send a DeviantArt work link and it replies with the work's
image, video or GIF unchanged. It is a service, not a downloadable program.

The English documentation is **complete and page-for-page mirrored** with the Chinese section
under `/`.

## Entry points

| Document | Content |
| :-- | :-- |
| [Download & deploy](download.md) | How to get it running, and the DeviantArt egress requirement |
| [README (English)](https://github.com/redtidev1918/DeviantDrop/blob/main/README.en.md) | Overview, supported links, sign-in model, reply layout |

## Guides

| Document | Content |
| :-- | :-- |
| [VPS deployment handbook](VPS.md) | Mainland proxy setup, Docker/Node deployment, the egress check results, one-click login, push-to-deploy, and group-chat diagnostics |
| [Public IP / no-domain deployment](VPS-public-ip.md) | Keep `MODE=poll` and TelePress loopback-only; optional remote media manifest and public-IP hardening |
| [Authentication architecture](architecture/authentication.md) | OAuth versus web-session planes, persistence and refresh rules |
| [Media pipeline](architecture/media-pipeline.md) | Normalized media model and Telegram delivery planning |
| [Delivery lifecycle](architecture/delivery-lifecycle.md) | Source checkpoint, cancellation and failure semantics |
| [Session recovery](operations/session-recovery.md) | Runtime files, restart recovery and troubleshooting |
| [Media delivery tests](testing/media-delivery.md) | Reliability tests for auth, media and delivery |
| [Authentication, preview and publishing](AUTH_AND_PREVIEW.md) | First-time setup, the OAuth-primary + optional web-extension model, persistence and migration, the preview fixer, Telegram layout and TelePress |
| [Release orchestration](RELEASEGRAPH.md) | ReleaseGraph integration as verified, engine upgrade log, and the next-protocol switch-over checklist |

## Links

- Repository: <https://github.com/redtidev1918/DeviantDrop>
- Releases: <https://github.com/redtidev1918/DeviantDrop/releases>
- Changelog: <https://github.com/redtidev1918/DeviantDrop/blob/main/CHANGELOG.md>
