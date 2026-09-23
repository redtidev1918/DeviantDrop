// 统一的作品 caption / 来源渲染。
//
// 设计：媒体消息的 caption 只放标题/作者/数量/状态 + 末尾空行隔开的两个超链接
// （🔗 source | 📲 DAViewer client，parse_mode=HTML 的 <a> 锚点，由服务端解析，
// 不依赖自定义 caption_entities——multipart 上传端点对自定义 caption_entities 的
// offset/length 有 bug：按 code point 收、却按 UTF-16/字节存，含 emoji 时高亮错位，
// 实测 2026-09；HTML 锚点没有偏移概念，emoji 也不影响）。title/author/URL 全部做
// HTML 转义，防 Telegram 422。
//   - 不再用 inline 键盘按钮：sendMediaGroup（无论 JSON 还是 multipart、无论顶层
//     还是条目级 reply_markup）都会静默丢弃按钮，导致单图与相册行为不一致；
//     caption 超链接在所有发送路径上都可靠。
//   - 单图/视频/相册/上传/file_id 重放行为一致：两个链接只出现在首条发送单元的
//     caption 末尾，每个作品一次、绝不重复。

const CAPTION_LIMIT = 1024;

// caption 末尾超链接的标签与地址。
export const SOURCE_LINK_TEXT = "source";
export const CLIENT_LINK_TEXT = "DAViewer client";
export const CLIENT_DOWNLOAD_URL = "https://redtidev1918.github.io/DAViewer/#/download";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// 媒体 caption（parse_mode=HTML，见文件头注释）。返回 { text }。
// opts.showNotes=false 时省略技术性 ⚠️ 提示（压缩/打码/原图不可用/转文件）：
// 这些对运营者排查有用，对群里看图的人是噪音，群聊默认不显示（见 telegram/sender.js 的 notesEnabled）。
// opts.sourceUrl 存在时在末尾空行后追加「🔗 source | 📲 DAViewer client」；1024 上限优先保证链接行完整。
export function renderArtworkCaption(meta = {}, status = {}, { showNotes = true, sourceUrl = null } = {}) {
  const lines = [];
  const title = (meta.title || "DeviantArt 作品").trim();
  lines.push(`🎨 ${escapeHtml(title)}`);
  if (meta.author) lines.push(`👤 ${escapeHtml(meta.author)}`);
  if (Number.isInteger(meta.mediaCount) && meta.mediaCount > 1) {
    lines.push(`🖼 ${meta.mediaCount} 个媒体`);
  }
  if (showNotes) {
    const notes = [];
    if (status.compressed) notes.push("部分图片超过 10MB，已压缩发送");
    if (status.skippedPages) notes.push("部分附加图片暂时无法获取，请在原站查看");
    if (status.blurredPreview) notes.push("仅能获取打码预览，请在原站查看");
    if (status.lockedPreview) notes.push("作品需要订阅/购买，当前为打码预览，请在原站查看");
    if (status.previewOnly) notes.push("原图暂不可用，已使用高清展示图");
    if (status.docFallback) notes.push("图片过大，已作为文件发送");
    if (notes.length) lines.push(`⚠️ ${notes.join("；")}`);
  }
  const body = lines.join("\n");
  if (sourceUrl) {
    // 空行隔开 + 「🔗 | 📲」两个超链接：Telegram HTML 不支持居中标签，用空行与 emoji 分隔。
    const footer = `\n\n🔗 <a href="${escapeHtml(sourceUrl)}">${SOURCE_LINK_TEXT}</a> | 📲 <a href="${escapeHtml(CLIENT_DOWNLOAD_URL)}">${CLIENT_LINK_TEXT}</a>`;
    const head = body.slice(0, Math.max(0, CAPTION_LIMIT - footer.length)).replace(/[\uD800-\uDBFF]$/, "");
    return { text: `${head}${footer}` };
  }
  return { text: body.slice(0, CAPTION_LIMIT).replace(/[\uD800-\uDBFF]$/, "") };
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
