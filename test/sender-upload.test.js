import test from 'node:test';
import assert from 'node:assert/strict';
import { sendArtworkPlan } from '../src/telegram/sender.js';
import { requestBody } from './helpers/request-body.js';

// Boundary from https://core.telegram.org/bots/api#sending-files, 2026-10-22.
test('oversized video does not prevent sending the other album items', async () => {
  const original = globalThis.fetch;
  let posts = 0;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://cdn.test/')) {
      return new Response(new Uint8Array(String(url).endsWith('large.mp4') ? 50 * 1024 * 1024 + 1 : 1));
    }
    posts++;
    return Response.json({ ok: true, result: { photo: [{ file_id: 'small' }] } });
  };
  try {
    const results = await sendArtworkPlan([
      { kind: 'photo', url: 'https://cdn.test/small.jpg' },
      { kind: 'video', url: 'https://cdn.test/large.mp4' },
    ], { message_id: 1, chat: { id: 9 } }, { BOT_TOKEN: 'test' }, { upload: true });
    assert.equal(posts, 1);
    assert.equal(results.length, 1);
    assert.deepEqual(results.failures.map(x => x.sourceIndex), [1]);
  } finally { globalThis.fetch = original; }
});

test('multipart album sends oversized photos as original documents', async () => {
  const originalFetch = globalThis.fetch;
  const posts = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith('https://cdn.test/')) {
      return new Response(new Uint8Array(11 * 1024 * 1024), { headers: { 'Content-Type': 'image/jpeg' } });
    }
    const form = await requestBody(init);
    posts.push({
      method: url.split('/').pop(),
      fields: form instanceof FormData ? [...form.keys()] : [],
    });
    return Response.json({ ok: true, result: { document: { file_id: `doc-${posts.length}` } } });
  };
  try {
    const message = { message_id: 1, chat: { id: 9, type: 'private' } };
    const results = await sendArtworkPlan([
      { kind: 'photo', url: 'https://cdn.test/a.jpg' },
      { kind: 'photo', url: 'https://cdn.test/b.jpg' },
    ], message, { BOT_TOKEN: '123:test' }, { upload: true });
    assert.equal(results.length, 2);
    assert.deepEqual(posts.map((post) => post.method), ['sendDocument', 'sendDocument']);
    assert.ok(posts.every((post) => post.fields.includes('document')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('inline literature content uploads as a text document without a CDN fetch', async () => {
  const originalFetch = globalThis.fetch;
  const posts = [];
  globalThis.fetch = async (input, init = {}) => {
    const form = await requestBody(init);
    posts.push({
      method: String(input).split('/').pop(),
      fields: form instanceof FormData ? [...form.keys()] : [],
      document: form instanceof FormData ? form.get('document') : null,
    });
    return Response.json({ ok: true, result: { document: { file_id: 'doc-text' } } });
  };
  try {
    const message = { message_id: 1, chat: { id: 9, type: 'private' } };
    const results = await sendArtworkPlan([
      { kind: 'document', content: 'A small representation', extension: 'txt', fileName: 'story' },
    ], message, { BOT_TOKEN: '123:test' }, { upload: true });
    assert.equal(results.length, 1);
    assert.equal(posts[0].method, 'sendDocument');
    assert.equal(posts[0].document?.name, 'story.txt');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
