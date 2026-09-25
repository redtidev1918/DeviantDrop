# 排障

**语言 / Language:** 中文 · [English](/en/README.md)

## 第一步

```bash
curl -s http://127.0.0.1:8080/health | python3 -m json.tool
docker compose logs deviantdrop | grep '\[evt\]' | tail -40
```

`/health` 说真话:返回 `status: ok|degraded`、`degraded:[...域]`、各故障域状态、计数器和最近事件。关键域失败不会让进程退出,`/health` 保持可读。

## 常见问题

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
- DA 403/500 → 该出口被拦,换节点/换出口。

## 日志脱敏

所有 `[evt]` 字段在写出前统一脱敏(token / cookie / secret 命名的键与 token 形态的值都被替换),日志可直接贴 issue。

## 其它

- 上传与群聊深入诊断、`FormData`/相册细节见 [docs/VPS.md](VPS.md#上传与群聊诊断)(保留的历史操作细节)。