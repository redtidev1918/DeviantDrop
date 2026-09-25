# 认证与登录

**语言 / Language:** 中文 · [English](/en/AUTH_AND_PREVIEW.md)

DeviantArt 有两层**互相独立**的能力,不要混成一件事:

| 层 | 角色 | 负责内容 |
| --- | --- | --- |
| **OAuth(官方 API)** | 内容访问主认证层 | 作品 metadata、**成熟(mature)主图**、官方 download/content、refresh token 无人值守续期 |
| **网页扩展会话(Cookie)** | 可选增强 | 补齐官方 API 不提供的 `deviation.extended.additionalMedia`(多图第 2…N 页) |

因此:**NSFW ≠ 必须 Cookie**。单图成熟作品只靠 OAuth 就能拿到未打码主图;网页会话失效只影响部分多图作品的附加页。

管理命令(`/login` `/status` `/cookie`)只在**私聊**且是 `ADMIN_IDS` 指定的管理员才可用。未配置管理员时一律拒绝。

## 三种登录方式

### ① 电脑一键登录(推荐,无域名也能用)

无需公网端口 / 域名 / 手动复制 Cookie / 重启。在你自己电脑上(需 Chrome/Edge,能访问 deviantart.com),于 DeviantDrop 目录运行:

```bash
VPS=root@<你的服务器> npm run login     # 等价于 node scripts/dd-login.mjs
```

脚本用 Chrome DevTools Protocol 打开 DeviantArt 官方登录页,你登录并点「Authorize/允许」,脚本同时捕获 ① OAuth 授权 code 和 ② 网页 Cookie,经 ssh 推送到服务器,兑换 refresh token 并原子落盘,立即生效。

为什么浏览器在你电脑上:DA 登录页有 AWS WAF 人机校验,令牌绑定浏览器环境;真实浏览器在真实 DA 域登录天然通过,服务器无头浏览器会被拦。脚本零新增依赖(Node ≥22 自带 WebSocket/fetch)。

完成后 `/status` 显示 `OAuth API: ✅ valid`、`Multi-image web expansion: ✅ valid`。

### ② Telegram 内 `/login` 按钮(需 HTTPS 域名)

配置 `PUBLIC_BASE_URL`(HTTPS 反代到 `127.0.0.1:8080`),把 `<域名>/auth/deviantart/callback` 加进 DA 应用 redirect 白名单,再私聊发 `/login` 点授权按钮。

注意:Telegram 内按钮走**纯 OAuth**,只建立账号授权,**不含网页 Cookie**。想让成熟多图附加页也未打码,用 ①。

### ③ `/cookie` 粘贴(极简兜底)

在已登录 DA 的浏览器复制整行 `Cookie:`(含 `auth=…; auth_secure=…; userinfo=…`),私聊发 `/cookie auth=…; auth_secure=…; userinfo=…`。Bot 存盘后立即探测并回报状态,还会尽力代删消息(凭据经过 Telegram,发完删掉;担心时在 DA「退出所有设备」作废)。

它恢复的是**多图扩展能力**,不是成熟内容权限。

## 首次部署 seed(一次性)

没有走上面任一流程前,可把已有 refresh token 写进 `.env` 的 `DA_REFRESH_TOKEN`(或 cookie 写 `DA_COOKIES`),容器首次启动会落盘到 `/data/auth/`,之后不再读回 env。

> 原图下载仍受 DA 免费账号每日额度限制;登录解决的是登录态 / 打码,不是额度。

## `/status` 查看状态

私聊发 `/status`,分别显示两条独立状态(不显示任何密钥):

- `OAuth API:` — 只看 OAuth 凭据。
- `Multi-image web expansion: missing|unknown|valid|expired` — 探测网页会话。文件里有 Cookie 只代表"有待验证的扩展会话"。

网络超时 / WAF / 5xx 只会让扩展能力显示 `unknown`,绝不误判为过期,也不影响 OAuth 状态;只有登录跳转或 `mature_loggedout` 才标 `expired`。

## 失效通知

OAuth 或网页会话失效时,bot 所有者分别接到失效通知(文案说明影响范围,6 小时冷却);恢复后另发一次恢复通知。失效通知里带一次性登录链接(电脑一键登录或 Telegram 内按钮)。

## 持久化

| 路径 | 内容 |
| --- | --- |
| `/data/auth/deviantart.json` | OAuth refresh token、状态、更新时间(原子写入,0600) |
| `/data/auth/deviantart-cookies.json` | 网页 Cookie(原子写入,0600) |
| `/data/cache.json` | file_id、限流、通知冷却、preview metadata |

见 [部署](deployment.md) 的 `cache:/data` 卷说明。会话丢失排查见 [会话恢复](operations/session-recovery.md)。