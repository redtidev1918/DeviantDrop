# 公网 IP / 无域名部署（VPS 只有 IP，没有域名）

**语言 / Language:** 中文 · [English](/en/VPS-public-ip.md)

如果你的 VPS 有公网 IP 但暂时不想注册域名，本文档给出不需要域名/TLS 的部署方式，
并说明之前被回滚的「远程媒体 manifest」能力如何作为**可选开关**重新启用（默认关闭）。

> 核心原则：**没有域名就不做对外 HTTP 反代。** Telegram 媒体直接以带 token 的
> CDN URL 交给 Telegram 下载（`MODE=poll`），Bot 自身不需要公网入站端口；
> TelePress 只绑 `127.0.0.1` 供同机/同网段客户端内部调用。

## 1. 一句话结论

- DeviantDrop 保持 **`MODE=poll`**，无域名也完全能用：主动 `getUpdates`，无需
  HTTPS、证书、webhook 或公开端口。
- TelePress 只监听 **`127.0.0.1:8000`**，和 DeviantDrop 同机，走内部 HTTP，
  不暴露公网。
- 远程媒体 manifest（让 TelePress 服务端代拉图片）**默认关闭**；只有当你确实想
  给外部客户端开这个口，且接受它变成「受限的服务端抓取代理」时才手动打开。
- 打开远程 manifest 需要 **两端同时开启**：TelePress 服务端
  `TELEPRESS_ALLOW_REMOTE_GALLERY_MEDIA=1`，DeviantDrop 客户端
  `TELEPRESS_REMOTE_GALLERY_MEDIA=1`。任一缺失都自动回落到底层二进制
  multipart（图片直接发给 Telegram / 走 TelePress 原生 `files` 字段），Bot 不受影响。

## 2. DeviantDrop 无域名部署（推荐）

```bash
cp .env.example .env
# 关掉所有公网入口依赖：
#   MODE=poll
#   不设置 PUBLIC_BASE_URL / WEBHOOK_SECRET（webhook 模式才需要公网 HTTPS）
# 国内出口按现状让 Bot 走代理：
#   HTTP_PROXY=http://127.0.0.1:7890  HTTPS_PROXY=http://127.0.0.1:7890
docker compose up -d --build
```

验证：

```bash
curl -fsS http://127.0.0.1:8080/health
# {"ok":true,...} 且 components.telegram_ingress 为 polling
```

给 `@DeviantDropBot` 发一条 DeviantArt 作品链接即可；图片由 Bot 下载后直接通过
Telegram multipart 发进群/私聊，不依赖任何公网入站端口。

## 3. TelePress 无域名部署

TelePress 是可选辅助（大图集 / Telegram 发送失败兜底）。同机跑即可：

```bash
# 装可选 API 依赖
pip install "telepress[api]==0.14.0"

# 只绑回环口，不绑 0.0.0.0
# 建议配 TELEPRESS_API_KEY，两端用同一个 Key
TELEPRESS_API_KEY=你的key telepress-server --host 127.0.0.1 --port 8000
```

DeviantDrop `.env` 指向它：

```ini
TELEPRESS_URL=http://127.0.0.1:8000
TELEPRESS_API_KEY=你的key
TELEPRESS_MODE=large-gallery      # 或 fallback；off 则完全不启用
# TELEPRESS_REMOTE_GALLERY_MEDIA=1   # 默认不写 = 关闭远端 manifest
```

> 用同机 `127.0.0.1` 时，TelePress 完全不需要域名、TLS、反代或公网端口。

## 4. 可选：给有公网 IP 的外部客户端开放 TelePress

> 这一步**不推荐**，只在确实需要让受信任的外部客户端用你的公网 IP 直接访问时采用。

```bash
# 1. TelePress 改为监听 0.0.0.0（注意：HTTP 明文）
TELEPRESS_API_KEY=一个够强的key \
TELEPRESS_ALLOW_REMOTE_GALLERY_MEDIA=1 \
telepress-server --host 0.0.0.0 --port 8000

# 2. DeviantDrop 客户端开启 manifest（两端都要开）
#    TELEPRESS_URL=http://<你的公网IP>:8000
#    TELEPRESS_REMOTE_GALLERY_MEDIA=1
```

在云厂商防火墙只放行可信来源 IP 访问 `8000/tcp`，不要开给全网。任何掩码都
不能替代 `TELEPRESS_API_KEY`。

远程 manifest 的限制：

- `sourceUrl` 只接受 `https://`，单文件上限 50 MiB，超限直接失败。
- 这项能力等于把 TelePress 变成一个**受限的服务端抓取代理**；开放公网前请确认
  你信任所有能调用它的客户端。默认关闭，避免无域名环境下误开成开放代理。

## 5. 恢复/默认路径（不需要任何配置）

什么都不设时保持既有行为：

1. DeviantDrop 下载图片字节 → `client.publishGallery({ files })` → TelePress
   `/publish/gallery` 只走 `files` multipart；
2. 或者 DeviantDrop 直接把图片作为 Telegram 媒体发进群（原生链路，不经过
   Telegraph）；
3. TelePress 的 `/publish/rich-novel` 图像床/manifest 能力不受影响；其 manifest
   代理已是**通用 CDN 代理**（`TELEPRESS_MEDIA_PROXY_BASE` + `TELEPRESS_MEDIA_PROXY_HOSTS`），
   旧 `TELEPRESS_PIXIV_PROXY_BASE` 只作为向后兼容别名保留。

## 6. 常见问题

- **远程 manifest 没生效？** 确认 `TELEPRESS_ALLOW_REMOTE_GALLERY_MEDIA=1`
  在 telepress-server 进程环境里、`TELEPRESS_REMOTE_GALLERY_MEDIA=1` 在
  DeviantDrop 进程环境里，两端 API Key 一致。任一缺失 DeviantDrop 会自动回落
  二进制路径，不会报错。
- **公网 IP 直接访问 HTTP 安全吗？** 不安全（明文），所以要么保持回环部署，
  要么加防火墙白名单 + 强 `TELEPRESS_API_KEY`，最好等有域名后用 Caddy/CF Tunnel
  套 HTTPS。
- **Bot 会不会因为远程 manifest 失败挂掉？** 不会。DeviantDrop 的 TelePress
  集成是「可选辅助」，manifest 失败会静默回落 multipart 路径；TelePress 任何
  失败都不影响原生 Telegram 发送。
