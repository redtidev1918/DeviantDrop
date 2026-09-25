# VPS / 服务器部署手册

**语言 / Language:** 中文 · [English](/en/VPS.md)

> 本页是部署的**完整流程**。只想快速跑起来,看 [部署](deployment.md);理解环境变量看 [配置](configuration.md);运维 / 排障看 [运维](operations.md) 与 [排障](troubleshooting.md)。

DeviantDrop 跑在普通服务器上(Cloudflare Workers 出口被 DeviantArt 封锁)。

## 出口要求(关键)

DeviantArt 封锁数据中心出口。部署前**先检测**:

```bash
npm install --omit=dev
node scripts/detect-da.mjs <client_id> <client_secret>
```

> 2026-09 实测:阿里云直连 DA 超时;经机场(HK)出口官方 API 与网页均 200;Cloudflare/Fly 被拦。机场出口通常可用。

## 0. 国内网络代理(clash / mihomo)

服务器已有系统级 clash(mixed-port 7890 绑 127.0.0.1)时:

- **订阅热更新**(不重启):

  ```bash
  SUB_URL="https://你的机场/订阅" ./scripts/refresh-clash.sh
  ```

- **WebUI**(本地浏览器经 SSH 隧道,不开公网):`ssh -L 9090:127.0.0.1:9090 root@服务器` 后访问 `http://127.0.0.1:9090/ui`。

## 1. 部署(推荐 Docker)

```bash
cp .env.example .env      # 填 BOT_TOKEN / WEBHOOK_SECRET / CLIENT_ID / CLIENT_SECRET
docker compose up -d --build
docker compose logs -f deviantdrop
```

不装 docker:

```bash
export BOT_TOKEN=... WEBHOOK_SECRET=... CLIENT_ID=... CLIENT_SECRET=...
export MODE=poll HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890
node src/main.js            # MODE=poll=长轮询,无需公网入口
```

## 2. 接入方式

| 模式 | 公网 | 说明 |
| --- | --- | --- |
| `MODE=poll`(默认) | 无 | getUpdates 长轮询;无需 HTTPS/域名/证书,无入站端口 |
| `MODE=webhook` | HTTPS 反代 | Caddy/Nginx/CF Tunnel → `127.0.0.1:8080`,并手动 setWebhook(见[部署](deployment.md)) |

**二选一,别同时开。** `MODE=poll` 启动会自动摘掉残留 webhook。

## 3. 登录

优先用**电脑一键登录**(无域名也能用):

```bash
VPS=root@<你的服务器> npm run login
```

或 HTTPS 域名下私聊 `/login` / 无电脑 `/cookie`。详见 [认证与登录](authentication.md)。

## 4. 推送即部署(可选)

仓库 `.github/workflows/deploy.yml` 可在 main 更新时自动部署。配三个 secret:`VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY`。详见 [部署](deployment.md#推送即部署可选)。

## 5. 验证与排障

```bash
docker compose logs -f deviantdrop      # 轮询模式持续 getUpdates
curl -s http://127.0.0.1:8080/health | python3 -m json.tool
```

排障看 [排障](troubleshooting.md)。Bot token 被吊销后**热更新不重启**([运维](operations.md#bot-token-热更新不需重启))。

## 故障域隔离

关键域(`http_server` / `telegram_ingress` / `telegram_auth`)失败**不会让进程退出**:401 退避重试(5s→60s 封顶),`/health` 保持可读。非关键域(`deviantart_auth`)失败绝不影响 `/start` 等命令。详见 [运维](operations.md)。

## 上传与群聊深入诊断

- Node 原生 `fetch` 与原生 `FormData` 配套;代理经 `dispatcher` 指定。混用独立 `undici.fetch` 可能发纯文本 `[object FormData]`,Telegram 报缺 photo/media。
- 相册必须用 `sendMediaGroup`;多加 `sendPhoto` + `media_group_id` 不会合并成相册。
- 群话题回复保留 `message_thread_id`;频道 `channel_post` 同样处理。
- **群里收不到普通链接**:先确认 Bot 群组隐私模式已关(BotFather → Group Privacy → Turn off),移出群拉回或设管理员。开着时 Telegram 不投递群里非命令消息,`can_read_all_group_messages` 为 false。
- 群聊/频道默认隐藏技术性 ⚠️(`CAPTION_NOTES=auto`);`always` 全显,`never` 全关。
- 日志无对应 `[upd]` 时检查 Telegram 投递与是否有其他轮询实例;有 `[upd]` 时检查发送权限。
- `npm test` 包含本地真实 HTTP multipart 与轮询相册测试,不向真实 Telegram 发送。