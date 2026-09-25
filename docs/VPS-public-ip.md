# 无域名部署(PUBLIC_BASE_URL 相关)

**语言 / Language:** 中文 · [English](/en/VPS-public-ip.md)

> 核心结论:**没有域名也能完整使用 DeviantDrop。** 只有"Telegram 内 `/login` 按钮"和"公开预览页 `/d/:id`"这两个**可选加分项**需要 HTTPS 域名;DeviantDrop 其余功能(接收消息、下载、发送媒体)都不需要公网入口。

## 没有域名 / 公网 IP,怎么跑

保持默认 `MODE=poll` 即可——机器人**主动**向 Telegram 拉取更新,不需要任何入站端口、域名、证书:

```bash
cp .env.example .env
# MODE=poll(默认)
# 不设置 PUBLIC_BASE_URL / WEBHOOK_SECRET(webhook 模式才需要公网 HTTPS)
docker compose up -d --build
```

```bash
curl -fsS http://127.0.0.1:8080/health
# {"ok":true,...} 且 components.telegram_ingress 为 polling
```

媒体由 Bot 下载后直接经 Telegram multipart 发进群/私聊,不依赖公网入站。

## 登录不需要域名

- 用**电脑一键登录** `VPS=root@<服务器> npm run login`(无需域名/公网)。
- 或 `/cookie` 粘贴。

详见 [认证与登录](authentication.md)。

## 那"没有域名"会损失什么

仅有这两个可选功能需要 HTTPS 域名(`PUBLIC_BASE_URL`):

1. **Telegram 内 `/login` 按钮** —— 替代路径是上面的电脑一键登录 / `/cookie`。
2. **公开预览页 `/d/:id`** —— 帖子链接被转发到 Telegram/Discord 时显示的 OG 缩略图。核心功能不受影响。

`PUBLIC_BASE_URL` 的真实作用与配置见 [配置](configuration.md#public_base_url)。

## 有公网 IP、想给外部客户端开放 TelePress(不推荐)

TelePress 可选兜底默认只绑回环;仅为受信任外部客户端开放时才监听 `0.0.0.0` 并配合 `TELEPRESS_API_KEY`,且要防火墙白名单。**默认没有域名就是回环部署,无需任何公网开放。** TelePress 细节与远程 media manifest 见 [认证与预览](AUTH_AND_PREVIEW.md)。