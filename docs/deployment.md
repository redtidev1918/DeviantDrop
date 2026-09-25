# 部署

**语言 / Language:** 中文 · [English](/en/VPS.md)

DeviantDrop 跑在**普通服务器 / 家用机**上(不是 Cloudflare Workers——其出口被 DeviantArt 封锁)。本页解决"我怎样把 DeviantDrop 跑起来"。

## 出口要求(先读)

DeviantArt 会封锁数据中心的出口 IP。Cloudflare Workers 与多数云主机都被拦,所以在部署前**先检测**这台机器的出口是否被 DA 放行。

```bash
npm install --omit=dev
node scripts/detect-da.mjs <client_id> <client_secret>
```

- 直连不通(国内被墙):先用代理再测。
- 输出 200 / 正常 = 可用;403 / 超时 = 换出口。

> 2026-09 实测:阿里云直连 DA 超时;经机场(HK)出口官方 API 与网页均 200;Cloudflare / Fly 出口被 DA 按数据中心 IP 拦截。机场出口通常可用。

## Docker(推荐)

```bash
cp .env.example .env                # 填 BOT_TOKEN / WEBHOOK_SECRET / CLIENT_ID / CLIENT_SECRET
# 国内出口让 Bot 走代理:.env 里设
#   HTTP_PROXY=http://127.0.0.1:7890  HTTPS_PROXY=http://127.0.0.1:7890
docker compose up -d --build
docker compose logs -f deviantdrop
```

要点(compose 已配置,无需手动改):

- **`network_mode: host`**:国内服务器复用宿主机的 `127.0.0.1:7890` 代理,也满足反代场景。
- **数据持久化**:挂载 `cache:/data` 卷,存 OAuth refresh token、Cookie、bot token 与缓存。`restart: unless-stopped` 崩溃自动重启。
- **更新**:`git pull && docker compose up -d --build`。
- **不要 `docker compose down -v`**:会删掉数据卷导致重新登录。

## Node(不装 Docker)

```bash
npm install --omit=dev
export BOT_TOKEN=... WEBHOOK_SECRET=... CLIENT_ID=... CLIENT_SECRET=...
export MODE=poll HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890
node src/main.js
```

`MODE=poll`(默认):长轮询,无需公网入口。

## 接入模式:轮询 or Webhook

| 模式 | 公网需求 | 说明 |
| --- | --- | --- |
| `MODE=poll`(默认) | **无** | 主动向 Telegram `getUpdates` 拉取,不需 HTTPS / 域名 / 证书,本机无入站端口。**国内服务器推荐**。 |
| `MODE=webhook` | HTTPS 反代 + 公网 URL | Telegram 直接推送 HTTP 到你的 endpoint。**配置了 `PUBLIC_BASE_URL` 时启动自动注册 setWebhook**;未配置则手动注册(见下)。 |

### Telegram Webhook 与 DeviantArt 出站访问是两个独立问题

**`MODE=webhook` 只解决 `Telegram → DeviantDrop` 这一半。** 它**不改变、也不缓解** `DeviantDrop → DeviantArt` 的出站要求:

- Webhook 能访问不等于 Bot 能访问 DeviantArt。Telegram 推送的是 HTTPS 请求到你的 HTTP server;而 Bot 抓取 DeviantArt 用的是**它自己所在主机的出口**。
- DeviantDrop 的 DeviantArt 抓取**始终从当前运行环境出站**(同一 VPS 或家用机),代理 / Cookie / 认证 / UA / 重试逻辑都与传入方式无关。
- 项目实际部署中发现,不同数据中心出口对 DeviantArt 的访问兼容性存在差异(Cloudflare 等被按数据中心 IP 拦截)。请优先使用**已经验证可正常访问 DeviantArt** 的出口,启用 Webhook 不会绕过这一前提。
- 部署前先跑 `npm run detect`(见「出口要求」)确认当前主机能正常访问 DeviantArt。

> 高级部署(可选,默认不支持):`Telegram → 公网 HTTPS 反代 → 私网(如 Tailscale/WireGuard)中的 DA-compatible runtime → DeviantArt`。可行性依赖反代能代理到私网 runtime;DeviantArt 请求仍由该 runtime 的出口发出。除非你确实需要这种拓扑,否则把 Bot 直接跑在能访问 DA 的主机上即可。

### 手动注册 webhook(未配置 PUBLIC_BASE_URL)

```bash
curl -fsS "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=https://your-host/webhook" \
  --data-urlencode "secret_token=${WEBHOOK_SECRET}" \
  --data-urlencode 'allowed_updates=["message","channel_post"]'
```

> 二选一,别同时开。`MODE=poll` 启动会自动摘掉残留 webhook(否则 getUpdates 会 409);`MODE=webhook` 切换回 poll 前记得删 webhook 或停掉 webhook 进程。

## 无域名部署

**没有公网 IP、也没有域名,完全可用。** 保持 `MODE=poll`,Telegram 更新主动拉取,不需要任何公网入站。

唯一"想要但没有域名会损失"的是 **Telegram 内 `/login` 按钮**和**预览页 `/d/:id`**——但登录有替代路径(见 [认证与登录](authentication.md)):用 `npm run login`(电脑一键)或 `/cookie`。

## 命令菜单(一次性)

Bot 启动时会自动注册 `setMyCommands`(`registerCommands`)。如需手动:

```bash
curl -fsS "https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands" \
  -H 'Content-Type: application/json' \
  -d '[{"command":"start","description":"开始使用"},{"command":"help","description":"查看用法"},{"command":"about","description":"项目介绍与源码仓库"}]'
```

## 推送即部署(可选)

仓库 `.github/workflows/deploy.yml` 可在 main 更新时自动部署。需配三个 secret:

- `VPS_HOST` = 服务器地址
- `VPS_USER` = 部署用户(如 `root`)
- `VPS_SSH_KEY` = 部署用私钥内容(推荐单独生成)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/deviantdrop_deploy -N ""
ssh-copy-id -i ~/.ssh/deviantdrop_deploy.pub root@your-server.example
cat ~/.ssh/deviantdrop_deploy        # 内容贴进 VPS_SSH_KEY
```

之后本地 `npm run deploy:vps` 或 main 更新即自动 `git pull + docker compose up -d --build`。