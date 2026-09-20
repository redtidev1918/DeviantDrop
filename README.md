# DeviantDrop

把 DeviantArt 作品“丢”进 Telegram 的 Bot：在聊天里发一个作品链接，DeviantDrop 就把作品的图片、视频或 GIF 原样回复给你。

**语言 / Language:** 中文 · [English](README.en.md) · [完整文档](https://redtidev1918.github.io/DeviantDrop/) · [更新日志](CHANGELOG.md)

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/Docs-文档站点-6366f1?style=flat-square)](https://redtidev1918.github.io/DeviantDrop/)

**使用示例**：直接给 [@DeviantDropBot](https://t.me/DeviantDropBot) 发一条作品链接，它会把这件作品的图片 / 视频 / GIF 原样回给你，caption 末尾带原作品页 source 链接。只是想用的话不必自己部署。

**部署形态**：DeviantArt 会封锁数据中心出口（Cloudflare Workers 与多数云主机被拦）。请把 Bot 跑在 DeviantArt 放行的出口（住宅网络或已检测通过的部分 VPS）上；部署步骤见 [VPS 手册](docs/VPS.md)。

## 快速部署

```bash
cp .env.example .env    # 填 BOT_TOKEN / WEBHOOK_SECRET / 官方 API 凭据；国内机器填代理
docker compose up -d --build
```

**你需要准备**：一个来自 [@BotFather](https://t.me/BotFather) 的 `BOT_TOKEN`；一个
DeviantArt 官方应用（在 deviantart.com/developers 申请，填入 `CLIENT_ID` / `CLIENT_SECRET`，
用于 OAuth 访问）；以及一个 DeviantArt 放行的出口（见上）。不想用 Docker 时，
`npm install --omit=dev` 后 `node src/main.js` 即可。

## 支持范围

- 识别消息与 caption 里的作品页链接（`https` / `www` / 旧式域名 / `fav.me` / `/view/{id}`），最多同时处理 5 个；
  `fav.me`、`/view/{id}` 会先跟随重定向解析作者，解析不到时提示改用完整作品页网址。
- **网页 `_puppy` 接口优先**（作品结构 / GIF / 新作品 / additionalMedia 都从同一适配器取），必要时用 OAuth 官方 API 兜底。
- 视频的 `media.baseUri` 只是封面：可播放地址只取网页 `types[].t == "video"`，或官方 API `videos[].src`；拿不到播放源时回退官方 API，而不是把封面当图片发送。
- 同一作品成功发送后按 Telegram `file_id` 缓存 30 天；同一 bot 内其他用户再发同一作品时直接复用，不重新下载/上传。
- 照片/视频连续片段用 `sendMediaGroup` 相册发送（超过 10 张自动分批）；GIF/animation 始终独立 `sendAnimation`，不会拆散或重复 caption；超大图先压缩，失败再以 document 发送；Telegram 拉不动 CDN 时自动下载后 multipart 上传。
- `/start` `/help` `/about` 命令；每聊天限流、去重、429/500/503 退避重试。

### 群聊与频道

- Bot 默认开启「群组隐私模式」，此时在群里看不到普通消息（只有命令）。要让它响应群里的作品链接：在 **BotFather** 里 `/mybots` → 选 Bot → **Bot Settings → Group Privacy → Turn off**，然后把 Bot 移出群再拉回（或设为管理员）使设置生效。
- 频道里把 Bot 设为管理员、以「发到频道」的方式发链接即可（`channel_post` 同样处理）。
- 群聊/频道默认**不显示**技术性状态提示（见「回复排版」），caption 更干净。

### 登录与所有者命令

管理命令（`/login`、`/cookie`、`/status`）只允许 **Bot 所有者**使用：在 `.env` 设置 `ADMIN_IDS=<你的 Telegram 用户 ID>`。未配置时管理命令一律拒绝；普通使用者白名单（`ALLOWED_USER_IDS`）不是管理员。

DeviantArt 有两层**互相独立**的能力，不要把它们混成一件事：

| 层 | 角色 | 负责内容 |
| --- | --- | --- |
| **OAuth（官方 API）** | **内容访问主认证层** | 作品 metadata、**mature 主图**、官方 download/content、refresh token 无人值守续期 |
| **Web 扩展会话**（`auth`/`auth_secure`/`userinfo`） | **可选增强** | 只补齐官方 API 不提供的网页端 `deviation.extended.additionalMedia`（多图第 2…N 页） |

因此：**NSFW ≠ 必须 Cookie**。

- 单图成熟作品只靠 OAuth 就能拿到未打码主图；没有网页会话也照样发送。
- 网页会话失效只影响**部分多图作品的附加页**，不会让整个成熟作品失败，也不会用打码图顶替已经拿到的 OAuth 原图。
- 附加页拿不到时只补一句「部分附加图片暂时无法获取，请在原站查看」，不会说成登录失效。

- **推荐：电脑一键登录（无公网域名也能用）**。在你的电脑上（需装有 Chrome/Edge），于 DeviantDrop 目录运行：
  ```bash
  VPS=root@<你的服务器> npm run login
  ```
  脚本会自动打开 Chrome 进入 DeviantArt 官方登录页：你登录并点「Authorize/允许」，脚本同时保存 OAuth 与网页扩展会话并热生效。DA 的登录页有 AWS WAF 人机校验，用你自己的真实浏览器登录即可正常通过。完成后 `/status` 显示 `OAuth API: ✅ valid`、`Multi-image web expansion: ✅ valid`。
- **有公网域名（`PUBLIC_BASE_URL`）**：私聊发 `/login`；首次配置或 refresh token 失效时点 OAuth 授权按钮。公网页面不能跨域写入 DA Cookie，扩展会话入口采用一次性表单粘贴。
- **只有手机/没有电脑**：在已登录 DA 的浏览器里复制整行 `Cookie:`，在私聊发 `/cookie auth=…; auth_secure=…; userinfo=…`，Bot 存盘后立即探测并回报状态。注意这条会话凭据会经过 Telegram，发完删掉该消息（Bot 会尽力代删）；担心时可在 DA 设置里「退出所有设备」使其作废。
- **`/status`（所有者私聊）**：分别显示 `OAuth API:` 与 `Multi-image web expansion: missing|unknown|valid|expired` 两条独立状态（不显示任何密钥）。网络超时、WAF、5xx 只会让扩展能力显示 `unknown`，绝不误判为过期，也不会影响 OAuth 状态；只有登录跳转或 `mature_loggedout` 才标记 `expired`。
- `DA_REFRESH_TOKEN` / `DA_COOKIES` 只作为**首次迁移 seed**：启动后分别写入 OAuth 与网页会话文件，refresh token 轮换即落盘；Cookie 支持热更新，不再回退读 .env 旧值。
- **`BOT_TOKEN` 也只作为首次 bootstrap**：运行时事实来源是 secret 文件 `/data/secrets/telegram-bot-token`（目录 0700 / 文件 0600，可用 `BOT_TOKEN_FILE` 覆盖），**文件优先于环境变量**。Token 被 BotFather 吊销后不必重启容器，在服务器上跑一条命令即可热恢复：
  ```bash
  cd /opt/deviantdrop && ./scripts/set-telegram-token.sh
  ```
  服务会在 1~2 秒内发现新值、用 `getMe` 验证、然后**只重建 Telegram 入口**（进程、HTTP 服务、DeviantArt 认证、缓存、预览、OAuth 全都不重启）。写错 token 不会破坏当前有效凭据，网络抖动只会延期验证；`/health` 的 `runtime_secrets` 会说明来源与状态（只有元数据，没有值）。详见 [docs/VPS.md](docs/VPS.md)。
- OAuth 或网页扩展会话失效时 Bot 所有者分别收到通知，文案各自说明影响范围（6 小时冷却，恢复后另发一次恢复通知）。

### 回复排版

- 统一排版：`🎨 标题 / 👤 作者 / 🖼 N 个媒体`，外加一个可靠的来源入口（见下）。
- 来源入口**每个作品只有一个、绝不重复**：小号蓝色 `source` 链接嵌在**媒体 caption 末尾（空行 + 🔗 前缀隔开）（`parse_mode=HTML` 的 `<a>` 锚点，服务端解析、各路径含 multipart 都可靠），指向原作品页。单图/视频的图片下方另有「📲 DeviantArt 客户端」内联按钮，指向 [DAViewer 客户端下载页](https://redtidev1918.github.io/DAViewer/#/download)；相册（sendMediaGroup 会静默丢弃按钮）只有首图 caption 末尾的 `source` 锚点，不补客户端按钮、也不补发独立文本行。
- 技术性状态提示（`⚠️ 已压缩 / 原图暂不可用 / 已作为文件发送` 等）默认只在**私聊**显示便于运营排查；群聊/频道里自动隐藏（对看图的人是噪音，想看原图点来源入口即可）。可用环境变量强制：`CAPTION_NOTES=auto`（默认，私聊显示/群聊隐藏）、`always`（总是显示）、`never`（总是隐藏）。

### TelePress（可选）

超大图集（>10 张）或 Telegram 发送失败时，可借助 [TelePress](https://github.com/redtidev1918/TelePress) 生成 Telegraph 页面。未配置 URL 时不启用；配置后默认仅失败兜底（`TELEPRESS_MODE=fallback`），大图集需选择 `large-gallery`，失败绝不影响原生 Telegram 发送。同机部署建议 `TELEPRESS_URL=http://127.0.0.1:<port>` 并在两端配置同一个 `TELEPRESS_API_KEY`。

### 依赖

- **运行时**：Node.js ≥ 22。生产依赖只有两个——`undici`（HTTP 与国内出口代理）和 `sharp`（>10MB 图片压缩，懒加载）。详见 [package.json](package.json)。
- **开发**：`wrangler` 仅用于本地 `dev`/dry-run 校验，不进入 Docker 镜像。
- **可选外部服务**：[TelePress](https://github.com/redtidev1918/TelePress)（Telegraph 图集兜底）、[DAViewer](https://github.com/redtidev1918/DAViewer) 客户端（浏览 DeviantArt 的桌面客户端，见下）。

### 相关项目与致谢

- [DAViewer 客户端（兄弟项目）](https://github.com/redtidev1918/DAViewer)：浏览 DeviantArt 的桌面客户端；bot 单图/视频回复里的「📲 DeviantArt 客户端」按钮指向其[下载页](https://redtidev1918.github.io/DAViewer/#/download)，`/about` 亦有提及。
- [TelePress](https://github.com/redtidev1918/TelePress)：可选 Telegraph 图集发布。
- 实现来源（反代/兼容细节）：[deviantart-downloader](https://github.com/redtidev1918/deviantart-downloader)（CSRF、作品 ID、cookie 复用、媒体 URL）、[DAKit](https://github.com/redtidev1918/DAKit)（`_puppy`/`dadeviation`/`init` 流程与 URL 兼容）、[TelePost](https://github.com/redtidev1918/TelePost)（Telegram 媒体类型映射）。完整清单见 [docs/README.md](docs/README.md#实现来源)。

完整的解析机制、双通道细节、限流策略、部署与排错，请看**文档站点**：

https://redtidev1918.github.io/DeviantDrop/

### 公开预览页

设置 HTTPS `PUBLIC_BASE_URL` 后提供 `/d/:id`，供 Telegram/Discord 读取 OG metadata。只发布匿名 oEmbed 的公开缩略图，不暴露登录后媒体。

完整操作、数据迁移与限制见 [认证与预览指南](docs/AUTH_AND_PREVIEW.md)；发布编排（ReleaseGraph 接入现状与下一代协议切换清单）见 [发布编排说明](docs/RELEASEGRAPH.md)；部署与出口检测结论见 [VPS 部署指南](docs/VPS.md)。
