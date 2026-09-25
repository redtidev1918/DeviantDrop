# DeviantDrop 文档

**语言 / Language:** 中文 · [English](/en/README.md)

DeviantDrop 是一个 **Telegram Bot**:在聊天里发一个 [DeviantArt](https://www.deviantart.com/) 作品链接,它就把图片 / 视频 / GIF / 文字作品发回给你。

**在线试用**:给 [@DeviantDropBot](https://t.me/DeviantDropBot) 发一条作品链接即可体验;要自己跑一份,看下面的部署文档。

---

## 快速了解

- **Telegram 更新通过长轮询接收,不需要公网 IP、域名或 HTTPS**(可直接部署在家用服务器 / VPS / NAS)。
- **必须**跑在 DeviantArt 放行的出口上(数据中心出口会被封锁,见 [部署](deployment.md#出口要求))。
- 配置入口是 `.env`(从 [`.env.example`](https://github.com/redtidev1918/DeviantDrop/blob/main/.env.example) 复制)。

## 部署 / 配置 / 运维

| 我想… | 文档 |
| --- | --- |
| 30 秒判断这台机器能不能用 | [部署与出口检测](deployment.md#出口要求) |
| 用 Docker 跑起来(推荐) | [Docker 部署](deployment.md#docker) |
| 不装 Docker,直接跑 Node | [Node 运行](deployment.md#node) |
| 只有公网 IP、没有域名 | [无域名部署](deployment.md#无域名部署) |
| 理解每个环境变量 | [配置](configuration.md) |
| 部署后怎么维护(日志、更新、token 热更新) | [运维](operations.md) |
| 出问题了怎么排查 | [排障](troubleshooting.md) |

## 认证 / 用法

| 我想… | 文档 |
| --- | --- |
| 完成 Telegram + DeviantArt 登录 | [认证与登录](authentication.md) |
| 特殊服务器如何适配(代理、TelePress) | [认证与预览](AUTH_AND_PREVIEW.md) |

## 架构

了解 Bot 内部如何取媒体、如何交付:

- [认证架构](architecture/authentication.md)
- [媒体管线](architecture/media-pipeline.md)
- [Delivery 生命周期](architecture/delivery-lifecycle.md)
- [会话恢复](operations/session-recovery.md)
- [媒体交付测试](testing/media-delivery.md)

## 其它

- [下载与版本](download.md)
- [发布编排(ReleaseGraph)](RELEASEGRAPH.md)
- [更新日志](https://github.com/redtidev1918/DeviantDrop/blob/main/CHANGELOG.md)
- [GitHub 仓库](https://github.com/redtidev1918/DeviantDrop)