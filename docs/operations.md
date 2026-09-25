# 运维

**语言 / Language:** 中文 · [English](/en/README.md)

部署以后怎么维护:看日志、健康检查、更新、token 热更新、排障。

## 常用操作

```bash
docker compose logs -f deviantdrop      # 看实时日志
docker compose restart deviantdrop      # 重启
docker compose down && docker compose up -d      # 停止后重启(保留数据卷)
docker compose up -d --build            # 更新代码 + 重建镜像
```

健康检查:

```bash
curl -s http://127.0.0.1:8080/health | python3 -m json.tool
```

`/health` 返回真实能力快照,按故障域区分:

```text
http_server        /health 是否在监听 —— 关键域
telegram_ingress   取更新(poll/webhook)—— 关键域
telegram_auth      Bot 凭据是否被接受 —— 关键域
telegram_bot       启动时 getMe 读回的 bot 身份 —— 信息
deviantart_auth    DA 抓取/登录 —— 非关键域,失败绝不影响命令回复
```

`status: ok | degraded`,`degraded` 列出故障域;另有 `counters` 与最近结构化事件。

## Bot Token 热更新(不需重启)

运行时 secret 设计(`/data/secrets/telegram-bot-token`,目录 0700 / 文件 0600):

```text
/data/secrets/telegram-bot-token   (文件优先)
    >  BOT_TOKEN 环境变量(仅首次 bootstrap / fallback)
```

Token 被 BotFather 吊销(`getMe` 401)时服务进入降级并持续重试,不退出。恢复:

1. 在 Telegram 里 @BotFather → `/mybots` → 该 bot → API Token → 重新生成。
2. 在服务器上**一条命令**热更新:

```bash
cd /opt/deviantdrop && ./scripts/set-telegram-token.sh
# 隐藏输入新 token(不回显、不进 shell 历史、不进 argv)
```

1~2 秒后 `/health` 从 `degraded` 变 `ok`。服务只重建 Telegram 入口,进程 / HTTP / DA 认证 / 缓存 / OAuth 全不重启。

安全语义:

- 写错 token 不破坏现有凭据(getMe 验证不过则保留当前值)。
- 网络抖动(429 / 5xx / 超时 / DNS)算"延期",不算"无效",退避重试同一个值。
- 删掉 secret 文件不撤销凭据(继续用最后已验证值,source 标 `stale`)。
- token 写入走原子 rename,运行中绝不因热更新退出。

用 `npm run token` / `scripts/set-telegram-token.sh` 管理,或手动写文件(内容=裸 token)+ 等待自动检测。

## 排障

先看一条命令:

```bash
curl -s http://127.0.0.1:8080/health | python3 -m json.tool
docker compose logs deviantdrop | grep '\[evt\]' | tail -40
```

常见问题:

| 症状 | 原因 / 处理 |
| --- | --- |
| Bot 完全不回复,`telegram_ingress: conflict` | 残留 webhook 或另开了 poller。`MODE=poll` 启动会自动 `deleteWebhook`,重启用或停掉多余实例 |
| `telegram_auth: unauthorized`,日志 `getMe 401` | BOT_TOKEN 失效/被吊销 → 见上文热更新 |
| `/health` 读不到 | 容器起不来 → 用 `.env` + `docker compose up -d --force-recreate` 兜底(见下) |
| DA 403 / 500 | 出口被 DA 拦 → 换节点 / 换出口,再 `npm run detect` 确认 |
| 群里收不到普通链接 | Bot 群组隐私模式开着:BotFather → Group Privacy → Turn off,移出群拉回或设管理员 |
| 复制错误 token 后 `.env` 里旧 token 不再读 | 首次成功写 secret 文件后来源自动从 env 迁移到 file,`.env` 旧值不再读,可放心 |

### 兜底路径(连 `/health` 都读不到)

恢复旧版 `.env` + 重建容器:

```bash
read -rs NEW_TOKEN
sed -i "s|^BOT_TOKEN=.*|BOT_TOKEN=${NEW_TOKEN}|" /opt/deviantdrop/.env
unset NEW_TOKEN
cd /opt/deviantdrop && docker compose up -d --force-recreate
```

`.env` 只放服务器上(权限 0600),**绝不提交进仓库**。

### 事件日志

每个阶段一行 JSON,`docker logs | grep '\[evt\]'` 可区分:

```text
runtime_started / telegram_webhook_state / telegram_webhook_cleared
telegram_ingress_unauthorized / _conflict / _error
update_received / update_accepted / update_rejected
da_fetch_started / da_fetch_ok / da_fetch_failed
tg_send_started / tg_send_ok / tg_send_failed
secret_reload_detected / _validating / _applied / _rejected
```

所有字段统一脱敏(token / cookie / secret 相关键与 token 形态的值会被替换),日志可直接贴 issue。

## 升级与数据迁移

- 更新代码:见上 `docker compose up -d --build`。
- 升级**不要删数据卷**;旧部署如 `/tmp/deviantdrop-cache.json`,升级前备份并迁移到卷内 `/data/cache.json`。
- 数据存放在 `cache:/data` 卷:`/data/auth/*`(refresh token、Cookie)、`/data/secrets/*`(bot token)、`/data/cache.json`。备份整个卷即可。