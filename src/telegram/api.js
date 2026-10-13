const TELEGRAM_API = 'https://api.telegram.org';

import { event, bump } from '../runtime/status.js';

// Reads may be retried after a lost response; message creation has no
// idempotency key, so a timeout never establishes that it was rejected.
const SAFE_NETWORK_RETRY = new Set(['getMe', 'getChat', 'getChatMember', 'getChatAdministrators', 'getChatMemberCount', 'getFile', 'getUpdates']);

export class TelegramDeliveryUncertainError extends Error {
  constructor(method, cause) {
    super('Telegram 发送结果无法确认，请先检查聊天记录；未自动重发', { cause });
    this.name = 'TelegramDeliveryUncertainError';
    this.method = method;
    this.confirmedMessages = [];
  }
}

export class TelegramPartialDeliveryError extends Error {
  constructor(cause, confirmedMessages) {
    super(`已有 ${confirmedMessages.length} 条消息确认发送，后续发送失败；未整体重发`, { cause });
    this.name = 'TelegramPartialDeliveryError';
    this.confirmedMessages = confirmedMessages;
  }
}

export class TelegramRateLimitError extends Error {
  constructor(retryAfter) {
    super(`Telegram 限流，请至少等待 ${retryAfter} 秒后再试`);
    this.name = 'TelegramRateLimitError';
    this.retryAfter = retryAfter;
    this.confirmedMessages = [];
  }
}

export function preserveConfirmedDelivery(error, messages) {
  const confirmed = [...messages, ...(error.confirmedMessages || [])];
  if (!confirmed.length) return error;
  if (error instanceof TelegramDeliveryUncertainError || error instanceof TelegramRateLimitError) {
    error.confirmedMessages = confirmed;
    return error;
  }
  return new TelegramPartialDeliveryError(error, confirmed);
}

function requireReceipt(response, result, method) {
  if (!SAFE_NETWORK_RETRY.has(method) &&
      ((response.ok && (!result || (result.ok === true && result.result === undefined))) ||
       (response.status >= 500 && !result))) {
    throw new TelegramDeliveryUncertainError(method);
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 出口链路可观察性载荷：只记方法与目标 chat，绝不记 URL（URL 里含 token）。 */
function sendFields(method, body) {
  return { method, chat_id: body?.chat_id ?? null };
}

function telegramBackoffSeconds(status, result, attempt) {
  const retryAfter = Number(result?.parameters?.retry_after);
  if (status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter;
  if (/flood|retry after|too many/i.test(String(result?.description || ''))) return Math.min(2 ** attempt, 60);
  return null;
}

export async function telegram(env, method, body) {
  const startedAt = Date.now();
  const fields = sendFields(method, body);
  event('tg_send_started', fields);
  try {
    const result = await telegramOnce(env, method, body);
    bump('tg_sends_ok');
    event('tg_send_ok', { method, chat_id: fields.chat_id, duration_ms: Date.now() - startedAt });
    return result;
  } catch (error) {
    const uncertain = error instanceof TelegramDeliveryUncertainError;
    bump(uncertain ? 'tg_sends_uncertain' : 'tg_sends_failed');
    event(uncertain ? 'tg_send_uncertain' : 'tg_send_failed', {
      method,
      chat_id: fields.chat_id,
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function telegramOnce(env, method, body) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response;
    try {
      response = await fetch(`${TELEGRAM_API}/bot${env.BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

    } catch (error) {
      if (!SAFE_NETWORK_RETRY.has(method)) throw new TelegramDeliveryUncertainError(method, error);
      if (attempt < 3) {
        console.error(new Date().toISOString(), '[tg]', `${method} 网络错误，重试 ${attempt + 1}`);
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new Error('Telegram 连接失败或超时，请稍后再试');
    }
    const result = await response.json().catch(() => null);
    requireReceipt(response, result, method);
    const backoff = telegramBackoffSeconds(response.status, result, attempt);
    if (backoff !== null) {
      console.error(new Date().toISOString(), '[tg]', `${method} 限流，${backoff}s 后重试 ${attempt + 1}`);
      if (attempt === 3 || backoff > 30) throw new TelegramRateLimitError(backoff);
      await sleep(backoff * 1000);
      continue;
    }
    if (!response.ok || !result?.ok) {
      const description = result?.description || `Telegram 返回 HTTP ${response.status}`;
      console.error(new Date().toISOString(), '[tg]', `${method} 失败: ${description}`);
      event('tg_send_rejected', { method, status: response.status, description });
      throw new Error(description);
    }
    return result.result;
  }
  throw new Error('Telegram 暂时限流，请稍后重试');
}

export async function telegramForm(env, method, formOrFactory) {
  const startedAt = Date.now();
  event('tg_send_started', { method, upload: true });
  try {
    const result = await telegramFormOnce(env, method, formOrFactory);
    bump('tg_sends_ok');
    event('tg_send_ok', { method, upload: true, duration_ms: Date.now() - startedAt });
    return result;
  } catch (error) {
    const uncertain = error instanceof TelegramDeliveryUncertainError;
    bump(uncertain ? 'tg_sends_uncertain' : 'tg_sends_failed');
    event(uncertain ? 'tg_send_uncertain' : 'tg_send_failed', {
      method,
      upload: true,
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function telegramFormOnce(env, method, formOrFactory) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const form = typeof formOrFactory === 'function' ? formOrFactory() : formOrFactory;
    let response;
    try {
      response = await fetch(`${TELEGRAM_API}/bot${env.BOT_TOKEN}/${method}`, {
        method: 'POST', body: form, signal: AbortSignal.timeout(180_000),
      });
    } catch (error) {
      throw new TelegramDeliveryUncertainError(method, error);
    }
    const result = await response.json().catch(() => null);
    requireReceipt(response, result, method);
    const retryAfter = Number(result?.parameters?.retry_after);
    if (response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) {
      if (attempt === 2 || retryAfter > 30) throw new TelegramRateLimitError(retryAfter);
      await sleep(retryAfter * 1000);
      continue;
    }
    if (!response.ok || !result?.ok) {
      const description = result?.description || `HTTP ${response.status}`;
      console.error(new Date().toISOString(), '[tg]', `${method} 失败: ${description}`);
      event('tg_send_rejected', { method, status: response.status, description });
      throw new Error(description);
    }
    return result.result;
  }
  throw new Error('Telegram 上传失败，请稍后重试');
}

export async function registerCommands(env, adminIds = []) {
  try {
    await telegram(env, 'setMyCommands', {
      commands: [
        { command: 'start', description: '开始使用' },
        { command: 'help', description: '查看用法' },
        { command: 'about', description: '项目与源码' },
      ],
    });
    for (const chatId of adminIds) {
      await telegram(env, 'setMyCommands', {
        scope: { type: 'chat', chat_id: Number(chatId) },
        commands: [
          { command: 'start', description: '开始使用' },
          { command: 'help', description: '查看用法' },
          { command: 'about', description: '项目与源码' },
          { command: 'login', description: '更新 DeviantArt 登录' },
          { command: 'cookie', description: '刷新网页会话 Cookie' },
          { command: 'status', description: '查看运行状态' },
        ],
      });
    }
  } catch (error) {
    console.warn(new Date().toISOString(), '[tg]', '注册 Bot 命令失败（不影响运行）:', error instanceof Error ? error.message : String(error));
  }
}
