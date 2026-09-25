# 配置

**语言 / Language:** 中文 · [English](/en/README.md)

所有配置都在 `.env`(或进程环境变量)。从 [`.env.example`](https://github.com/redtidev1918/DeviantDrop/blob/main/.env.example) 复制成 `.env` 后编辑。

```bash
cp .env.example .env
```

## 必需变量

| 变量 | 说明 |
| --- | --- |
| `BOT_TOKEN` | Telegram bot token([@BotFather](https://t.me/BotFather) 创建)。**只作首次 bootstrap**:运行时事实来源是 `BOT_TOKEN_FILE` 指定的 secret 文件,文件优先于 env。 |
| `WEBHOOK_SECRET` | webhook 鉴权密钥。长轮询(`MODE=poll`)模式不参与鉴权,但**必填**(缺失会记 `config_missing` 事件)。可用 `openssl rand -hex 32` 生成。 |

## 接入模式与 HTTP

| 变量 | 必需 | 默认 | 说明 |
| --- | --- | --- | --- |
| `MODE` | | `poll` | `poll`=长轮询(默认,无需公网);`webhook`=需 HTTPS 反代并手动注册 setWebhook |
| `PORT` | | `8080` | HTTP server 监听端口(poll 与 webhook 都启动,提供 `/health` 与登录回调) |
| `HTTP_HOST` | | `127.0.0.1` | HTTP 监听地址,默认只绑回环;反代转发到此 |
| `PUBLIC_BASE_URL` | | 空 | 公网 HTTPS origin(如 `https://bot.example.com`)。**只用于 Web OAuth 回调与预览页 `/d/:id`,不是 webhook 配置**。协议必须是 HTTPS,否则启动报错。需把 `<域名>/auth/deviantart/callback` 加进 DA 应用 redirect 白名单。 |

## DeviantArt 凭据

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `CLIENT_ID` | ① | DeviantArt 官方应用 ID(deviantart.com/developers 注册 **Confidential** 应用) |
| `CLIENT_SECRET` | ① | 对应应用密钥 |
| `DA_REFRESH_TOKEN` | | 仅作**首次迁移 seed**:写入 `/data/auth/deviantart.json` 后以文件为准,不再读回 env |
| `DA_COOKIES` | | 仅作**首次迁移 seed**:写入 `/data/auth/deviantart-cookies.json` 后以文件为准 |

① 强烈推荐填官方 API 凭据:匿名网页路径仅在 DA 未封禁的出口可用;成熟作品主图靠 OAuth。不填则尝试匿名网页路径。

## 权限

| 变量 | 说明 |
| --- | --- |
| `ADMIN_IDS` | 管理员 Telegram 用户 ID,逗号分隔。`/login /status /cookie` 只允许管理员私聊;未设置且 `ALLOWED_USER_IDS` 为空时拒绝所有管理命令。 |
| `ALLOWED_USER_IDS` | 允许使用 bot 的用户白名单(逗号分隔),留空允许所有人。不是管理员。 |

## 出口代理(国内服务器)

| 变量 | 说明 |
| --- | --- |
| `HTTP_PROXY` | 出口代理地址,如 `http://127.0.0.1:7890`(本机 clash / mihomo) |
| `HTTPS_PROXY` | 同上;media CDN 国内可直连且更稳,连接失败自动切换 |

## 媒体与发送

| 变量 | 必需 | 默认 | 说明 |
| --- | --- | --- | --- |
| `PREFER_ORIGINAL` | | 空 | 设 `1` 优先抓原图;免费账号原图有日配额,默认用最高清展示图 |
| `CAPTION_NOTES` | | `auto` | 技术性 ⚠️ 提示是否显示:`auto`(私聊显示、群聊隐藏)/ `always` / `never` |
| `CACHE_FILE` | | `/data/cache.json` | 缓存文件路径(compose 里设置) |

## 运行时 secret 与持久化

| 变量 | 说明 |
| --- | --- |
| `BOT_TOKEN_FILE` | 默认 `/data/secrets/telegram-bot-token`(目录 0700 / 文件 0600)。token 热更新的事实来源。 |
| `AUTH_DIR` | 默认 `/data/auth`。存 `deviantart.json`(OAuth refresh token)与 `deviantart-cookies.json`(网页会话)。 |

## TelePress(可选)

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `TELEPRESS_URL` | 空 | TelePress 地址;同机建议 `http://127.0.0.1:<port>`。空=不启用 |
| `TELEPRESS_API_KEY` | 空 | TelePress 侧配置的 Bearer key,两端同一个 |
| `TELEPRESS_MODE` | `fallback` | `off`(永不调用)/ `fallback`(仅 Telegram 失败兜底)/ `large-gallery`(图片>10 主动建页)/ `always`(不推荐) |
| `TELEPRESS_REMOTE_GALLERY_MEDIA` | 关 | 设 `1` 开启远程 media manifest(需 TelePress 服务端同时开 `TELEPRESS_ALLOW_REMOTE_GALLERY_MEDIA=1`) |

## 完整示例

见 [`.env.example`](https://github.com/redtidev1918/DeviantDrop/blob/main/.env.example) 中的逐条注释。