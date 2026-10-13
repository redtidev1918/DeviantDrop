import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { probeWebSession } from '../src/deviantart/web-session.js';
import { initialStateSessionUser } from '../src/deviantart/http.js';
import { WEB_SESSION_STATUS } from '../src/auth/cookie-store.js';

// Captured anonymous page and provenance: fixtures/deviantart-home-evidence.md.
// Signed-in/malformed examples below are policy mutations, not live auth evidence.
const ANONYMOUS_HTML = readFileSync(new URL('./fixtures/deviantart-home-anonymous.html', import.meta.url), 'utf8');

function cookieEnv(extra = {}) {
  const marks = [];
  return {
    marks,
    env: {
      DA_COOKIES: null,
      cookieStore: {
        getState: () => ({ hasCookie: true, state: WEB_SESSION_STATUS.UNKNOWN }),
        getCookies: () => 'auth=web',
        markStatus: (state) => marks.push(state),
      },
      ...extra,
    },
  };
}

test('explicit logged-out homepage marks web session expired', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(ANONYMOUS_HTML, { status: 200 });
  try {
    const { env, marks } = cookieEnv();
    assert.equal(await probeWebSession(env, { force: true }), WEB_SESSION_STATUS.EXPIRED);
    assert.deepEqual(marks, [WEB_SESSION_STATUS.EXPIRED]);
  } finally {
    globalThis.fetch = original;
  }
});

test('network failure is unknown and never expires the stored session', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('timeout'); };
  try {
    const { env, marks } = cookieEnv();
    assert.equal(await probeWebSession(env, { force: true }), WEB_SESSION_STATUS.UNKNOWN);
    assert.deepEqual(marks, []);
  } finally {
    globalThis.fetch = original;
  }
});

test('5xx and WAF responses stay unknown', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('busy', { status: 503 });
  try {
    const { env, marks } = cookieEnv();
    assert.equal(await probeWebSession(env, { force: true }), WEB_SESSION_STATUS.UNKNOWN);
    assert.deepEqual(marks, []);
  } finally {
    globalThis.fetch = original;
  }
});

const SIGNED_IN_HTML = String.raw`<script>window.__INITIAL_STATE__ = JSON.parse("{\"@@publicSession\":{\"isLoggedIn\":true,\"user\":{\"username\":\"artist\"}},\"title\":\"artist\'s work\"}");</script>`;
const LOGGED_IN_NO_NAME_HTML = String.raw`<script>window.__INITIAL_STATE__ = JSON.parse("{\"@@publicSession\":{\"isLoggedIn\":true}}");</script>`;
const LEGACY_SINGLE_AT_HTML = String.raw`<script>window.__INITIAL_STATE__ = JSON.parse("{\"@publicSession\":{\"user\":{\"username\":\"artist\"}}}");</script>`;

test('parser reads the server-rendered username through JS escapes', () => {
  assert.equal(initialStateSessionUser(SIGNED_IN_HTML), 'artist');
  assert.equal(initialStateSessionUser(LEGACY_SINGLE_AT_HTML), 'artist');
});

test('parser keeps explicit anonymous distinct from missing evidence', () => {
  assert.equal(initialStateSessionUser(ANONYMOUS_HTML), 'anonymous');
  assert.equal(initialStateSessionUser(LOGGED_IN_NO_NAME_HTML), null);
  assert.equal(initialStateSessionUser('<html/>'), null);
  assert.equal(initialStateSessionUser('window.__INITIAL_STATE__ = JSON.parse("broken");'), null);
});

test('truncated initializer cannot confirm a session', () => {
  assert.equal(initialStateSessionUser(SIGNED_IN_HTML.slice(0, SIGNED_IN_HTML.lastIndexOf('");'))), null);
});

test('unrelated signed-out marker cannot expire a stored session', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('<script>const unrelated = {"isLoggedIn":false};</script>');
  try {
    const { env, marks } = cookieEnv();
    assert.equal(await probeWebSession(env, { force: true }), WEB_SESSION_STATUS.UNKNOWN);
    assert.deepEqual(marks, []);
  } finally {
    globalThis.fetch = original;
  }
});

test('signed-in homepage with a username marks web session valid', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(SIGNED_IN_HTML, { status: 200 });
  try {
    const { env, marks } = cookieEnv();
    assert.equal(await probeWebSession(env, { force: true }), WEB_SESSION_STATUS.VALID);
    assert.deepEqual(marks, [WEB_SESSION_STATUS.VALID]);
  } finally {
    globalThis.fetch = original;
  }
});

test('isLoggedIn true without a username stays UNKNOWN (invariant 6)', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(LOGGED_IN_NO_NAME_HTML, { status: 200 });
  try {
    const { env, marks } = cookieEnv();
    assert.equal(await probeWebSession(env, { force: true }), WEB_SESSION_STATUS.UNKNOWN);
    assert.deepEqual(marks, []);
  } finally {
    globalThis.fetch = original;
  }
});
