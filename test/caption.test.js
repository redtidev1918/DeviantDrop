import test from "node:test";
import assert from "node:assert/strict";
import {
  renderArtworkCaption,
  buildCapFromMedia,
  CLIENT_LINK_TEXT,
  CLIENT_DOWNLOAD_URL,
  SOURCE_LINK_TEXT,
} from "../src/rendering/caption.js";

test("媒体 caption 只含标题/作者/数量/状态，不含来源锚点", () => {
  const { text } = renderArtworkCaption(
    { title: "Heavy Mama Hunt", author: "Mrjoel" },
    {},
  );
  assert.match(text, /🎨 Heavy Mama Hunt/);
  assert.match(text, /👤 Mrjoel/);
  assert.doesNotMatch(text, /<a href|<https?:\/\//, "未传 sourceUrl 时 caption 不应出现链接");
});

test("caption 排版：标题/作者/数量分行，warning 独立成行不粘连", () => {
  const { text } = renderArtworkCaption(
    { title: "T", author: "A", mediaCount: 6 },
    { compressed: true, previewOnly: true },
  );
  assert.match(text, /🎨 T/);
  assert.match(text, /👤 A/);
  assert.match(text, /🖼 6 个媒体/);
  // warning 是单独一行（⚠️），不贴在标题后面
  assert.match(text, /⚠️ 部分图片超过 10MB，已压缩发送；原图暂不可用，已使用高清展示图/);
});

test("caption：付费/订阅锁定预览有明确提示，与成熟打码区分", () => {
  const { text } = renderArtworkCaption(
    { title: "Paid", author: "A" },
    { lockedPreview: true },
  );
  assert.match(text, /作品需要订阅\/购买，当前为打码预览，请在原站查看/);
});

test("sourceUrl 存在时 caption 末尾追加「source | DAViewer app」超链接，并做 HTML 转义", () => {
  const { text } = renderArtworkCaption(
    { title: 'Heavy "Mama" & Hunt', author: "A&B<C>" },
    {},
    { sourceUrl: "https://www.deviantart.com/x?a=1&b=2" },
  );
  // 标题/作者转义，防 Telegram 422
  assert.match(text, /Heavy &quot;Mama&quot; &amp; Hunt/);
  assert.match(text, /A&amp;B&lt;C&gt;/);
  // 末尾空行 + 「🔗 | 📲」两个超链接，URL 转义
  assert.match(text, /\n\n🔗 <a href="https:\/\/www\.deviantart\.com\/x\?a=1&amp;b=2">source<\/a> \| 📲 <a href="https:\/\/redtidev1918\.github\.io\/DAViewer\/#\/download">DAViewer app<\/a>$/);
  assert.ok(text.length <= 1024);
});

test("超长标题截断且保留完整 source 锚点", () => {
  const { text } = renderArtworkCaption(
    { title: "😀".repeat(1000) },
    {},
    { sourceUrl: "https://www.deviantart.com/x" },
  );
  assert.ok(text.length <= 1024);
  assert.ok(text.endsWith('</a>'), "1024 上限优先保证链接行不被截断");
  assert.ok(text.includes('>source</a>'));
});

test("buildCapFromMedia：拆分 '标题 — 作者'，计算 mediaCount", () => {
  const cap = buildCapFromMedia(
    { title: "Heavy Mama Hunt — MrjoelPreggoArt", extras: [{}, {}], skippedExtras: 1 },
    "https://www.deviantart.com/x",
  );
  assert.equal(cap.title, "Heavy Mama Hunt");
  assert.equal(cap.author, "MrjoelPreggoArt");
  assert.equal(cap.mediaCount, 4); // 主图 + 2 extras + 1 skipped
  assert.equal(cap.sourceUrl, "https://www.deviantart.com/x");
});

test("长标题 caption 截断到 1024 以内", () => {
  const { text } = renderArtworkCaption({ title: "😀".repeat(1000) });
  assert.ok(text.length <= 1024);
});

test("技术性 ⚠️ 提示：showNotes=true 显示，false 省略", () => {
  const status = { compressed: true, previewOnly: true };
  const withNotes = renderArtworkCaption({ title: "T", author: "A" }, status, { showNotes: true }).text;
  const withoutNotes = renderArtworkCaption({ title: "T", author: "A" }, status, { showNotes: false }).text;
  assert.match(withNotes, /⚠️/);
  assert.match(withNotes, /已压缩发送/);
  assert.doesNotMatch(withoutNotes, /⚠️/);
  assert.doesNotMatch(withoutNotes, /已压缩发送/);
  assert.doesNotMatch(withoutNotes, /原图暂不可用/);
  // 标题/作者仍保留
  assert.match(withoutNotes, /🎨 T/);
  assert.match(withoutNotes, /👤 A/);
});

test("链接标签与地址保持稳定，供锚点/文档引用", () => {
  assert.equal(SOURCE_LINK_TEXT, "source");
  assert.equal(CLIENT_LINK_TEXT, "DAViewer app");
  assert.equal(CLIENT_DOWNLOAD_URL, "https://redtidev1918.github.io/DAViewer/#/download");
});
