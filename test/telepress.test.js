import test from "node:test";
import assert from "node:assert/strict";
import { TelePress } from "../src/publishing/telepress.js";

function memCache() {
  const m = new Map();
  return {
    cacheGet: async (ns, k) => m.get(`${ns}:${k}`) ?? null,
    cacheSet: async (ns, k, v) => m.set(`${ns}:${k}`, v),
    _m: m,
  };
}

test("mode=off 或无 URL：不启用，发布返回 null", async () => {
  const t = new TelePress({ url: "", mode: "always", ...memCache() });
  assert.equal(t.enabled(), false);
  assert.equal(await t.publishGallery({ deviationId: "1", files: [{ data: new Uint8Array([1]) }] }), null);
});

test("large-gallery：>10 张才触发主动建页；<=10 不触发", () => {
  const t = new TelePress({ url: "http://127.0.0.1:9000", mode: "large-gallery", ...memCache() });
  assert.equal(t.shouldPublishLargeGallery(10), false);
  assert.equal(t.shouldPublishLargeGallery(11), true);
});

test("fallback 模式：Telegram 失败时允许兜底", () => {
  const t = new TelePress({ url: "http://127.0.0.1:9000", mode: "fallback", ...memCache() });
  assert.equal(t.shouldFallback(), true);
  assert.equal(t.shouldPublishLargeGallery(100), false, "fallback 不主动建大图集页");
});

test("publishGallery：成功返回 url 并缓存，第二次命中缓存不重复请求", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json({ url: "https://telegra.ph/abc", ok: true }); };
  const cache = memCache();
  const t = new TelePress({ url: "http://127.0.0.1:9000", mode: "large-gallery", fetchImpl, ...cache });
  const files = Array.from({ length: 11 }, (_, i) => ({ data: new Uint8Array([i]), filename: `i${i}.jpg` }));
  const r1 = await t.publishGallery({ deviationId: "777", files, title: "set", link: "https://da/x" });
  assert.equal(r1.url, "https://telegra.ph/abc");
  assert.equal(r1.cached, false);
  const r2 = await t.publishGallery({ deviationId: "777", files, title: "set" });
  assert.equal(r2.cached, true);
  assert.equal(calls, 1, "同一 deviation 只发布一次");
});

test("publishGallery：TelePress 失败/401 时返回 null（不抛、不影响 Telegram）", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ detail: "Invalid or missing API key" }), { status: 401 });
  const t = new TelePress({ url: "http://127.0.0.1:9000", apiKey: "wrong", mode: "fallback", fetchImpl, ...memCache() });
  const r = await t.publishGallery({ deviationId: "9", files: [{ data: new Uint8Array([1]) }] });
  assert.equal(r, null);
});

test("publishGallery：网络异常时吞掉返回 null", async () => {
  const fetchImpl = async () => { throw new Error("ECONNREFUSED"); };
  const t = new TelePress({ url: "http://127.0.0.1:9000", mode: "always", fetchImpl, ...memCache() });
  const r = await t.publishGallery({ deviationId: "5", files: [{ data: new Uint8Array([1]) }] });
  assert.equal(r, null);
});

test("publishGallery：携带 Bearer 鉴权头", async () => {
  let seen = null;
  const fetchImpl = async (url, init) => { seen = init.headers; return Response.json({ url: "https://telegra.ph/z" }); };
  const t = new TelePress({ url: "http://127.0.0.1:9000", apiKey: "k123", mode: "always", fetchImpl, ...memCache() });
  await t.publishGallery({ deviationId: "1", files: [{ data: new Uint8Array([1]) }] });
  assert.equal(seen.Authorization, "Bearer k123");
});

test("remoteMedia 默认关闭；开启后 remoteMediaEnabled 为真", () => {
  const off = new TelePress({ url: "http://127.0.0.1:9000", mode: "large-gallery", ...memCache() });
  assert.equal(off.remoteMediaEnabled(), false, "默认不进 manifest 路径");
  const on = new TelePress({ url: "http://127.0.0.1:9000", mode: "large-gallery", remoteMedia: true, ...memCache() });
  assert.equal(on.remoteMediaEnabled(), true);
});

test("publishGallery：remoteMedia 开启且传 media 时发送轻量 manifest，不带 files", async () => {
  let seen = null;
  const fetchImpl = async (url, init) => {
    seen = init.body;
    return Response.json({ url: "https://telegra.ph/manifest" });
  };
  const t = new TelePress({ url: "http://127.0.0.1:9000", mode: "large-gallery", remoteMedia: true, fetchImpl, ...memCache() });
  const media = [
    { assetId: "deviantart:u1:p0", kind: "photo", sourceUrl: "https://cdn.test/1.jpg" },
    { assetId: "deviantart:u1:p1", kind: "photo", sourceUrl: "https://cdn.test/2.jpg" },
  ];
  const r = await t.publishGallery({ deviationId: "m1", title: "远程", media, link: "https://da/x" });
  assert.equal(r.url, "https://telegra.ph/manifest");
  assert.ok(seen instanceof FormData, "请求体应为 multipart FormData");
  assert.equal(seen.get("files"), null, "media 路径不应携带 files 字段");
  const payload = seen.get("media");
  assert.ok(payload, "应包含 media 表单字段");
  assert.deepEqual(JSON.parse(payload), media);
});

test("publishGallery：remoteMedia 关闭时即使传入 media 也只走原 files 字段", async () => {
  let seen = null;
  const fetchImpl = async (url, init) => {
    seen = init.body;
    return Response.json({ url: "https://telegra.ph/local" });
  };
  const t = new TelePress({ url: "http://127.0.0.1:9000", mode: "large-gallery", remoteMedia: false, fetchImpl, ...memCache() });
  const r = await t.publishGallery({ deviationId: "m2", files: [{ data: new Uint8Array([1]) }], media: [{ sourceUrl: "https://cdn.test/1.jpg" }] });
  assert.equal(r.url, "https://telegra.ph/local");
  assert.ok(seen instanceof FormData);
  assert.ok(seen.getAll("files").length === 1, "仍然走二进制 files 字段");
  assert.equal(seen.get("media"), null, "默认不应发送 media");
});
