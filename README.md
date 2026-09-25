# DeviantDrop

**语言 / Language:** 中文 · [English](README.en.md)

> 把 DeviantArt 作品转到 Telegram 的 Bot:给 [@DeviantDropBot](https://t.me/DeviantDropBot) 发一条作品链接,收到图片 / 视频 / GIF / 文字作品。

[完整文档](https://redtidev1918.github.io/DeviantDrop/) · [更新日志](CHANGELOG.md)

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/Docs-文档站点-6366f1?style=flat-square)](https://redtidev1918.github.io/DeviantDrop/)

---

## 特性

- 识别消息 / caption 里的 DeviantArt 作品页链接(`https` / `www` / 旧式域名 / `fav.me` / `/view/{id}`),每条消息最多 5 个
- 支持图片、视频、GIF、文字作品;GIF / 动画始终独立发送,照片 / 视频连续片段用相册(`sendMediaGroup`)
- 成熟(NSFW)作品主图由官方 OAuth API 提供,无需 Cookie;多图附加页用可选网页会话增强
- 已交付作品按 Telegram `file_id` 缓存 30 天,同 bot 内重复请求直接复用
- `/start /help /about` 命令;每聊天限流、去重、429/500/503 退避重试
- 可选 [TelePress](https://github.com/redtidev1918/TelePress) 图集兜底

## 如何工作

```text
    Telegram                        DeviantDrop                       DeviantArt
  user / group  ──作品链接──►  Bot (长轮询)  ──解析/下载──►  官方 OAuth API / 网页接口
  chat  ◄──媒体+来源链接──  Bot 发送          ◄──metadata/媒体──  deviantart.com
```

**Telegram 更新通过长轮询(long polling)接收。不需要配置 Telegram Webhook。**

- **不需要公网 IP / 域名 / HTTPS** 即可运行:Bot 主动调用 `api.telegram.org` 的 `getUpdates` 拉取消息,不依赖任何入站端口。
- 家用服务器、VPS、NAS 都能跑——只要这台机器**能主动访问 Telegram 与 DeviantArt 的 API**。
- 唯一例外:要用 **webhook 模式**(可选)或 **Telegram 内的 Web 登录按钮**时,才需要公网 HTTPS(见下文)。

### Webhook 是可选的第二种传输方式

`MODE=webhook` 让 Telegram **直接推送**更新到你的 HTTP 端点(默认 `POST /webhook`)。它和 Polling 共用同一个更新处理入口,poll / webhook **二选一,不会同时运行**。

- 配置了 `PUBLIC_BASE_URL` 时,启动会自动向 Telegram 注册 setWebhook;注册失败会明确标记为不健康(`/health` 可见),不假装可用。
- **Webhook 需要的是"Telegram 能访问到的 HTTPS URL",不强制要求域名**——域名只是最常见、最方便的 TLS 方案(有公网 IP + 反代/隧道也可)。
- **重要:`Telegram Webhook` 与 `DeviantArt 出站访问` 是两个独立问题。** Webhook 只解决 Telegram→Bot;Bot 抓取 DeviantArt 仍用运行主机自己的出口,不会因启用 Webhook 而改变或绕过 DA 的出口要求。部署前照常 `npm run detect`。
- 手动注册方式(不配 `PUBLIC_BASE_URL`)见 [docs/deployment.md](docs/deployment.md#手动注册-webhook未配置-public-base_url)。

## 要求

| 需求 | 说明 |
| --- | --- |
| Node.js | **≥ 22**(`type: module`) |
| Telegram Bot Token | 来自 [@BotFather](https://t.me/BotFather) |
| DeviantArt OAuth | 在 [deviantart.com/developers](https://www.deviantart.com/developers/) 注册 **Confidential** 应用,拿 `CLIENT_ID` / `CLIENT_SECRET` |
| DeviantArt 放行的出口 | **必需**。DeviantArt 封锁数据中心出口(Cloudflare Workers 及多数云主机被拦),需住宅网络或已检测通过的部分 VPS;国内服务器走代理 |
| Docker | 可选(推荐,见下) |

## 快速开始

最短路径(先测出口,再部署):

```bash
# 1. 出口检测(确认这台机器能访问 DeviantArt)
npm install --omit=dev
npm run detect -- <client_id> <client_secret>

# 2. 配置
cp .env.example .env        # 填 BOT_TOKEN / CLIENT_ID / CLIENT_SECRET / ADMIN_IDS
                            # 国内机器:HTTP_PROXY / HTTPS_PROXY 指向本机 clash

# 3. 启动(默认 MODE=poll,长轮询,无需公网)
node src/main.js
```

## Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f deviantdrop
```

- **数据持久化**:Compose 挂载 `cache:/data` 卷,保存 `deviantart.json`(OAuth refresh token)、`deviantart-cookies.json`、`telegram-bot-token` 与缓存。**不要运行 `docker compose down -v`**,那会删除数据卷导致重新登录。
- `restart: unless-stopped`:崩溃自动重启,`/health` 持续可读。
- 更新:`git pull && docker compose up -d --build` 或 `npm run deploy:vps`(需配 `SERVER`)。

## 配置

完整变量表见 [docs/configuration.md](docs/configuration.md)。以下是最常用的:

| 变量 | 必需 | 默认 | 说明 |
| --- | --- | --- | --- |
| `BOT_TOKEN` | ✅ | — | Telegram bot token(BotFather)。运行时事实来源是 secret 文件,env 仅作首次 bootstrap |
| `BOT_TOKEN_FILE` | | `/data/secrets/telegram-bot-token` | token 运行时 secret 文件,支持热更新 |
| `WEBHOOK_SECRET` | ✅ | — | webhook 鉴权密钥;长轮询模式不参与但必填 |
| `CLIENT_ID` / `CLIENT_SECRET` | | — | DeviantArt 官方应用凭据 |
| `ADMIN_IDS` | | — | 管理员 Telegram 用户 ID(逗号分隔),`/login /status` 用 |
| `ALLOWED_USER_IDS` | | — | 允许使用 bot 的用户白名单,留空允许所有人 |
| `MODE` | | `poll` | `poll`=长轮询(默认,无需公网)或 `webhook`(需公网 HTTPS 反代;配置了 `PUBLIC_BASE_URL` 时启动自动注册 setWebhook) |
| `PORT` / `HTTP_HOST` | | `8080` / `127.0.0.1` | HTTP server 监听地址(poll/webhook 都监听) |
| `PUBLIC_BASE_URL` | | — | 见下方说明 |
| `HTTP_PROXY` / `HTTPS_PROXY` | | — | 国内出口代理地址 |
| `CAPTION_NOTES` | | `auto` | 是否在群聊隐藏技术性 ⚠️ 提示(`auto/always/never`) |
| `PREFER_ORIGINAL` | | — | 设 `1` 优先抓原图(免费账号原图有日配额) |

### `PUBLIC_BASE_URL` 的真实作用

`PUBLIC_BASE_URL` **不是** Telegram Webhook 配置。

它只用于**三类公网功能**:

1. **Web OAuth 登录回调** —— 让管理员在 Telegram 里发 `/login` 后,在浏览器完成 DeviantArt 授权。
2. **公开预览页 `/d/:id`** —— 供 Telegram/Discord 读取 OG metadata 的帖子缩略图。
3. **Webhook 自动注册**(当 `MODE=webhook` 时)—— 用 `${PUBLIC_BASE_URL}/webhook` 作为 Telegram 推送端点并自动 setWebhook。

配置它必须满足:

- 值是 **HTTPS origin**(如 `https://bot.example.com`,main.js 会校验协议必须是 `https:`)。
- 反代(如 Caddy / Nginx / CF Tunnel)将流量转发到 `HTTP_HOST:PORT`(默认 `127.0.0.1:8080`)。
- 把 `<域名>/auth/deviantart/callback` 加进 DeviantArt 应用的 redirect 白名单。

**不设置 `PUBLIC_BASE_URL` 完全可用**的两种方式:

- **无域名(推荐)**:用 `npm run login`,在你自己电脑的 Chrome 里完成 OAuth 授权 + 网页会话,经 ssh 推送到服务器,不依赖公网入口。
- **极简**:私聊给 bot 发 `/cookie <整行 Cookie>`。

> 域名是**推荐**但不是**必需**。设置与否只影响 Telegram 内登录按钮和预览页这两个加分项。

## 登录

DeviantArt 有两层独立认证(见 [docs/authentication.md](docs/authentication.md)):

1. **OAuth(官方 API)** —— 内容访问主认证层,成熟作品主图靠它,refresh token 无人值守续期。
2. **网页扩展会话(Cookie)** —— 可选增强,补齐官方 API 不提供的多图附加页。**不是**成熟内容权限。

管理命令(`/login` `/status` `/cookie`)只在**私聊**并且是 `ADMIN_IDS` 指定的管理员才可用。

三种登录方式(按推荐排序):

| 方式 | 需要 | 说明 |
| --- | --- | --- |
| `npm run login`(电脑一键) | 本机 Chrome/Edge,能访问 deviantart.com | 推荐,无域名也能用;OAuth + 网页会话一起保存 |
| Telegram 内 `/login` 按钮 | HTTPS 域名(`PUBLIC_BASE_URL`) | 纯 OAuth,方便 |
| `/cookie` | 已登录 DA 的浏览器 | 极简兜底;凭据经 Telegram 传输,发完可删消息 |

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm start` | 启动 `node src/main.js`(默认 poll) |
| `npm run login` | 电脑一键 OAuth + 网页会话登录(`VPS=user@host npm run login`) |
| `npm run token` | 查看 / 管理运行时 secret token |
| `npm run detect` | 检测出口对 DeviantArt 的放行 |
| `npm run check` | 全量测试 + 构建 dry-run 校验 |
| `npm run deploy:vps` | 测试 → push → SSH 拉取 → compose 重建(需 `SERVER`) |
| `npm run logs` | SSH 查看线上容器日志(需 `SERVER`) |

## 文档导航

| 我想… | 看这里 |
| --- | --- |
| 部署(VPS / Docker / Node、无域名) | [docs/deployment.md](docs/deployment.md) |
| 理解每个环境变量 | [docs/configuration.md](docs/configuration.md) |
| 登录与认证流程 | [docs/authentication.md](docs/authentication.md) |
| 部署后运维(token 热更、health、排障) | [docs/operations.md](docs/operations.md) |
| 内部工作原理 | [docs/architecture.md](docs/architecture.md) |
| 下载与版本 | [docs/download.md](docs/download.md) |

## 常见问题

- **Bot 不回复** —— 先看 `/health`(`curl -s http://127.0.0.1:8080/health | python3 -m json.tool`)。`telegram_ingress` 状态:残留 webhook 或另一个 poller 会导致 `conflict`(409);`unauthorized` 是 token 失效。
- **DeviantArt 登录失败** —— 确认出口未被 DA 封锁(`npm run detect`),且用真实浏览器登录(DA 有 AWS WAF 人机校验)。
- **Docker 重启后要重新登录** —— 数据卷(`cache:/data`)被删了,不要 `down -v`。
- **群里收不到普通链接** —— Bot 的「群组隐私模式」要关闭(BotFather → Bot Settings → Group Privacy → Turn off),再把 Bot 移出群拉回或设为管理员。

完整排障:[docs/operations.md](docs/operations.md#排障) 与 [docs/troubleshooting.md](docs/troubleshooting.md)。

## License

[MIT](LICENSE) © 2026 redtidev1918