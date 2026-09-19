import test from "node:test";
import assert from "node:assert/strict";
import { publishArtwork } from "../src/publishing/gallery.js";
import { TelePress } from "../src/publishing/telepress.js";

function memCache() {
  const m = new Map();
  return {
    cacheGet: async (ns, k) => m.get(`${ns}:${k}`) ?? null,
    cacheSet: async (ns, k, v) => m.set(`${ns}:${k}`, v),
  };
}

const mediaItem = {
  title: "远程图集",
  kind: "photo",
  url: "https://images.wixmp.com/0.jpg",
  assetId: "deviantart:u1:p0",
  extras: [
    { kind: "photo", url: "https://images.wixmp.com/1.jpg", assetId: "deviantart:u1:p1" },
  ],
};

test("remoteMedia 开启时 publishArtwork 优先发轻量 manifest，不下载图片", async (t) => {
  let teleCalls = 0;
  const client = new TelePress({
    url: "http://127.0.0.1:9000",
    mode: "always",
    remoteMedia: true,
    ...memCache(),
    fetchImpl: async () => { teleCalls++; return Response.json({ url: "https://telegra.ph/manifest" }); },
  });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let imageFetches = 0;
  globalThis.fetch = async () => { imageFetches++; return new Response("img"); };
  const url = await publishArtwork({ telepress: client }, "id-1", mediaItem, "https://da/x");
  assert.equal(url, "https://telegra.ph/manifest");
  assert.equal(teleCalls, 1, "只调用一次 TelePress manifest");
  assert.equal(imageFetches, 0, "manifest 路径不应下载原图字节");
});

test("remoteMedia 关闭时 publishArtwork 仍走二进制 multipart 发图（默认链路）", async (t) => {
  let teleCalls = 0;
  const client = new TelePress({
    url: "http://127.0.0.1:9000",
    mode: "always",
    remoteMedia: false,
    ...memCache(),
    fetchImpl: async () => { teleCalls++; return Response.json({ url: "https://telegra.ph/files" }); },
  });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => {
    if (String(url).includes("images.wixmp.com")) return new Response("img-bytes", { headers: { "Content-Type": "image/jpeg" } });
    return new Response("unexpected", { status: 404 });
  };
  const url = await publishArtwork({ telepress: client }, "id-2", mediaItem, "https://da/x");
  assert.equal(url, "https://telegra.ph/files");
  assert.equal(teleCalls, 1, "关闭远程 manifest 时只走一次二进制 multipart");
});

test("remoteMedia 开启但 manifest 失败时自动回落二进制 multipart", async (t) => {
  let calls = 0;
  const client = new TelePress({
    url: "http://127.0.0.1:9000",
    mode: "always",
    remoteMedia: true,
    ...memCache(),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ detail: "remote disabled" }), { status: 400 });
      return Response.json({ url: "https://telegra.ph/fallback" });
    },
  });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => {
    if (String(url).includes("images.wixmp.com")) return new Response("img-bytes", { headers: { "Content-Type": "image/jpeg" } });
    return new Response("unexpected", { status: 404 });
  };
  const url = await publishArtwork({ telepress: client }, "id-3", mediaItem, "https://da/x");
  assert.equal(url, "https://telegra.ph/fallback");
  assert.equal(calls, 2, "第一次 manifest 失败后第二次用二进制 multipart 兜底");
});
