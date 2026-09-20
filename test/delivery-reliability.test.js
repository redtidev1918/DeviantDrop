import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { CookieStore, mergeCookieHeaders } from '../src/auth/cookie-store.js';
import { getWebSession } from '../src/deviantart/web-session.js';
import { normalizeArtwork, mimeForKind } from '../src/deviantart/media-normalizer.js';
import { sendArtworkPlan } from '../src/telegram/sender.js';

test('mergeCookieHeaders refreshes rotated cookies without dropping login identity', () => {
  assert.equal(
    mergeCookieHeaders('auth=old; auth_secure=keep; userinfo=user', 'auth=fresh; g_state=new'),
    'auth=fresh; auth_secure=keep; userinfo=user; g_state=new',
  );
});

test('signed-in homepage persists Set-Cookie refresh; anonymous response cannot overwrite it', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const dir = mkdtempSync(join(tmpdir(), 'dd-refresh-'));
  const store = new CookieStore({ path: join(dir, 'cookies.json') });
  store.set('auth=old; auth_secure=keep; userinfo=user');
  const env = {
    cookieStore: store,
    caches: { da: new Map() },
  };
  const cache = new Map();
  const cacheGet = async (ns, key) => cache.get(`${ns}:${key}`) ?? null;
  const cacheSet = async (ns, key, value) => { cache.set(`${ns}:${key}`, value); };
  const headers = new Headers();
  headers.append('Set-Cookie', 'auth=fresh; Path=/; HttpOnly');
  globalThis.fetch = async () => new Response('window.__CSRF_TOKEN__ = "csrf"; {"isLoggedIn":true}', { headers });
  await getWebSession(env, {}, { cacheGet, cacheSet });
  assert.match(store.getCookies(), /auth=fresh/);
  assert.match(store.getCookies(), /auth_secure=keep/);
  assert.match(store.getCookies(), /userinfo=user/);

  store.set('auth=must-survive');
  globalThis.fetch = async () => new Response('window.__CSRF_TOKEN__ = "csrf"; {"isLoggedIn":false}');
  await getWebSession(env, {}, { cacheGet, cacheSet });
  assert.match(store.getCookies(), /auth=must-survive/);
  rmSync(dir, { recursive: true, force: true });
});

test('video model preserves DeviantArt video formats and MIME types', () => {
  const deviation = {
    deviationId: 42,
    title: 'video',
    isVideo: true,
    media: {
      baseUri: 'https://cdn.test/original.webm',
      types: [
        { t: 'video', q: '1080p', b: 'https://cdn.test/video.mov' },
        { t: 'video', q: '720p', b: 'https://cdn.test/video.mp4' },
      ],
    },
  };
  const artwork = normalizeArtwork(deviation, { sourceUrl: 'https://www.deviantart.com/x/art/v-42' });
  assert.equal(artwork.media[0].kind, 'video');
  assert.equal(artwork.media[0].url, 'https://cdn.test/video.mov');
  assert.equal(artwork.media[0].mimeType, 'video/mp4');
  assert.equal(mimeForKind('video'), 'video/mp4');
});

test('media delivery replies to the live source message as its final checkpoint', async (t) => {
  const original = globalThis.fetch;
  const payloads = [];
  t.after(() => { globalThis.fetch = original; });
  const message = { message_id: 7, chat: { id: 8, type: 'private' } };
  globalThis.fetch = async (input, init) => {
    payloads.push(JSON.parse(init.body));
    return Response.json({ ok: true, result: { photo: [{ file_id: 'p' }] } });
  };
  await sendArtworkPlan([{ kind: 'photo', url: 'https://cdn.test/a.jpg' }], message, { BOT_TOKEN: '1:x' }, {
    upload: false,
    cap: { sourceUrl: 'https://www.deviantart.com/x/art/a-1', status: {} },
  });
  assert.equal(payloads[0].reply_parameters.message_id, 7);
  assert.equal(payloads[0].reply_parameters.allow_sending_without_reply, false);
});
