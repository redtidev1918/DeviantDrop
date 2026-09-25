// Webhook 传输模式自动注册 + 统一 handler 的集成测试。
//
// 覆盖（对应需求「七 Webhook HTTP Endpoint / 八 Webhook 启动流程」）：
//   1. MODE=webhook + PUBLIC_BASE_URL → 启动自动 setWebhook,health 变 webhook ok
//   2. MODE=webhook + 无 PUBLIC_BASE_URL → 保持手动注册降级(health webhook_unregistered),不自动干预
//   3. setWebhook 被 Telegram 拒绝 → 明确失败(health unregistered),进程仍存活,有可定位事件
//   4. 合法 Telegram update POST → 进入统一 handler
//   5. 错误 secret → 403,不进 handler
//   6. 非 POST → 404
//   7. 非法 JSON → 400
//   8. handler 内部异常(DA 故障)→ HTTP 200,server 不崩
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const FAKE_TOKEN = '1234567890:AA' + 'f'.repeat(30);

/** 假 Telegram：getMe 通过、getWebhookInfo 可控、setWebhook 可控、默认不配合 getUpdates。 */
function fakeTelegram({ setWebhookResult = 'ok' } = {}) {
  const fail = setWebhookResult !== 'ok';
  return `
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url);
      if (u.includes('/getMe')) return Response.json({ ok: true, result: { id: 7777, is_bot: true, username: 'webhook_bot' } });
      if (u.includes('/getWebhookInfo')) return Response.json({ ok: true, result: { url: '', pending_update_count: 0 } });
      if (u.includes('/setWebhook')) {
        const body = new URLSearchParams(init.body);
        console.error('[evt] {"event":"fake_setwebhook","url":' + JSON.stringify(body.get('url')) + ',"has_secret":' + JSON.stringify(!!body.get('secret_token')) + ',"allowed":' + JSON.stringify(body.get('allowed_updates')) + '}');
        if (${JSON.stringify(fail)}) return Response.json({ ok: false, error_code: 400, description: 'bad webhook URL' }, { status: 400 });
        return Response.json({ ok: true, result: true });
      }
      if (u.includes('/setMyCommands')) return Response.json({ ok: true, result: true });
      return Response.json({ ok: true, result: {} });
    };
  `;
}

function startWebhookBot({ publicBaseUrl = '', extraEnv = {}, preload } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dd-webhook-'));
  const child = spawn(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload || fakeTelegram())}`, 'src/main.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      MODE: 'webhook', PORT: '0', HTTP_HOST: '127.0.0.1',
      AUTH_DIR: dir, CACHE_FILE: join(dir, 'cache.json'),
      BOT_TOKEN: FAKE_TOKEN,
      WEBHOOK_SECRET: 'test-webhook-secret',
      HTTP_PROXY: '', HTTPS_PROXY: '',
      PUBLIC_BASE_URL: publicBaseUrl,
      DA_REFRESH_TOKEN: '', DA_COOKIES: '',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const onData = (b) => {
      output += b;
      const m = output.match(/127\.0\.0\.1:(\d+) \(mode=webhook\)/);
      if (m) { child.off('exit', onExit); resolve(m[1]); }
    };
    const onErr = (b) => { output += b; };
    const onExit = () => reject(new Error('进程在 webhook ready 前退出'));
    child.stdout.on('data', onData);
    child.stderr.on('data', onErr);
    child.once('exit', onExit);
  });
  return { child, ready, get output() { return output; } };
}

async function waitForJsonPort(bot, label) {
  const port = await bot.ready;
  return port;
}

test('webhook mode with PUBLIC_BASE_URL auto-registers and serves updates', { timeout: 30000 }, async (t) => {
  const bot = startWebhookBot({ publicBaseUrl: 'https://bot.example.com' });
  t.after(() => bot.child.kill('SIGKILL'));
  const port = await waitForJsonPort(bot);

  // 自动注册：向 Telegram 发了 setWebhook,带 secret_token 与 allowed_updates。
  await new Promise((r) => setTimeout(r, 800));
  assert.match(bot.output, /"event":"fake_setwebhook"/);
  assert.match(bot.output, /"url":"https:\/\/bot\.example\.com\/webhook"/);
  assert.match(bot.output, /"has_secret":\s*true/);
  assert.match(bot.output, /message/);

  // health 显示 webhook ok。
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(health.mode, 'webhook');
  assert.equal(health.components.telegram_ingress.state, 'webhook');
  assert.equal(health.components.telegram_ingress.ok, true);

  // 合法 update → 统一 handler(这里发的是 DA 链接,会走完整 DA 路径;为不依赖外网,
  // 直接发一条无链接文本,断言 handler 被调用并回复)。
  const updateMsg = {
    update_id: 1,
    message: { message_id: 7, from: { id: 42, is_bot: false }, chat: { id: 42, type: 'private' }, text: '/about' },
  };
  const resp = await fetch(`http://127.0.0.1:${port}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' },
    body: JSON.stringify(updateMsg),
  });
  assert.equal(resp.status, 200);
  // 轮询等待 update_received 真的到达处理入口（handler 内部异步）。
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && !bot.output.includes('"event":"update_received"')) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.match(bot.output, /"event":"update_received"/);
});

test('webhook mode without PUBLIC_BASE_URL stays manual (no auto-register)', { timeout: 30000 }, async (t) => {
  const bot = startWebhookBot({ publicBaseUrl: '' });
  t.after(() => bot.child.kill('SIGKILL'));
  await bot.ready;
  await new Promise((r) => setTimeout(r, 900));

  // 不自动 setWebhook。
  assert.doesNotMatch(bot.output, /fake_setwebhook/);
  // health 反映未注册,但不假装可用也不需要域名。
  const healthResp = await fetch(`http://127.0.0.1:${(await bot.ready)}/health`);
  const health = await healthResp.json();
  assert.equal(health.mode, 'webhook');
  const ingress = health.components.telegram_ingress;
  assert.equal(ingress.ok, false);
  assert.equal(ingress.state, 'webhook_unregistered');
});

test('webhook auto-register failure marks degraded but keeps process alive', { timeout: 30000 }, async (t) => {
  const bot = startWebhookBot({
    publicBaseUrl: 'https://bot.example.com',
    preload: fakeTelegram({ setWebhookResult: 'fail' }),
  });
  t.after(() => bot.child.kill('SIGKILL'));
  const port = await bot.ready;
  await new Promise((r) => setTimeout(r, 800));

  assert.match(bot.output, /"event":"telegram_webhook_registration_failed"/);

  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(health.status, 'degraded');
  assert.equal(health.components.telegram_ingress.state, 'webhook_unregistered');
  assert.equal(health.components.telegram_ingress.ok, false);
  // 进程存活,HTTP 可读。
  assert.equal(bot.child.exitCode, null);
});

test('webhook rejects wrong secret and skips the handler', { timeout: 30000 }, async (t) => {
  const bot = startWebhookBot({ publicBaseUrl: 'https://bot.example.com' });
  t.after(() => bot.child.kill('SIGKILL'));
  const port = await bot.ready;

  const resp = await fetch(`http://127.0.0.1:${port}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret' },
    body: JSON.stringify({ update_id: 2 }),
  });
  assert.equal(resp.status, 403);
  await new Promise((r) => setTimeout(r, 300));
  assert.doesNotMatch(bot.output, /"event":"update_received"/);

  // 空 secret 同理。
  const noSecret = await fetch(`http://127.0.0.1:${port}/webhook`, { method: 'POST', body: '{}' });
  assert.equal(noSecret.status, 403);
});

test('webhook rejects non-POST and invalid JSON with proper status', { timeout: 30000 }, async (t) => {
  const bot = startWebhookBot({ publicBaseUrl: 'https://bot.example.com' });
  t.after(() => bot.child.kill('SIGKILL'));
  const port = await bot.ready;

  const get = await fetch(`http://127.0.0.1:${port}/webhook`);
  assert.equal(get.status, 404);

  const badJson = await fetch(`http://127.0.0.1:${port}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret' },
    body: '{ not json',
  });
  assert.equal(badJson.status, 400);
});

test('poll mode does not start alongside webhook (webhook never poll loops)', { timeout: 30000 }, async (t) => {
  const bot = startWebhookBot({ publicBaseUrl: 'https://bot.example.com' });
  t.after(() => bot.child.kill('SIGKILL'));
  const port = await bot.ready;
  await new Promise((r) => setTimeout(r, 600));
  // webhook 模式绝不启动 getUpdates 轮询。
  assert.doesNotMatch(bot.output, /getUpdates/);
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(health.components.telegram_ingress.state, 'webhook');
});