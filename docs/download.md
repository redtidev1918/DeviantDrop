<!-- docsite-release-repo: redtidev1918/DeviantDrop -->
<!-- docsite-release-tag: v1.15.0 -->
# 📥 下载 DeviantDrop

**语言 / Language:** 中文 · [English](/en/download.md)

<!-- docsite: generated from redtidev1918/DeviantDrop release v1.15.0; do not edit by hand -->

本页由 GitHub Actions 在每次发版时**自动更新**，始终指向最新 Release。

## 最新版本：`v1.15.0`（2026-09-26）

👉 [查看 Release 说明与校验和](https://github.com/redtidev1918/DeviantDrop/releases/tag/v1.15.0)

## 获取与部署

DeviantDrop 是 Telegram Bot 服务,**不发安装包**,无需克隆仓库即可部署。以下文件仅用于确认最新版本号与发版元数据。

**部署方式**(不需要下载任何二进制):

1. `git clone https://github.com/redtidev1918/DeviantDrop.git`(或用 `npm run deploy:vps` 的仓库已有副本)
2. `cp .env.example .env` 并填入 `BOT_TOKEN` / `CLIENT_ID` / `CLIENT_SECRET`
3. `docker compose up -d --build`(推荐)或 `node src/main.js`

> ⚠️ **出口要求**:DeviantArt 封锁数据中心出口(Cloudflare Workers 与多数云主机被拦)。Bot 须跑在 **DeviantArt 放行的出口**(住宅网络或已检测通过的部分 VPS)上。

- 完整部署步骤:部署 / VPS / Node / Docker → [部署](deployment.md)
- 认证与会话:→ [认证与登录](authentication.md)

| 平台 | 文件 | 大小 | 下载 |
|---|---|---|---|
| 通用 | `RELEASE-METADATA.json` | 1 KB | [⬇️ 下载](https://github.com/redtidev1918/DeviantDrop/releases/download/v1.15.0/RELEASE-METADATA.json) |
