import test from 'node:test';
import assert from 'node:assert/strict';
import { registerCommands, telegram, telegramForm, TelegramMediaTooLargeError } from '../src/telegram/api.js';

// HTTP 413 semantics: RFC 9110 section 15.5.14, checked 2026-10-22.
// Deliberately use a non-JSON response: proxies need not speak Bot API JSON.
test('HTTP 413 is a size rejection for JSON and multipart requests', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response('Request Entity Too Large', { status: 413 });
  };
  try {
    await assert.rejects(telegram({ BOT_TOKEN: 'test' }, 'sendVideo', {}), TelegramMediaTooLargeError);
    await assert.rejects(telegramForm({ BOT_TOKEN: 'test' }, 'sendVideo', new FormData()), TelegramMediaTooLargeError);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test('registerCommands sets global and admin private command scopes', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({ ok: true, result: true });
  };
  try {
    await registerCommands({ BOT_TOKEN: '123:test' }, ['42']);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /setMyCommands$/);
    assert.deepEqual(calls[0].body.commands.map((command) => command.command), ['start', 'help', 'about']);
    assert.deepEqual(calls[1].body.scope, { type: 'chat', chat_id: 42 });
    assert.deepEqual(calls[1].body.commands.map((command) => command.command), ['start', 'help', 'about', 'login', 'cookie', 'status']);
  } finally {
    globalThis.fetch = original;
  }
});

test('registerCommands failure does not throw during startup', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ok: false, description: 'boom' });
  try {
    await registerCommands({ BOT_TOKEN: '123:test' }, []);
  } finally {
    globalThis.fetch = original;
  }
});
