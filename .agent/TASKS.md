# 任务队列

> 任务进度的唯一权威，会话结束时更新。状态：`TODO / IN_PROGRESS / BLOCKED / DONE / DEFERRED`。用户可见的功能与缺陷跟踪以 GitHub issues 为准，本表只跟踪 Agent 工程任务，两个体系各自独立，不互相复制条目。

| Id | 任务 | 状态 | 说明 / 入口 |
| --- | --- | --- | --- |
| T-001 | 建立 `.agent/` 六件套 | DONE | 2026-10-29 建立，参照 DAViewer / PixivFlow 同名体系；同日经用户确认以 `docs:` 提交入库。 |
| T-002 | 真实 Telegram 端到端投递证据 | BLOCKED | 用户 2026-10-29 明确取消真实验收；解锁条件：用户指定测试聊天或要求补验。在此之前不得宣称端到端已验证。 |

## 更新规则

- 新任务先入表再动手；`BLOCKED` 必须写原因与解锁条件。
- `DONE` 需要证据（PR、release、测试日志）；证据不足只能保持 `IN_PROGRESS`。
