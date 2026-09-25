# 内部架构

**语言 / Language:** 中文 · [English](/en/architecture/)

DeviantDrop 是**单一进程 / Worker**,接收 Telegram 更新,解析 DeviantArt 作品链接,下载媒体并发送回聊天。本页是内部工作原理的总览;各主题的英文细节见子页。

## 组成

```text
Telegram (getUpdates 长轮询 / webhook)
        │ 更新
        ▼
   src/main.js ──► src/index.js (handleUpdate) ──► 解析链接
        │                                        │
   http-server.js                          DeviantArt 适配器
   (/health /media /auth/* /d/*)           ├─ OAuth 官方 API(主)
                                           └─ 网页 _puppy(结构/多图)
        │
        ▼
   下载媒体 ─► 发送(caption/相册/单发) ─► Telegram
```

## 模块

- **`src/main.js`** — Node 版生命周期与依赖装配:secret store、CredentialStore/CookieStore、OAuth flow、HTTP server、Telegram ingress 控制器、故障域登记。
- **`src/index.js`** — 核心 bot 逻辑:`fetch` 路由(`/health /media /auth/* /d/* /webhook`)与 `handleUpdate`(解析、下载、发送、缓存)。
- **`src/telegram/ingress.js`** — Telegram 入口:token 验证、poll 长轮询 loop、webhook 模式、token 热更新时的入口重建。保证**任何时刻最多一个 getUpdates 在飞**。
- **`src/auth/`** — credential-store、cookie-store、token(内存 access/串行 refresh)、oauth-login、http-auth、auth-notifier。
- **`src/deviantart/`** — 双通道适配器:官方 OAuth API + 网页 `_puppy`;媒体规范化。
- **`src/preview/server.js`** — 公开预览页 `/d/:id` 与安全媒体代理(防 SSRF)。
- **`src/publishing/`** — TelePress 可选图集。
- **`src/network.js`** — 原生 fetch、代理、连接失败回退。

## 双通道取媒体

1. **OAuth 通道**(内容访问主层):refresh token → access token → 官方 API metadata 与媒体;成熟主图优先官方 `content`/`download`。
2. **网页通道**:匿名(CSRF/cookie)取作品结构与附加页;网页扩展会话(Cookie)只补齐多图附加页的未打码版本。

失败降级:官方 API 失败保留网页结果继续发;网页失效只降级附加页,绝不用打码图顶替已拿到的 OAuth 原图。

## 媒体送达

- 已交付作品按 Telegram `file_id` 缓存 30 天,同 bot 跨用户复用。
- 连续 photo/video 用 `sendMediaGroup` 相册(>10 自动分批);GIF/animation 独立 `sendAnimation`;超大图先压缩,失败再以 document 发送。
- poll 模式(无公网反代)下载媒体后 multipart 上传;webhook 模式经 15 分钟 HMAC 签名代理流式转发(支持 Range)。

## 故障域

| 域 | 关键 | 失败行为 |
| --- | --- | --- |
| `http_server` | ✅ | `/health` 保持可读 |
| `telegram_ingress` | ✅ | 401 退避重试,不退出 |
| `telegram_auth` | ✅ | 不退出 |
| `telegram_bot` | 信息 | — |
| `deviantart_auth` | 否 | 不影响命令回复 |

## 子页

- [认证架构（英文）](architecture/authentication.md)
- [媒体管线（英文）](architecture/media-pipeline.md)
- [Delivery 生命周期（英文）](architecture/delivery-lifecycle.md)
- [会话恢复](operations/session-recovery.md)