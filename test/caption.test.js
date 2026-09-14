import test from "node:test";
import assert from "node:assert/strict";
import {
  renderArtworkCaption,
  openButtonMarkup,
  buildCapFromMedia,
  CLIENT_BUTTON_TEXT,
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

test("sourceUrl 存在时 caption 末尾追加 <a>source</a> 锚点，并做 HTML 转义", () => {
  const { text } = renderArtworkCaption(
    { title: 'Heavy "Mama" & Hunt', author: "A&B<C>" },
    {},
    { sourceUrl: "https://www.deviantart.com/x?a=1&b=2" },
  );
  // 标题/作者转义，防 Telegram 422
  assert.match(text, /Heavy &quot;Mama&quot; &amp; Hunt/);
  assert.match(text, /A&amp;B&lt;C&gt;/);
  // 末尾锚点：URL 转义，"source" 二字即蓝色超链接，空行 + 🔗 前缀隔开更醒目
  assert.match(text, /<a href="https:\/\/www\.deviantart\.com\/x\?a=1&amp;b=2">source<\/a>$/);
  assert.match(text, /\n\n🔗 <a href="https:\/\/www\.deviantart\.com\/x\?a=1&amp;b=2">source<\/a>$/);
  assert.ok(text.length <= 1024);
});

test("超长标题截断且保留完整 source 锚点", () => {
  const { text } = renderArtworkCaption(
    { title: "😀".repeat(1000) },
    {},
    { sourceUrl: "https://www.deviantart.com/x" },
  );
  assert.ok(text.length <= 1024);
  assert.ok(text.endsWith('</a>'), "1024 上限优先保证锚点不被截断");
  assert.ok(text.includes('>source</a>'));
});

test("openButtonMarkup：单媒体 inline 按钮指向 DAViewer 客户端下载页，无来源时为 undefined", () => {
  const markup = openButtonMarkup("https://www.deviantart.com/x");
  assert.ok(markup?.inline_keyboard?.[0]?.[0]);
  assert.equal(markup.inline_keyboard[0][0].url, CLIENT_DOWNLOAD_URL);
  assert.equal(markup.inline_keyboard[0][0].text, CLIENT_BUTTON_TEXT);
  assert.equal(openButtonMarkup(null), undefined);
  assert.equal(openButtonMarkup(""), undefined);
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

test("SOURCE_LINK_TEXT 保持小写 source，供锚点/文档引用", () => {
  assert.equal(SOURCE_LINK_TEXT, "source");
});