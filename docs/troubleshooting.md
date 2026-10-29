# 排障

**语言 / Language:** 中文 · [English](/en/README.md)

## 第一步

```bash
curl -s http://127.0.0.1:8080/health | python3 -m json.tool
docker compose logs deviantdrop | grep '\[evt\]' | tail -40
```

`/health` 说真话:返回 `status: ok|degraded`、`degraded:[...域]`、各故障域状态、计数器和最近事件。关键域失败不会让进程退出,`/health` 保持可读。

## 常见问题

### Request Entity Too Large / 媒体超过发送大小限制

先看 `tg_request` / `tg_response` 的方法、实际请求字节数、各文件字节数、脱敏 API 地址、状态码和响应头。413 可能拒绝整个请求，不能仅凭描述断定单文件大小。DeviantArt 页面或媒体的 403 属于访问失败，与 Telegram 上传超限分开处理。

相册按实际 multipart 大小分批，明确被拒绝后才拆小，有限次数内定位失败项并继续其余项。超过照片限制的图片改发原字节 document，不压缩。单文件超过云端上传能力时返回原作链接；换代理或改成 document 不能提高 50 MB 文件上限。上传结果不明时停止，不换路重发。

限制依据：[Telegram Sending files](https://core.telegram.org/bots/api#sending-files)（2026-10-22 核对；照片上传 10 MB，其他文件 50 MB）。相册请求整体被拒绝也可能产生 HTTP 413，因此仅凭该错误不能确定某个文件的大小。

Local Bot API 的 2000 MB 能力需要额外服务与资源评估，当前不自动启用；也不自动转码 GIF。未来支持跟踪于 [Issue #68](https://github.com/redtidev1918/DeviantDrop/issues/68)。

### Bot 没有响应

- `/health` 里 `telegram_ingress: conflict` → 残留 webhook 或另开了 poller。`MODE=poll` 启动会自动 `deleteWebhook`;重启用或停掉多余实例。
- `telegram_ingress: unauthorized`、日志 `getMe` / `getUpdates` 401 → token 失效/被吊销。重新生成并热更新,见 [运维 - token 热更新](operations.md#bot-token-热更新不需重启)。
- 有 `[upd]` 记录但没发出去 → 看发送权限与错误日志。

### DeviantArt 登录失败

- 出口被 DA 封锁 → 先 `npm run detect` 确认(见 [部署 - 出口要求](deployment.md#出口要求))。
- DA 登录页有 WAF → 用真实浏览器登录(`npm run login`),服务器无头浏览器会被拦。
- 报「凭据无效」→ CLIENT_ID/CLIENT_SECRET 填错。

### OAuth 会话丢失 / Docker 重启后重新登录

- 数据卷 `cache:/data` 被删(尤其 `docker compose down -v`)→ 不要删卷,恢复见 [认证与登录](authentication.md)。

### API 被限制

- Telegram 429:bot 会读 `retry_after` 退避重试,不重复发送。
- DA 限流:网络错误 / 429 / 500 / 503 退避重试;不存在合法"绕过 DA 限额",不要轮换 IP 轰炸。

### 权限问题

- 管理命令(`/login` `/status`)提示无权限 → 未配置 `ADMIN_IDS`,或私聊以外发。
- 群里收不到普通链接 → Bot 群组隐私模式开着:BotFather → Group Privacy → Turn off,移出群拉回或设管理员。

### 报错「连接失败或超时」(国内)

- 代理没生效 / 机场节点全挂 → `curl -x http://127.0.0.1:7890 https://www.gstatic.com/generate_204` 验证代理。
- DA 页面/API 的 403/500 需核对会话、权限和出口；媒体 CDN 的 403 还可能来自尺寸受限签名与裸 `baseUri` 不匹配，不能仅据状态码认定出口被拦或登录失效。升级至 1.16.1 或更新版本可使用响应提供的 fullview，版本标识保留在内部数据；仍失败时保留脱敏日志，勿反复重发已投递的媒体。

## 日志脱敏

所有 `[evt]` 字段在写出前统一脱敏(token / cookie / secret 命名的键与 token 形态的值都被替换),日志可直接贴 issue。

## 其它

- 上传与群聊深入诊断、`FormData`/相册细节见 [docs/VPS.md](VPS.md#上传与群聊诊断)(保留的历史操作细节)。
