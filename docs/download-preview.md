## 获取与部署

DeviantDrop 是 Telegram Bot 服务,**不发安装包**,无需克隆仓库即可部署。以下文件仅用于确认最新版本号与发版元数据。

**部署方式**(不需要下载任何二进制):

1. `git clone https://github.com/redtidev1918/DeviantDrop.git`(或用 `npm run deploy:vps` 的仓库已有副本)
2. `cp .env.example .env` 并填入 `BOT_TOKEN` / `CLIENT_ID` / `CLIENT_SECRET`
3. `docker compose up -d --build`(推荐)或 `node src/main.js`

> ⚠️ **出口要求**:DeviantArt 封锁数据中心出口(Cloudflare Workers 与多数云主机被拦)。Bot 须跑在 **DeviantArt 放行的出口**(住宅网络或已检测通过的部分 VPS)上。

- 完整部署步骤:部署 / VPS / Node / Docker → [部署](deployment.md)
- 认证与会话:→ [认证与登录](authentication.md)