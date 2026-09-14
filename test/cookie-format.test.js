import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import {
  WEB_SESSION_STATUS,
  CookieStore,
  normalizeCookieHeader,
  encodeCookieValue,
} from '../src/auth/cookie-store.js';

test('normalizeCookieHeader：整行 Cookie 头原样保留并折叠空白', () => {
  const header = '  auth=abc123; auth_secure=def; userinfo=xyz  ';
  assert.equal(normalizeCookieHeader(header), 'auth=abc123; auth_secure=def; userinfo=xyz');
  assert.equal(normalizeCookieHeader('cookie: a=1; b=2'), 'a=1; b=2');
  assert.equal(normalizeCookieHeader('a=1\nb=2'), 'a=1 b=2');
});

test('normalizeCookieHeader：JSON 对象（多行、混合已编码/未编码值）转成 Cookie 头', () => {
  const json = `{
  "auth": "__c6d14f8c...%3B%221b88fd28%22",
  "auth_secure": "__3a324af9...%3B%22d48cfd0f%22",
  "userinfo": "__4bd5399b...%7B%22username%22%3A%22hezzn%22%7D",
  "g_state": "{\\"i_l\\":0,\\"i_b\\":\\"8tSQb8Br\\"}",
  "_px": "I2fmOqcf/RRR+Q=="
}`;
  const got = normalizeCookieHeader(json);
  // 名称=值 用 ; 连接，空格/引号/逗号/花括号按 RFC6265 cookie-octet 百分号编码
  assert.ok(got.includes('auth=__c6d14f8c...%3B%221b88fd28%22'));
  assert.ok(got.includes('auth_secure=__3a324af9...%3B%22d48cfd0f%22'));
  assert.ok(got.includes('userinfo=__4bd5399b...%7B%22username%22%3A%22hezzn%22%7D'));
  // 未编码的 JSON 字符串里的引号/逗号/反斜杠被编码；花括号/冒号是 RFC6265
  // cookie-octet（0x5D-0x7E / 0x2D-0x3A）允许原样，等号与 base64 的 +/ 也保留
  assert.ok(got.includes('g_state={%22i_l%22:0%2C%22i_b%22:%228tSQb8Br%22}'));
  assert.ok(got.includes('_px=I2fmOqcf/RRR+Q=='));
  // 无换行、无明文引号
  assert.ok(!/[\r\n"]/.test(got));
  // 每条都是 name=value 且可被 set() 接受
  const t = tempStore();
  t.store.set(got);
  assert.ok(t.store.getCookies());
  t.finalize();
});

test('normalizeCookieHeader：JSON 数组（插件导出格式）只取 name/value', () => {
  const json = JSON.stringify([
    { name: 'auth', value: 'a1', domain: '.deviantart.com', path: '/', httpOnly: true },
    { name: 'auth_secure', value: 'a2', domain: '.deviantart.com', path: '/', httpOnly: true },
    { name: 'userinfo', value: 'u3' },
    { name: 'tracker', value: 123 }, // 非字符串值跳过
    { name: '', value: 'skip' },     // 空名字跳过
  ]);
  const got = normalizeCookieHeader(json);
  assert.equal(got, 'auth=a1; auth_secure=a2; userinfo=u3');
});

test('normalizeCookieHeader：JSON 对象同名去重取最后一个', () => {
  const got = normalizeCookieHeader('{"auth":"a1","auth":"a2","userinfo":"u"}');
  assert.equal(got, 'auth=a2; userinfo=u');
});

test('normalizeCookieHeader：空/纯空 JSON/无字符串值/坏 JSON 都抛出', () => {
  assert.throws(() => normalizeCookieHeader(''), /格式无效/);
  assert.throws(() => normalizeCookieHeader('   '), /格式无效/);
  assert.throws(() => normalizeCookieHeader('{}'), /格式无效/);
  assert.throws(() => normalizeCookieHeader('{"auth":123}'), /格式无效/);
  assert.throws(() => normalizeCookieHeader('{"auth":'), /无法解析/);
  assert.throws(() => normalizeCookieHeader('[{}, {"name":"x"}]'), /格式无效/);
});

test('encodeCookieValue：只编码 cookie-octet 之外的字符', () => {
  assert.equal(encodeCookieValue('abc=def/+%123'), 'abc=def/+%123'); // 等号斜杠加号百分号保留
  assert.equal(encodeCookieValue('a b'), 'a%20b');
  assert.equal(encodeCookieValue('a"b,c;d\\e'), 'a%22b%2Cc%3Bd%5Ce');
});

function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), 'dd-cookie-'));
  return {
    store: new CookieStore({ path: join(dir, 'cookies.json') }),
    finalize: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('CookieStore.set 接受 JSON 对象并落盘为合法状态', () => {
  const t = tempStore();
  const store = t.store;
  store.set('{"auth":"a1","auth_secure":"a2","userinfo":"u3"}');
  assert.equal(store.getCookies(), 'auth=a1; auth_secure=a2; userinfo=u3');
  assert.equal(store.getState().state, WEB_SESSION_STATUS.UNKNOWN);
  t.finalize();
});

test('CookieStore.set 拒绝坏 JSON 且不落盘', () => {
  const t = tempStore();
  const store = t.store;
  assert.throws(() => store.set('{"auth":'), /无法解析/);
  assert.equal(store.getCookies(), null);
  t.finalize();
});