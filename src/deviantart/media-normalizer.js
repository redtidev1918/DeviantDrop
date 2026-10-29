import { NetworkError } from '../auth/errors.js';
// DeviantArt private DTO -> stable artwork model used outside the adapter.

function extensionKind(value = "") {
  let pathname;
  try {
    pathname = new URL(value).pathname.toLowerCase();
  } catch {
    pathname = String(value).split("?", 1)[0].toLowerCase();
  }
  if (pathname.endsWith(".gif")) return "animation";
  if (/\.(?:mp4|m4v|webm|mov|mkv)$/.test(pathname)) return "video";
  if (/\.(?:jpe?g|png|webp|avif)$/.test(pathname)) return "photo";
  return null;
}

export function appendToken(url, rawToken) {
  if (new URL(url).searchParams.has('token')) return url;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  return token ? `${url}${url.includes("?") ? "&" : "?"}token=${token}` : url;
}

function buildMediaUrl(media, template) {
  if (!media.baseUri) return null;
  const url = template
    ? `${media.baseUri}${String(template).replaceAll("<prettyName>", media.prettyName || "image")}`
    : media.baseUri;
  return appendToken(url, media.token);
}

function videoRank(value) {
  return { "1080p": 4, "720p": 3, "480p": 2, "360p": 1 }[value] || 0;
}

// Captured Wix image-operation tokens can authorize a bounded transform while
// rejecting the bare baseUri (see fixtures/deviantart-bounded-media.json).
// This is a URL-selection hint, never authentication or entitlement evidence.
function hasBoundedImageToken(descriptor) {
  try {
    const token = Array.isArray(descriptor.token) ? descriptor.token[0] : descriptor.token;
    const payload = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    const claims = JSON.parse(atob(payload));
    const path = new URL(descriptor.baseUri).pathname;
    return Array.isArray(claims.obj) && claims.obj.some((group) =>
      Array.isArray(group) && group.some((rule) => rule?.path === path &&
        [rule.width, rule.height].some((bound) => typeof bound === 'string' && /^<=\d+$/.test(bound))));
  } catch { return false; }
}

// DeviantArt 的视频 `media.baseUri` 是封面图，不是可播放媒体；
// 调用方必须把 DTO 顶层的视频标志传入，否则封面会被误判成图片。
export function pickDescriptorMedia(descriptor = {}, { isVideo = false } = {}) {
  const types = Array.isArray(descriptor.types) ? descriptor.types : [];
  const videos = types
    .filter((item) => item?.t === "video" && item.b)
    .sort((a, b) => videoRank(b.q) - videoRank(a.q));
  if (isVideo && !videos.length) return null;
  let url = videos[0]?.b;
  const full = types.find((item) => item?.t === 'fullview');
  // Keep unrestricted original files and animated GIFs. Only the evidenced
  // bounded static-image case needs the server's fullview representation.
  if (!url && extensionKind(descriptor.baseUri) === 'photo' &&
      hasBoundedImageToken(descriptor) && (full?.r == null || full.r === 0)) {
    const fullUrl = full?.b ? appendToken(full.b, descriptor.token)
      : full?.c ? buildMediaUrl(descriptor, full.c) : null;
    if (fullUrl) return { kind: 'photo', url: fullUrl,
      ...(!isBlurredUrl(fullUrl) ? { representation: 'fullview' } : {}) };
  }
  if (!url && extensionKind(descriptor.baseUri || "")) url = appendToken(descriptor.baseUri, descriptor.token);
  if (!url) {
    const full = types.find((item) => item?.t === "fullview");
    if (full?.b) url = appendToken(full.b, descriptor.token);
    else if (full?.c) url = buildMediaUrl(descriptor, full.c);
  }
  if (!url) {
    const preview = types.find((item) => item?.t === "preview" && (item.c || item.b));
    if (preview?.b) url = appendToken(preview.b, descriptor.token);
    else if (preview?.c) url = buildMediaUrl(descriptor, preview.c);
  }
  const kind = (url && extensionKind(url)) || (videos.length ? "video" : null);
  return url ? { kind: kind || "photo", url } : null;
}

export function displayMediaUrl(descriptor = {}) {
  const types = Array.isArray(descriptor.types) ? descriptor.types : [];
  for (const name of ["preview", "414W", "375W", "400T", "350T", "300W"]) {
    const type = types.find((item) => item?.t === name);
    if (!type) continue;
    if (type.b) return appendToken(type.b, descriptor.token);
    if (type.c) return buildMediaUrl(descriptor, type.c);
  }
  return null;
}

export function isMatureLoggedOut(deviation = {}) {
  return deviation.isMature === true
    && (deviation.isBlocked === true || Array.isArray(deviation.blockReasons))
    && (deviation.blockReasons || []).includes("mature_loggedout");
}

// 付费/订阅（Premium Folder / tier）作品：DTO 可能带显式字段，也可能只把媒体
// 换成模糊预览。两者都表示「当前账号未订阅、拿不到原图」，与 NSFW 打码不同。
export function isPremiumLocked(deviation = {}) {
  const premium = deviation.premiumFolderData ?? deviation.premium_folder_data;
  if (premium && typeof premium === "object" && premium.hasAccess === false) return true;
  const tier = deviation.tierAccess ?? deviation.tier_access;
  return tier === "locked" || tier === "locked-subscribed";
}

// DeviantArt 对未授权的成熟内容会下发打码版本，URL 里带 blur_ 标记。
// 这是「响应事实」，比任何缓存的会话状态都可靠。
export function isBlurredUrl(value = "") {
  return /blur_/.test(String(value));
}

// 媒体 URL -> 发送类型（GIF 必须走 animation，不能混进 photo 相册）。
export function kindOfUrl(value) {
  if (/\.gif($|\?)/i.test(value)) return "animation";
  if (/\.(?:mp4|m4v|webm|mov|mkv)($|\?)/i.test(value)) return "video";
  return "photo";
}

// 附加页（additionalMedia）是否整体不可用：只看本次响应是否明确说「未登录」。
// 与 mature 主图可用性完全无关——主图由 OAuth 负责。
export function shouldSkipMatureExtras(input = {}) {
  const { isMature, expansionAuthorized = true, raw } = input;
  return isMature === true && expansionAuthorized === false && Array.isArray(raw) && raw.length > 0;
}

// Literature works use `/art/...` URLs and can have no media descriptor. Their
// content is inline tiptap JSON (or legacy HTML), not a downloadable image.
export function extractLiteratureText(deviation = {}) {
  const markup = deviation?.textContent?.html?.markup;
  if (typeof markup !== "string" || !markup.trim()) return "";
  try {
    const doc = JSON.parse(markup);
    const parts = [];
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (typeof node.text === "string") parts.push(node.text);
      if (node.type === "hardBreak") parts.push("\n");
      for (const child of Array.isArray(node.content) ? node.content : []) walk(child);
      if (["paragraph", "bulletList", "orderedList", "blockquote", "codeBlock"].includes(node.type)) parts.push("\n");
    };
    walk(doc);
    return parts.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return markup
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?p(?:\s[^>]*)?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, "> ")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}

function safeFileStem(value = "") {
  const stem = String(value).replace(/[\\/:*?"<>|]+/g, "-").trim();
  return (stem || "literature").slice(0, 80);
}

// 网页 DTO -> 稳定 artwork 模型。
// expansionAuthorized 是「本次响应是否授权了网页端扩展能力」，
// 不参与主图可用性判断：成熟主图由 OAuth 提供，Cookie 缺失只影响附加页。
export function normalizeArtwork(deviation, { sourceUrl, expansionAuthorized = true } = {}) {
  if (!deviation || typeof deviation !== "object") throw new Error("DeviantArt 没有返回作品数据");
  const mature = deviation.isMature === true || deviation.is_mature === true;
  const primaryDescriptor = deviation.media || {};
  const isVideo = deviation.isVideo === true
    || ["video", "film"].includes(String(deviation.type || "").toLowerCase());
  let main = pickDescriptorMedia(primaryDescriptor, { isVideo });
  if (!main) {
    const text = extractLiteratureText(deviation);
    if (isVideo) throw new NetworkError("DeviantArt 视频缺少可播放媒体，回退官方 API");
    if (!text) throw new Error("DeviantArt 作品没有可用媒体");
    main = {
      kind: "document",
      text,
      extension: "txt",
      fileName: safeFileStem(deviation.title),
    };
  }

  const workId = deviation.extended?.deviationUuid
    || String(deviation.deviationId || deviation.deviationid || deviation.id || "");
  const media = [];
  let index = 0;
  media.push({
    assetId: `deviantart:${workId}:p${index}`,
    index,
    kind: main.kind,
    url: main.url ?? null,
    fallbackUrl: main.text ? null : displayMediaUrl(primaryDescriptor),
    mimeType: main.text ? "text/plain" : mimeForKind(main.kind),
    originalAvailable: main.text ? true : !main.representation && !isBlurredUrl(main.url),
    ...(main.representation ? { representation: main.representation } : {}),
    ...(main.text ? {
      content: main.text,
      extension: main.extension,
      fileName: main.fileName,
    } : {}),
  });
  index += 1;

  let skippedMedia = 0;
  const rawExtras = deviation.extended?.additionalMedia;
  if (deviation.isMultiMedia === true) {
    if (shouldSkipMatureExtras({ isMature: mature, expansionAuthorized, raw: rawExtras })) {
      skippedMedia = Array.isArray(rawExtras) ? rawExtras.length : 0;
    } else {
      for (const entry of Array.isArray(rawExtras) ? rawExtras : []) {
        const descriptor = entry && typeof entry === "object" ? entry.media : null;
        const picked = descriptor && pickDescriptorMedia(descriptor);
        if (!picked) continue;
        // 逐条按响应判断：打码的那一页单独跳过，不影响其它页。
        if (mature && isBlurredUrl(picked.url)) {
          skippedMedia += 1;
          continue;
        }
        media.push({
          assetId: `deviantart:${workId}:p${index}`,
          index,
          kind: picked.kind,
          url: picked.url,
          fallbackUrl: displayMediaUrl(descriptor),
          mimeType: mimeForKind(picked.kind),
          originalAvailable: !picked.representation && !isBlurredUrl(picked.url),
          ...(picked.representation ? { representation: picked.representation } : {}),
        });
        index += 1;
      }
    }
  }

  return {
    id: String(deviation.deviationId || deviation.deviationid || deviation.id || ""),
    uuid: deviation.extended?.deviationUuid || null,
    title: deviation.title || "DeviantArt",
    author: deviation.author?.username || null,
    sourceUrl,
    mature,
    premium: isPremiumLocked(deviation),
    expansionAuthorized,
    mainSource: "web",
    media,
    skippedMedia,
  };
}

export function titleWithAuthor(artwork) {
  return artwork.author ? `${artwork.title} — ${artwork.author}` : artwork.title;
}

export function mimeForKind(kind) {
  return { photo: "image/jpeg", video: "video/mp4", animation: "image/gif", document: "application/octet-stream" }[kind] || "application/octet-stream";
}
