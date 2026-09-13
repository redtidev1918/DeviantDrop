// 统一的作品 caption / 来源渲染。
//
// 设计：媒体消息的 caption 只放标题/作者/数量/状态，**不放来源链接、不放 entity**。
// 来源用「一个可靠、可点击的入口」单独承载，且每个作品只有一个、绝不重复：
//   - 一律在媒体发出后补发一行小号蓝色 "source" 文本超链接（text_link，JSON 路径
//     UTF-16 始终可靠），指向原作品页；不展开链接预览。
//   - 「📲 Daviewer 客户端」按钮：单图/单视频图片下方的 inline 键盘按钮
//     （JSON 传 URL、file_id 重放、multipart 上传/文档降级都可靠生效），指向 DAViewer
//     客户端下载页——用客户端浏览 DeviantArt 更顺手。
//   - 相册（多图）：Telegram 的 sendMediaGroup（无论 JSON 还是 multipart、无论顶层
//     还是条目级 reply_markup）都会静默丢弃按钮，所以相册只补发 source 文本行。
//     —— 必须是独立 JSON 文本消息：multipart 上传端点对自定义 caption_entities 的
//     offset/length 处理有 bug（按 code point 收、却按 UTF-16/字节存，含 emoji 时
//     高亮错位，实测 2026-09），而 JSON sendMessage 的 text_link entity（UTF-16）始终正确。

const CAPTION_LIMIT = 1024;

// 客户端按钮 / 来源文本的标签与地址。
export const CLIENT_BUTTON_TEXT = "📲 Daviewer 客户端";
export const CLIENT_DOWNLOAD_URL = "https://redtidev1918.github.io/daviewer/#/download";
export const SOURCE_LINK_TEXT = "source";

// 媒体 caption（无来源、无 entity，避免 multipart offset bug）。返回 { text }。
// opts.showNotes=false 时省略技术性 ⚠️ 提示（压缩/打码/原图不可用/转文件）：
// 这些对运营者排查有用，对群里看图的人是噪音，群聊默认不显示（见 telegram/sender.js 的 notesEnabled）。
export function renderArtworkCaption(meta = {}, status = {}, { showNotes = true } = {}) {
  const lines = [];
  const title = (meta.title || "DeviantArt 作品").trim();
  lines.push(`🎨 ${title}`);
  if (meta.author) lines.push(`👤 ${meta.author}`);
  if (Number.isInteger(meta.mediaCount) && meta.mediaCount > 1) {
    lines.push(`🖼 ${meta.mediaCount} 个媒体`);
  }
  if (showNotes) {
    const notes = [];
    if (status.compressed) notes.push("部分图片超过 10MB，已压缩发送");
    if (status.skippedPages) notes.push("部分附加图片暂时无法获取，请在原站查看");
    if (status.blurredPreview) notes.push("仅能获取打码预览，请在原站查看");
    if (status.previewOnly) notes.push("原图暂不可用，已使用高清展示图");
    if (status.docFallback) notes.push("图片过大，已作为文件发送");
    if (notes.length) lines.push(`⚠️ ${notes.join("；")}`);
  }
  const body = lines.join("\n").slice(0, CAPTION_LIMIT).replace(/[\uD800-\uDBFF]$/, "");
  return { text: body };
}

// 单媒体的 inline 键盘（仅单图/单视频用；相册会被静默丢弃，相册改走补发文本）。
// 也用于非媒体消息（如 Telegraph 兜底入口）。按钮=DAViewer 客户端下载页，与原作品页无关
// （原作品页由补发的 source 文本行承载）。
export function openButtonMarkup(sourceUrl, extraButtons = []) {
  if (!sourceUrl) return undefined;
  const row = [{ text: CLIENT_BUTTON_TEXT, url: CLIENT_DOWNLOAD_URL }, ...extraButtons];
  return { inline_keyboard: [row] };
}

// 所有作品回复补发的一条可点击来源文本（JSON sendMessage，text_link 按 UTF-16 始终正确）。
// 返回 { text, entities }。文本极小（"source"），不占地方、不展开链接预览。
export function sourceLineText(sourceUrl) {
  if (!sourceUrl) return { text: "", entities: [] };
  const text = SOURCE_LINK_TEXT;
  return {
    text,
    entities: [{ type: "text_link", offset: 0, length: text.length, url: sourceUrl }],
  };
}

// 把 resolveWebMedia 的 media 对象 + 作品页 URL 归一化成发送函数使用的 cap：
// { title, author, mediaCount, sourceUrl }。下载/压缩阶段的状态由发送函数内部重渲染。
export function buildCapFromMedia(media, sourceUrl) {
  // media.title 形如 "标题 — 作者"，拆回标题/作者；拆不出就整串当标题。
  let title = media?.title || "DeviantArt 作品";
  let author;
  const m = String(title).match(/^(.*?)\s+—\s+([^—]+)$/);
  if (m) { title = m[1].trim(); author = m[2].trim(); }
  const mediaCount = 1 + (media?.extras?.length || 0) + (media?.skippedExtras || 0);
  return {
    title, author, sourceUrl,
    mediaCount: mediaCount > 1 ? mediaCount : undefined,
    status: { ...(media?.status || {}) },
    text: null,
  };
}
