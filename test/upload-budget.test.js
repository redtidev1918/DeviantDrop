import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { sendArtworkPlan } from '../src/telegram/sender.js';
import { prepareMultipart } from '../src/telegram/multipart.js';
import { downloadMedia, FILE_MAX_BYTES } from '../src/telegram/media-io.js';
import { TelegramDeliveryUncertainError, TelegramPartialDeliveryError, TelegramMediaTooLargeError } from '../src/telegram/api.js';
import { requestBody } from './helpers/request-body.js';
import { snapshot, resetForTest } from '../src/runtime/status.js';

const message = { message_id: 7, chat: { id: 8 }, message_thread_id: 9 };
const env = { BOT_TOKEN: '123:private-test-value' };
const items = (n, kind = 'video') => Array.from({ length: n }, (_, i) => ({ assetId: `asset-${i}`, kind, url: `https://cdn.test/${i}.mp4` }));

// Independent protocol basis: Telegram Sending files / sendMediaGroup and
// HTTP 413 (RFC 9110), verified 2026-10-22. These are fault-injection tests,
// not captures of successful Telegram media sends. See fixtures/upload-evidence.md.
async function mockUpload(t, count, reject, options = {}) {
  const original = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('https://cdn.test/')) return new Response(new URL(url).pathname.slice(1).repeat(30));
    const form = await requestBody(init);
    assert.deepEqual(JSON.parse(form.get('reply_parameters')), { message_id: 7, allow_sending_without_reply: false });
    assert.equal(form.get('message_thread_id'), '9');
    const files = [...form.values()].filter(x => x instanceof Blob);
    const values = await Promise.all(files.map(x => x.text()));
    const call = { method: String(url).split('/').pop(), bytes: init.body.size, values };
    calls.push(call);
    const rejected = await reject?.(call, calls);
    if (rejected) return rejected;
    const sent = values.map(value => ({ message_id: value, video: { file_id: value } }));
    return Response.json({ ok: true, result: sent.length > 1 ? sent : sent[0] });
  };
  return { calls, run: () => sendArtworkPlan(items(count), message, { ...env, ...options }, { upload: true }) };
}

test('multipart accounting matches actual HTTP bytes and preserves original payload', async () => {
  const form = new FormData();
  form.set('caption', '中文\ncaption');
  const original = new Uint8Array([0, 13, 10, 255, 7]);
  form.set('document', new Blob([original]), '中文 " original.bin');
  const prepared = await prepareMultipart(form);
  let actual = 0;
  const server = createServer(async (req, res) => {
    for await (const chunk of req) actual += chunk.length;
    res.end('ok');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await fetch(`http://127.0.0.1:${server.address().port}`, { method: 'POST', headers: prepared.headers, body: prepared.body });
    assert.equal(actual, prepared.bytes);
    const decoded = await new Response(prepared.body, { headers: prepared.headers }).formData();
    assert.deepEqual(new Uint8Array(await decoded.get('document').arrayBuffer()), original);
    assert.ok(prepared.bytes > original.length);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('album budget includes multipart overhead, not just summed file sizes', async t => {
  const { calls, run } = await mockUpload(t, 4, null, { TELEGRAM_ALBUM_MAX_BYTES: 1200 });
  const result = await run();
  assert.equal(result.length, 4);
  assert.ok(calls.length > 1);
  assert.ok(calls.every(x => x.bytes <= 1200));
  assert.deepEqual(calls.flatMap(x => x.values).map(x => x[0]), ['0', '1', '2', '3']);
  assert.deepEqual(result.deliveries.map(x => x.assetId), ['asset-0', 'asset-1', 'asset-2', 'asset-3']);
});

test('aggregate HTTP 413 splits unchanged files in order, without retrying rejected batch', async t => {
  const { calls, run } = await mockUpload(t, 4, call => call.values.length > 2 ? new Response('too large', { status: 413 }) : null);
  const result = await run();
  assert.deepEqual(calls.map(x => x.values.length), [4, 2, 2]);
  assert.equal(result.failures.length, 0);
  assert.deepEqual(result.deliveries.map(x => x.sourceIndex), [0, 1, 2, 3]);
});

test('one rejected file is isolated and later files are still delivered', async t => {
  const { calls, run } = await mockUpload(t, 4, call => call.values.some(x => x.startsWith('1')) ? new Response('too large', { status: 413 }) : null);
  const result = await run();
  assert.deepEqual(result.deliveries.map(x => x.assetId), ['asset-0', 'asset-2', 'asset-3']);
  assert.deepEqual(result.failures.map(x => x.sourceIndex), [1]);
  const accepted = calls.filter(x => !x.values.some(v => v.startsWith('1')));
  assert.deepEqual(accepted.flatMap(x => x.values).map(x => x[0]), ['0', '2', '3']);
  assert.ok(calls.length <= 7);
});

test('every request rejected by 413 has a finite split tree', async t => {
  const { calls, run } = await mockUpload(t, 4, () => new Response('too large', { status: 413 }));
  const result = await run();
  assert.equal(calls.length, 7);
  assert.equal(result.failures.length, 4);
  assert.equal(result.length, 0);
});

test('interrupted upload stops without splitting or sending later items', async t => {
  const { calls, run } = await mockUpload(t, 4, () => { throw new TypeError('socket reset'); });
  await assert.rejects(run(), TelegramDeliveryUncertainError);
  assert.equal(calls.length, 1);
});

test('interrupted later batch preserves confirmed messages and stops', async t => {
  const { calls, run } = await mockUpload(t, 4, (_call, calls) => {
    if (calls.length === 2) throw new TypeError('socket reset');
  }, { TELEGRAM_ALBUM_MAX_BYTES: 1200 });
  await assert.rejects(run(), error => error instanceof TelegramDeliveryUncertainError && error.confirmedMessages.length > 0);
  assert.equal(calls.length, 2);
});

test('deleted source during subdivision stops later sends', async t => {
  const { calls, run } = await mockUpload(t, 4, (_call, calls) => calls.length === 1
    ? new Response('too large', { status: 413 })
    : Response.json({ ok: false, description: 'Bad Request: message to be replied not found' }, { status: 400 }));
  await assert.rejects(run(), /message to be replied not found/);
  assert.equal(calls.length, 2);
});

test('permission failure after a confirmed batch remains partial and does not resend', async t => {
  const { calls, run } = await mockUpload(t, 4, (_call, calls) => calls.length === 2
    ? Response.json({ ok: false, description: 'Forbidden: bot was blocked' }, { status: 403 }) : null,
  { TELEGRAM_ALBUM_MAX_BYTES: 1200 });
  await assert.rejects(run(), TelegramPartialDeliveryError);
  assert.equal(calls.length, 2);
});

test('oversized CDN length cancels download before buffering, separate from DA 403', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let cancelled = false;
  // Actual GIF Content-Length captured from the CDN on 2026-10-22.
  globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Length': '92824537' } });
  await assert.rejects(downloadMedia(items(1)[0], null, 'download', { maxBytes: FILE_MAX_BYTES }), TelegramMediaTooLargeError);
  assert.equal(cancelled, true);
  globalThis.fetch = async () => new Response('forbidden', { status: 403 });
  await assert.rejects(downloadMedia(items(1)[0], null, 'download', { maxBytes: FILE_MAX_BYTES }), e => !(e instanceof TelegramMediaTooLargeError) && /403/.test(e.message));
});

test('chunked downloads enforce actual size even without Content-Length', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(101)); }, cancel() { cancelled = true; } }));
  await assert.rejects(downloadMedia(items(1)[0], null, 'download', { maxBytes: 100 }), TelegramMediaTooLargeError);
  assert.equal(cancelled, true);
});

test('a download 403 skips only that asset and never substitutes lower-quality fallback', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const downloaded = [];
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('https://cdn.test/')) {
      downloaded.push(String(url));
      return String(url).endsWith('/1.mp4') ? new Response('forbidden', { status: 403 }) : new Response('original');
    }
    return Response.json({ ok: true, result: { video: { file_id: 'sent' } } });
  };
  const media = items(3);
  media[1].fallbackUrl = 'https://cdn.test/preview.jpg';
  const result = await sendArtworkPlan(media, message, env, { upload: true });
  assert.deepEqual(result.deliveries.map(x => x.assetId), ['asset-0', 'asset-2']);
  assert.deepEqual(result.failures.map(x => [x.sourceIndex, x.reason]), [[1, 'media_failed']]);
  assert.ok(!downloaded.includes(media[1].fallbackUrl));
});

test('truncated media is not uploaded as an apparently complete file', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response('short', { headers: { 'Content-Length': '20' } });
  await assert.rejects(downloadMedia(items(1)[0]), /不完整/);
});

test('diagnostics record exact body and file sizes without exposing Bot token', async t => {
  resetForTest();
  const { run } = await mockUpload(t, 1);
  await run();
  const events = snapshot().recent_events;
  const request = events.find(x => x.event === 'tg_request');
  assert.equal(request.transport, 'multipart');
  assert.ok(request.request_bytes > request.files[0].bytes);
  assert.equal(request.api_base, 'https://api.telegram.org');
  assert.ok(!JSON.stringify(events).match(/api\.telegram\.org\/bot/));
  assert.equal(events.find(x => x.event === 'tg_response').status, 200);
  assert.ok(!JSON.stringify(events).includes(env.BOT_TOKEN));
});
