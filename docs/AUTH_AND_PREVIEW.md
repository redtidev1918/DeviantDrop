# 认证、预览和可选 Telegraph 发布

**语言 / Language:** 中文 · [English](/en/AUTH_AND_PREVIEW.md)

> **登录怎么做**看 [认证与登录](authentication.md)。本页讲认证模型、公开预览页,以及特殊的 TelePress / 远程媒体配置。

## 认证模型:OAuth 主认证 + 可选的网页扩展

两层能力互相独立(唯一决策点在 `src/deviantart/adapter.js`):

| 层 | 职责 |
| --- | --- |
| **OAuth(官方 API)** | 内容访问主认证层:metadata、**mature 主图**、官方 download/content、refresh token 续期 |
| **网页扩展会话(Cookie)** | 可选增强:官方 API 不提供的 `deviation.extended.additionalMedia`(多图第 2…N 页) |

要求:**Cookie 失效绝不能让成熟作品整体失败**。成熟主图可用性由 OAuth 决定;网页扩展失败的影响被局部化到附加页。

- 解析流程:网页 `_puppy/dadeviation/init` 提供作品结构(数字 ID 直达)与 `extended.deviationUuid`;成熟作品**主图**一律优先用官方 API 的 `content`/`download`,未打码与 Cookie 无关。
- 网页 DTO 缺 uuid(被 block 的常见响应)会再走 uuid 解析,保证"只有 OAuth、没有 Cookie"也能拿回未打码主图。
- 官方 API 失败(网络/额度/凭据)不中断发送:保留网页结果继续发,打结构化日志。
- `mature_loggedout` 只用于会话记账(标 expired、清缓存、通知一次);超时/WAF/5xx 保持 `unknown`。
- 只有"既无 OAuth、网页也未授权"才产生「打码预览」提示,不伪装完整结果。

## 持久化

| 路径 | 内容 |
| --- | --- |
| `/data/auth/deviantart.json` | refresh token、状态、更新时间(原子写入,0600) |
| `/data/auth/deviantart-cookies.json` | Cookie(原子写入,0600) |
| `/data/cache.json` | file_id、限流、通知冷却、preview metadata、Telegraph URL |

复用已有 `cache:/data` 卷,不建新卷。**禁止删卷升级**;升级前备份整个卷。

access token 与网页 `_puppy` 会话只放内存;refresh token 串行刷新。首次迁移优先旧 `/data/refresh_token`,再用 `DA_REFRESH_TOKEN`;已有 store 后绝不回退 env。

## Preview Fixer(公开预览页)

`PUBLIC_BASE_URL` 设置后提供 `/d/:id`(OG metadata)与 `/d/:id/image`(安全媒体代理):

- `/d/:id`:标题、作者、canonical 原站入口和 OG metadata,供 Telegram/Discord 读帖子缩略图。
- `/d/:id/image`:只代理对应 metadata 的**公开缩略图**,不接受任意上游 URL,不要求 Cookie/Referer;CDN 只允许 HTTPS DeviantArt/Wix 域名,防重定向 SSRF。
- 没有公开缩略图时仅提供文字与原站入口,**不公开账号才能查看的原图**。该页不是作品镜像站。

## Telegram 排版与 TelePress

媒体由统一 planner 决定发送单元:连续 photo/video 进 `sendMediaGroup`(每 2–10 项一组);GIF/animation 不能进 media group,始终独立 `sendAnimation`。caption/状态/来源只归属首单元。来源与客户端入口是**首条媒体 caption 末尾两个超链接**(`🔗 source | 📲 DAViewer app`,HTML `<a>` 锚点),单图与相册行为一致。

**TelePress**(可选,超大图集 / Telegram 发送失败兜底):

- `TELEPRESS_URL` 未设置则无额外依赖;设置后默认 `TELEPRESS_MODE=fallback`。
- `large-gallery` 纯图片 >10 张才生成可选项;`always` 需明确选择;`off` 完全关。
- 视频/GIF 不转 Telegraph;同作品 URL 缓存 90 天复用。
- TelePress 失败不影响原生 Telegram 成功;当前限制 50 张 / 50 MiB。
- 服务只绑回环/内部网络,**不要把未设 key 的发布接口暴露公网**。

**远程 media manifest(默认关)**:TelePress 服务端设 `TELEPRESS_ALLOW_REMOTE_GALLERY_MEDIA=1`,DeviantDrop 设 `TELEPRESS_REMOTE_GALLERY_MEDIA=1` 后,`/publish/gallery` 才接受轻量 `media` JSON,由 TelePress 代拉 https 图片。任一缺失自动回落二进制 multipart。适合有内部/受信客户端的场景,不建议直接暴露公网。详见 [无域名部署](VPS-public-ip.md)。

## 配置变化与模块结构

新增/完善的变量:`PUBLIC_BASE_URL`、`HTTP_HOST`、`ADMIN_IDS`、`AUTH_DIR`、`TELEPRESS_URL`、`TELEPRESS_API_KEY`、`TELEPRESS_MODE`、`TELEPRESS_REMOTE_GALLERY_MEDIA`。保留 `MODE`、代理、Cookie/OAuth seed 与缓存目录。完整变量表见 [配置](configuration.md)。

```text
src/
  main.js                  # 生命周期与依赖装配
  index.js                 # Bot / DA 流程
  http-server.js           # 流式 HTTP 与请求体上限
  network.js               # fetch、代理与连接失败回退
  auth/                    # credential/cookie store、token、oauth-login、http-auth、auth-notifier
  preview/server.js        # OG、匿名 metadata 与安全媒体代理
  publishing/              # telepress.js、gallery.js
  rendering/caption.js
  storage/cache.js         # 持久缓存,排除凭据
```

验证 `npm run check`。测试覆盖真实 HTTP multipart、poll+HTTP、凭据轮换/损坏/热更、OAuth state/过期/失败、caption/相册、preview/SSRF、TelePress 策略与失败隔离。